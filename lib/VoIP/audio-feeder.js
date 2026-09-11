/**
 * Audio feeder.
 *
 * Spawns ffmpeg to decode `source` into f32le PCM at the requested rate, then
 * meters frames out at chunk-cadence to the WASM uplink.
 *
 * @author J.AP
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const LOW_WATERMARK_CHUNKS = 16;
const MAX_QUEUED_CHUNKS = 1024;
const DEFAULT_WARMUP_MS = 500;
export class AudioFeeder {
    sampleRate;
    channels;
    framesPerChunk;
    onChunk;
    source;
    #proc = null;
    #pending = Buffer.alloc(0);
    #tempFile = null; // JAP@Add --- temp copy for { data: Buffer } sources
    #queue = [];
    #emitTimer = null;
    #nextEmitAtMs = 0;
    #warmupUntilMs = 0;
    #starting = false; // JAP@Add --- async binary resolution in progress
    #generation = 0; // JAP@Add --- invalidates pending spawns on stop()
    droppedChunks = 0;
    underflowChunks = 0;
    bytesProduced = 0;
    chunksEmitted = 0;
    constructor(sampleRate, channels, framesPerChunk, onChunk, source = "silence") {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.framesPerChunk = framesPerChunk;
        this.onChunk = onChunk;
        this.source = source;
    }
    start = () => {
        if (this.#proc || this.#starting)
            return;
        // JAP@Add --- resolve the binary first (ffmpeg-static / installer /
        // system PATH / FFMPEG_PATH); spawn happens as soon as it resolves.
        // A stop() before resolution completes cancels the pending spawn.
        this.#starting = true;
        const generation = ++this.#generation;
        void import("../Utils/ffmpeg-path.js")
            .then(({ resolveFfmpegPath }) => resolveFfmpegPath())
            .then((bin) => {
            this.#starting = false;
            if (generation !== this.#generation)
                return; // stopped while resolving
            this.#startWithBinary(bin ?? "ffmpeg");
        })
            .catch(() => {
            this.#starting = false;
            if (generation === this.#generation)
                this.#startWithBinary("ffmpeg");
        });
    };
    #startWithBinary = (ffmpegBin) => {
        if (this.#proc)
            return;
        const chunkSamples = this.framesPerChunk * this.channels;
        const chunkBytes = chunkSamples * Float32Array.BYTES_PER_ELEMENT;
        const chunkIntervalMs = (this.framesPerChunk / this.sampleRate) * 1000;
        const inputArgs = this.#resolveInputArgs();
        this.#proc = spawn(ffmpegBin, [
            "-hide_banner",
            "-loglevel", "error",
            "-thread_queue_size", "512",
            ...inputArgs,
            "-f", "f32le",
            "-ac", String(this.channels),
            "-ar", String(this.sampleRate),
            "pipe:1",
        ]);
        this.#proc.stdout.on("data", (chunk) => {
            this.#pending = Buffer.concat([this.#pending, chunk]);
            while (this.#pending.length >= chunkBytes) {
                if (this.#queue.length >= MAX_QUEUED_CHUNKS) {
                    this.#proc?.stdout.pause();
                    break;
                }
                const frame = this.#pending.subarray(0, chunkBytes);
                this.#pending = this.#pending.subarray(chunkBytes);
                const out = new Float32Array(chunkSamples);
                out.set(new Float32Array(frame.buffer, frame.byteOffset, chunkSamples));
                this.bytesProduced += chunkBytes;
                this.#queue.push(out);
            }
        });
        // JAP@Add --- clear error when ffmpeg is not installed
        this.#proc.on("error", (err) => {
            if (err?.code === "ENOENT") {
                process.stderr.write('[AudioFeeder] ffmpeg binary not found — install ffmpeg to feed call audio (or use audioSource: "silence").\n');
            }
            this.#proc = null;
        });
        this.#proc.stderr.on("data", (chunk) => {
            process.stderr.write(`[AudioFeeder] ${chunk.toString().trim()}\n`);
        });
        this.#proc.on("exit", (code) => {
            if (code !== 0 && code !== null) {
                process.stderr.write(`[AudioFeeder] ffmpeg exited with code=${code}\n`);
            }
            this.#proc = null;
        });
        this.#nextEmitAtMs = 0;
        this.#warmupUntilMs = Date.now() + DEFAULT_WARMUP_MS;
        this.#scheduleNext(chunkSamples, chunkIntervalMs);
    };
    stop = () => {
        this.#generation += 1; // cancel any spawn still resolving its binary
        this.#starting = false;
        if (this.#emitTimer) {
            clearTimeout(this.#emitTimer);
            this.#emitTimer = null;
        }
        this.#proc?.kill("SIGTERM");
        this.#proc = null;
        this.#pending = Buffer.alloc(0);
        this.#queue = [];
        this.#warmupUntilMs = 0;
        // JAP@Add --- remove temp file created for Buffer sources
        if (this.#tempFile) {
            try {
                unlinkSync(this.#tempFile);
            }
            catch { }
            this.#tempFile = null;
        }
    };
    #resolveInputArgs = () => {
        if (!this.source || this.source === "silence") {
            return ["-f", "lavfi", "-i", `aevalsrc=0:d=3600:s=${this.sampleRate}`];
        }
        // JAP@Add --- in-memory audio: { data: Buffer, ext: 'mp3' } via temp file
        if (this.source && typeof this.source === "object" && Buffer.isBuffer(this.source.data)) {
            const ext = String(this.source.ext || "ogg").replace(/[^a-z0-9]/gi, "") || "ogg";
            const tmp = join(tmpdir(), `jap-voip-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`);
            writeFileSync(tmp, this.source.data);
            this.#tempFile = tmp;
            return ["-i", tmp];
        }
        if (typeof this.source === "string" && this.source.startsWith("lavfi:")) {
            return ["-f", "lavfi", "-i", this.source.slice("lavfi:".length)];
        }
        return ["-i", this.source];
    };
    #scheduleNext = (chunkSamples, chunkIntervalMs) => {
        if (!this.#proc)
            return;
        const now = Date.now();
        if (this.#nextEmitAtMs === 0)
            this.#nextEmitAtMs = now;
        const delayMs = Math.max(0, this.#nextEmitAtMs - now);
        this.#emitTimer = setTimeout(() => {
            this.#emitTimer = null;
            if (this.#queue.length < LOW_WATERMARK_CHUNKS && Date.now() < this.#warmupUntilMs) {
                this.#nextEmitAtMs = Date.now() + 10;
                this.#scheduleNext(chunkSamples, chunkIntervalMs);
                return;
            }
            this.#flushOne(chunkSamples);
            this.#nextEmitAtMs += chunkIntervalMs;
            this.#scheduleNext(chunkSamples, chunkIntervalMs);
        }, delayMs);
    };
    #flushOne = (chunkSamples) => {
        let nextChunk = this.#queue.shift();
        if (!nextChunk) {
            nextChunk = new Float32Array(chunkSamples);
            this.underflowChunks += 1;
        }
        this.chunksEmitted += 1;
        this.onChunk(nextChunk);
        if (this.#proc?.stdout.isPaused() && this.#queue.length <= MAX_QUEUED_CHUNKS / 4) {
            this.#proc.stdout.resume();
        }
    };
}
