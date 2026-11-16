/**
 * lib/VoIP/video-feeder.js
 * Author: J.AP (@japofc/baileys)
 *
 * The video sibling of {@link AudioFeeder}: decodes a `source` to raw I420
 * (planar YUV 4:2:0 — the format the WASM video uplink wants) with ffmpeg and
 * meters whole frames out at the requested frame rate. Supports file paths,
 * `lavfi:` generators (`lavfi:testsrc`), in-memory `{ data: Buffer, ext }`, and
 * a black-frame default, so a video call can be fed without any media at all.
 *
 * Back-pressure pauses ffmpeg when the queue fills; an underflow repeats the
 * last frame (or emits black) so the uplink never stalls mid-call.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Pixel format id for planar YUV 4:2:0 — the only format the uplink accepts. */
export const VIDEO_FORMAT_I420 = 0;
const MAX_QUEUED_FRAMES = 60;

/** Bytes in one I420 frame: Y plane + two half-resolution chroma planes. */
export const i420FrameSize = (width, height) => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new TypeError('i420FrameSize(width, height): both must be positive integers');
    }
    if (width % 2 || height % 2) {
        throw new TypeError(`i420FrameSize: I420 needs even dimensions, got ${width}x${height}`);
    }
    return (width * height * 3) / 2;
};

export class VideoFeeder {
    width;
    height;
    frameRate;
    onFrame;
    source;
    framesEmitted = 0;
    droppedFrames = 0;
    underflowFrames = 0;
    bytesProduced = 0;

    #proc = null;
    #pending = Buffer.alloc(0);
    #queue = [];
    #timer = null;
    #tempFile = null;
    #started = false;
    #starting = false;
    #generation = 0;
    #lastFrame = null;

    constructor(width, height, frameRate, onFrame, source = 'black') {
        if (typeof onFrame !== 'function') {
            throw new TypeError('new VideoFeeder(width, height, frameRate, onFrame): onFrame must be a function');
        }
        if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 60) {
            throw new TypeError(`new VideoFeeder: frameRate must be between 1 and 60, got ${frameRate}`);
        }
        this.frameSize = i420FrameSize(width, height);
        this.width = width;
        this.height = height;
        this.frameRate = frameRate;
        this.onFrame = onFrame;
        this.source = source;
    }

    /** One all-black I420 frame of this feeder's size. */
    blackFrame = () => {
        const frame = Buffer.alloc(this.frameSize, 0x80); // chroma neutral
        frame.fill(0x10, 0, this.width * this.height); // luma "black" (studio range)
        return frame;
    };

    #inputArgs = () => {
        const source = this.source;
        if (!source || source === 'black') {
            return ['-f', 'lavfi', '-i', `color=c=black:s=${this.width}x${this.height}:r=${this.frameRate}`];
        }
        if (typeof source === 'string' && source.startsWith('lavfi:')) {
            return ['-f', 'lavfi', '-i', source.slice('lavfi:'.length)];
        }
        if (typeof source === 'object' && source?.data) {
            const file = join(tmpdir(), `jap-video-${randomBytes(6).toString('hex')}.${source.ext || 'mp4'}`);
            writeFileSync(file, source.data);
            this.#tempFile = file;
            return ['-re', '-i', file];
        }
        return ['-re', '-i', String(source)];
    };

    start = () => {
        if (this.#proc || this.#starting) {
            return;
        }
        this.#started = true;
        this.#starting = true;
        const generation = ++this.#generation;
        void import('../Utils/ffmpeg-path.js')
            .then(({ resolveFfmpegPath }) => resolveFfmpegPath())
            .then(binary => {
                this.#starting = false;
                if (!this.#started || generation !== this.#generation) {
                    return; // stopped while we were resolving
                }
                this.#spawn(binary || 'ffmpeg');
            })
            .catch(() => {
                this.#starting = false;
            })
            .finally(() => {
                if (this.#started && !this.#timer) {
                    this.#startClock();
                }
            });
    };

    #spawn = (binary) => {
        const args = [
            '-hide_banner', '-loglevel', 'error',
            ...this.#inputArgs(),
            '-pix_fmt', 'yuv420p',
            '-s', `${this.width}x${this.height}`,
            '-r', String(this.frameRate),
            '-f', 'rawvideo', 'pipe:1'
        ];
        try {
            this.#proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        }
        catch {
            this.#proc = null;
            return;
        }
        this.#proc.stdout.on('data', chunk => this.#ingest(chunk));
        this.#proc.on('error', () => { this.#proc = null; });
        this.#proc.on('close', () => { this.#proc = null; });
    };

    #ingest = (chunk) => {
        this.bytesProduced += chunk.length;
        this.#pending = this.#pending.length ? Buffer.concat([this.#pending, chunk]) : chunk;
        while (this.#pending.length >= this.frameSize) {
            const frame = this.#pending.subarray(0, this.frameSize);
            this.#pending = this.#pending.subarray(this.frameSize);
            if (this.#queue.length >= MAX_QUEUED_FRAMES) {
                this.droppedFrames++;
                this.#proc?.stdout?.pause?.();
                continue;
            }
            this.#queue.push(Buffer.from(frame));
        }
    };

    #startClock = () => {
        const intervalMs = 1000 / this.frameRate;
        this.#timer = setInterval(() => {
            let frame = this.#queue.shift();
            if (!frame) {
                this.underflowFrames++;
                frame = this.#lastFrame ?? this.blackFrame();
            }
            else if (this.#queue.length < MAX_QUEUED_FRAMES / 2) {
                this.#proc?.stdout?.resume?.();
            }
            this.#lastFrame = frame;
            this.framesEmitted++;
            try {
                this.onFrame(frame, { width: this.width, height: this.height, format: VIDEO_FORMAT_I420 });
            }
            catch { /* a throwing consumer must not kill the uplink */ }
        }, intervalMs);
        this.#timer.unref?.();
    };

    /** Swap the source mid-call (restarts ffmpeg, keeps the clock running). */
    setSource = (source) => {
        this.source = source;
        if (!this.#started) {
            return false;
        }
        this.#killProc();
        this.#starting = false;
        this.#generation++;
        this.start();
        return true;
    };

    #killProc = () => {
        try {
            this.#proc?.kill('SIGKILL');
        }
        catch { /* already gone */ }
        this.#proc = null;
        this.#pending = Buffer.alloc(0);
        this.#queue = [];
        if (this.#tempFile) {
            try {
                unlinkSync(this.#tempFile);
            }
            catch { /* best effort */ }
            this.#tempFile = null;
        }
    };

    stop = () => {
        this.#started = false;
        this.#generation++;
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
        this.#killProc();
        this.#lastFrame = null;
    };

    /** Counters, for logging a call's video health. */
    getStats = () => ({
        framesEmitted: this.framesEmitted,
        droppedFrames: this.droppedFrames,
        underflowFrames: this.underflowFrames,
        bytesProduced: this.bytesProduced,
        queued: this.#queue.length,
        running: !!this.#proc
    });
}
