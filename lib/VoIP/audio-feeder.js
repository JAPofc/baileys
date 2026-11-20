/**
 * lib/VoIP/audio-feeder.js
 * Author: J.AP (@japofc/baileys)
 *
 * Decodes an audio `source` to f32le PCM with ffmpeg and meters fixed-size
 * frames to the WASM uplink at real-time cadence. Supports file paths, `lavfi:`
 * generators, in-memory `{ data: Buffer, ext }`, and a silent default. A small
 * warm-up buffer smooths startup; back-pressure pauses ffmpeg when the queue
 * fills; underflows emit silence so the uplink never stalls.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOW_WATERMARK_CHUNKS = 16;
const MAX_QUEUED_CHUNKS = 1024;
const WARMUP_MS = 500;
/** How long a decoder gets to exit on SIGTERM before it is SIGKILLed. */
const KILL_GRACE_MS = 400;

export class AudioFeeder {
    // public counters / config
    sampleRate;
    channels;
    framesPerChunk;
    onChunk;
    source;
    droppedChunks = 0;
    underflowChunks = 0;
    bytesProduced = 0;
    chunksEmitted = 0;

    // internal state
    #proc = null;
    #pending = Buffer.alloc(0);
    #tempFile = null;
    #queue = [];
    #emitTimer = null;
    #nextEmitAtMs = 0;
    #warmupUntilMs = 0;
    #starting = false; // async binary resolution in flight
    #started = false; // start() called, not yet stop()ed (survives decoder death)
    #generation = 0; // bumped on stop() to cancel a pending spawn

    constructor(sampleRate, channels, framesPerChunk, onChunk, source = 'silence') {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.framesPerChunk = framesPerChunk;
        this.onChunk = onChunk;
        this.source = source;
    }

