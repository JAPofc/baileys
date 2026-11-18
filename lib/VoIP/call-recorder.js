/**
 * lib/VoIP/call-recorder.js
 * Author: J.AP (@japofc/baileys)
 *
 * Minimal, dependency-free WAV recorder. Collects the Float32 PCM chunks
 * emitted by an ActiveCall 'audio' event and writes a canonical 16-bit PCM
 * .wav. The WASM engine doesn't report the playback rate, so 16 kHz mono is the
 * default (the rate the capture path was validated at); pass `sampleRate`
 * explicitly if recordings sound pitched.
 */
import { openSync, writeSync, closeSync } from 'node:fs';

/** Convert a float sample in [-1, 1] to a signed 16-bit integer. */
const toInt16 = (sample) => {
    const s = Math.max(-1, Math.min(1, sample));
    return Math.round(s * (s < 0 ? 0x8000 : 0x7fff));
};

/** Build the 44-byte canonical WAV header (sizes patched on close). */
const buildHeader = (sampleRate, channels) => {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0);
    h.write('WAVE', 8);
    h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); // fmt chunk size
    h.writeUInt16LE(1, 20); // PCM
    h.writeUInt16LE(channels, 22);
    h.writeUInt32LE(sampleRate, 24);
    h.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
    h.writeUInt16LE(channels * 2, 32); // block align
    h.writeUInt16LE(16, 34); // bits per sample
    h.write('data', 36);
    return h;
};

export const createWavRecorder = (filePath, { sampleRate = 16000, channels = 1 } = {}) => {
    if (!filePath || typeof filePath !== 'string') {
        throw new TypeError('createWavRecorder(filePath) requires a file path string');
    }

    const fd = openSync(filePath, 'w');
    writeSync(fd, buildHeader(sampleRate, channels));

    let dataBytes = 0;
    let closed = false;

    return {
        /** Append one Float32Array PCM chunk (interleaved when multi-channel). */
        write(pcm) {
            if (closed) throw new Error('WAV recorder is already closed');
            if (!pcm?.length) return;
            const out = Buffer.allocUnsafe(pcm.length * 2);
            for (let i = 0; i < pcm.length; i++) out.writeInt16LE(toInt16(pcm[i]), i * 2);
            writeSync(fd, out);
            dataBytes += out.length;
        },

        /** Patch the RIFF/data sizes and close. Idempotent. */
        close() {
            if (closed) return;
            closed = true;
            try {
                const sizes = Buffer.alloc(8);
                sizes.writeUInt32LE(36 + dataBytes, 0); // RIFF chunk size
                sizes.writeUInt32LE(dataBytes, 4); // data chunk size
                writeSync(fd, sizes, 0, 4, 4); // patch RIFF size @ offset 4
                writeSync(fd, sizes, 4, 4, 40); // patch data size @ offset 40
            } finally {
                closeSync(fd);
            }
        },

        get bytesWritten() {
            return dataBytes;
        }
    };
};
