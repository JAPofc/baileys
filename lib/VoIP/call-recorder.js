/**
 * JAP@Add --- minimal WAV recorder for VoIP inbound audio.
 *
 * Collects the Float32 PCM chunks emitted as ActiveCall 'audio' events and
 * writes a standard 16-bit PCM .wav file. Zero dependencies.
 *
 * NOTE: the WASM engine does not report the playback sample rate; 16000 Hz
 * mono matches the capture path it was tested against. If recordings sound
 * pitched up/down, pass the correct `sampleRate` explicitly.
 */
import { openSync, writeSync, closeSync } from 'node:fs';
const clampToInt16 = (sample) => {
    const s = Math.max(-1, Math.min(1, sample));
    return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
};
export const createWavRecorder = (filePath, { sampleRate = 16000, channels = 1 } = {}) => {
    if (!filePath || typeof filePath !== 'string') {
        throw new TypeError('createWavRecorder(filePath) requires a file path string');
    }
    const fd = openSync(filePath, 'w');
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM fmt chunk size
    header.writeUInt16LE(1, 20); // audio format = PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
    header.writeUInt16LE(channels * 2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write('data', 36);
    writeSync(fd, header);
    let dataBytes = 0;
    let closed = false;
    return {
        /** Append one Float32Array PCM chunk (interleaved if multi-channel). */
        write(pcm) {
            if (closed) {
                throw new Error('WAV recorder is already closed');
            }
            if (!pcm?.length) {
                return;
            }
            const out = Buffer.allocUnsafe(pcm.length * 2);
            for (let i = 0; i < pcm.length; i++) {
                out.writeInt16LE(clampToInt16(pcm[i]), i * 2);
            }
            writeSync(fd, out);
            dataBytes += out.length;
        },
        /** Finalize sizes in the header and close the file. Safe to call twice. */
        close() {
            if (closed) {
                return;
            }
            closed = true;
            try {
                const sizes = Buffer.alloc(8);
                sizes.writeUInt32LE(36 + dataBytes, 0); // RIFF chunk size
                sizes.writeUInt32LE(dataBytes, 4); // data chunk size
                writeSync(fd, sizes, 0, 4, 4);
                writeSync(fd, sizes, 4, 4, 40);
            }
            finally {
                closeSync(fd);
            }
        },
        get bytesWritten() {
            return dataBytes;
        }
    };
};