    start = () => {
        if (this.#proc || this.#starting) return;
        this.#started = true;
        this.#starting = true;
        const generation = ++this.#generation;
        // resolve the ffmpeg binary (ffmpeg-static / installer / PATH / env), then spawn
        void import('../Utils/ffmpeg-path.js')
            .then(({ resolveFfmpegPath }) => resolveFfmpegPath())
            .then((bin) => {
                this.#starting = false;
                if (generation === this.#generation) this.#spawnDecoder(bin ?? 'ffmpeg');
            })
            .catch(() => {
                this.#starting = false;
                if (generation === this.#generation) this.#spawnDecoder('ffmpeg');
            });
    };

    /**
     * Swap the audio source mid-stream (greeting → menu → hold music). When
     * running, restarts the decoder with the new source and returns true; when
     * not started, just stores it for the next start() and returns false.
     */
    swapSource = (source) => {
        const wasRunning = this.#started;
        this.source = source;
        if (!wasRunning) return false;
        this.stop();
        this.start();
        return true;
    };

    stop = () => {
        this.#started = false;
        this.#generation += 1; // cancel a spawn still resolving its binary
        this.#starting = false;
        if (this.#emitTimer) {
            clearTimeout(this.#emitTimer);
            this.#emitTimer = null;
        }
        this.#killDecoder();
        this.#pending = Buffer.alloc(0);
        this.#queue = [];
        this.#warmupUntilMs = 0;
        this.#cleanupTempFile();
    };

    /**
     * Tear the decoder down for real.
     *
     * JAP@Fix (§2.107): stop() used to just `kill('SIGTERM')`. Back-pressure pauses the
     * decoder's stdout (see #ingest), so ffmpeg is typically blocked *writing* into a pipe that
     * nobody will ever drain again — it never sees the signal through to exit, the child and its
     * pipes stay open, and the Node process cannot exit (this is exactly what hung `node --test`
     * on a machine that actually has ffmpeg). Now: resume and destroy the pipes first so the
     * write unblocks, SIGTERM, then SIGKILL if it is still around, and unref everything so a
     * feeder nobody stopped can never hold the process open either.
     */
    #killDecoder = () => {
        const proc = this.#proc;
        this.#proc = null;
        if (!proc) {
            return;
        }
        try {
            proc.stdout?.resume();
            proc.stdout?.destroy();
            proc.stderr?.destroy();
            proc.stdin?.destroy();
        }
        catch { /* the pipes may already be gone */ }
        try {
            proc.kill('SIGTERM');
        }
        catch { /* already dead */ }
        const hardKill = setTimeout(() => {
            try {
                if (proc.exitCode === null && proc.signalCode === null) {
                    proc.kill('SIGKILL');
                }
            }
            catch { /* already dead */ }
        }, KILL_GRACE_MS);
        hardKill.unref?.();
        proc.once('exit', () => clearTimeout(hardKill));
        proc.unref?.();
    };

    #cleanupTempFile = () => {
        if (!this.#tempFile) return;
        try { unlinkSync(this.#tempFile); } catch { /* best effort */ }
        this.#tempFile = null;
    };

    /** Build the ffmpeg input args for the current source. */
    #inputArgs = () => {
        if (!this.source || this.source === 'silence') {
            return ['-f', 'lavfi', '-i', `aevalsrc=0:d=3600:s=${this.sampleRate}`];
        }
        if (this.source && typeof this.source === 'object' && Buffer.isBuffer(this.source.data)) {
            const ext = String(this.source.ext || 'ogg').replace(/[^a-z0-9]/gi, '') || 'ogg';
            const tmp = join(tmpdir(), `jap-voip-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`);
            writeFileSync(tmp, this.source.data);
            this.#tempFile = tmp;
            return ['-i', tmp];
        }
        if (typeof this.source === 'string' && this.source.startsWith('lavfi:')) {
            return ['-f', 'lavfi', '-i', this.source.slice('lavfi:'.length)];
        }
        return ['-i', this.source];
    };

    #spawnDecoder = (ffmpegBin) => {
        if (this.#proc) return;
        const chunkSamples = this.framesPerChunk * this.channels;
        const chunkBytes = chunkSamples * Float32Array.BYTES_PER_ELEMENT;
        const chunkIntervalMs = (this.framesPerChunk / this.sampleRate) * 1000;

        this.#proc = spawn(ffmpegBin, [
            '-hide_banner',
            '-loglevel', 'error',
            '-thread_queue_size', '512',
            ...this.#inputArgs(),
            '-f', 'f32le',
            '-ac', String(this.channels),
            '-ar', String(this.sampleRate),
            'pipe:1'
        ]);

        // JAP@Fix (§2.107): a decoder nobody stopped must not keep the bot process alive.
        this.#proc.unref?.();
        this.#proc.stdout.on('data', (chunk) => this.#ingest(chunk, chunkBytes, chunkSamples));
        this.#proc.on('error', (err) => {
            if (err?.code === 'ENOENT') {
                process.stderr.write('[AudioFeeder] ffmpeg binary not found — install ffmpeg to feed call audio (or use audioSource: "silence").\n');
            }
            this.#proc = null;
        });
        this.#proc.stderr.on('data', (chunk) => process.stderr.write(`[AudioFeeder] ${chunk.toString().trim()}\n`));
        this.#proc.on('exit', (code) => {
            // JAP@Fix (§2.107): 255 is what ffmpeg reports when *we* tear it down in stop();
            // printing that as an error made a perfectly normal hang-up look like a failure.
            if (code !== 0 && code !== null && code !== 255 && this.#started) {
                process.stderr.write(`[AudioFeeder] ffmpeg exited with code=${code}\n`);
            }
            this.#proc = null;
        });

        this.#nextEmitAtMs = 0;
        this.#warmupUntilMs = Date.now() + WARMUP_MS;
        this.#scheduleNext(chunkSamples, chunkIntervalMs);
    };

    /** Slice raw ffmpeg output into fixed frames, applying back-pressure. */
    #ingest = (chunk, chunkBytes, chunkSamples) => {
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
    };

    #scheduleNext = (chunkSamples, chunkIntervalMs) => {
        // JAP@Fix (§2.65 / v2.4.8): the metering loop follows the *feeder's* lifetime, not the
        // decoder's. ffmpeg exits as soon as it has finished decoding -- for a short greeting that
        // happens in well under a second, long before the audio has been metered out at real-time
        // cadence. Gating on `#proc` killed the loop right there, so everything still sitting in
        // the queue was dropped and the uplink stalled instead of emitting the silence this module
        // promises. Only stop() ends the loop now.
        if (!this.#started) return;
        const now = Date.now();
        if (this.#nextEmitAtMs === 0) this.#nextEmitAtMs = now;
        const delayMs = Math.max(0, this.#nextEmitAtMs - now);
        this.#emitTimer = setTimeout(() => {
            this.#emitTimer = null;
            // during warm-up, wait for the queue to fill before metering out
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
        let next = this.#queue.shift();
        if (!next) {
            next = new Float32Array(chunkSamples); // underflow → silence
            this.underflowChunks += 1;
        }
        this.chunksEmitted += 1;
        this.onChunk(next);
        if (this.#proc?.stdout.isPaused() && this.#queue.length <= MAX_QUEUED_CHUNKS / 4) {
            this.#proc.stdout.resume();
        }
    };
}
