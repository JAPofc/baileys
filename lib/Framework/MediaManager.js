/**
 * lib/Framework/MediaManager.js
 * Author: J.AP (@japofc/baileys)
 *
 * Media conversion helpers: image/video → WebP sticker (with optional
 * packname/author EXIF), audio → OGG/Opus voice note.
 *
 * `fluent-ffmpeg` is an optional peer dep, loaded lazily and pointed at the
 * auto-detected ffmpeg binary (see Utils/ffmpeg-path.js). Sticker EXIF is
 * written by the pure-JS RIFF muxer in Utils/sticker-exif.js — no native
 * webp dependency, works on Termux too. Conversions are bounded by a
 * wall-clock timeout and an input-size cap so a hostile/corrupt input can't
 * hang the process forever.
 */
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let _ffmpeg;
const getFfmpeg = async () => {
    if (_ffmpeg === undefined) {
        _ffmpeg = await import('fluent-ffmpeg').then((m) => m.default ?? m).catch(() => null);
        if (_ffmpeg) {
            try {
                const { resolveFfmpegPath } = await import('../Utils/ffmpeg-path.js');
                const bin = await resolveFfmpegPath();
                if (bin && bin !== 'ffmpeg') _ffmpeg.setFfmpegPath(bin);
            } catch { /* fall back to fluent-ffmpeg's own PATH lookup */ }
        }
    }
    if (!_ffmpeg) {
        throw new Error('fluent-ffmpeg is required for sticker/voice-note conversion. Install it with: npm i fluent-ffmpeg');
    }
    return _ffmpeg;
};

export class MediaManager {
    static ffmpegTimeoutMs = 60_000;
    static maxInputBytes = 64 * 1024 * 1024;

    static _assertInputSize(bytes) {
        const cap = MediaManager.maxInputBytes;
        if (cap > 0 && bytes > cap) {
            throw new Error(`media input is ${bytes} bytes — exceeds MediaManager.maxInputBytes (${cap}). Raise the cap explicitly if this is intentional.`);
        }
    }

    /** Run a fluent-ffmpeg command with a SIGKILL timeout guard. */
    static _runFfmpeg(command) {
        return new Promise((resolve, reject) => {
            const timeoutMs = MediaManager.ffmpegTimeoutMs;
            let timer = null;
            const settle = (fn) => (arg) => {
                if (timer) { clearTimeout(timer); timer = null; }
                fn(arg);
            };
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timer = null;
                    try { command.kill('SIGKILL'); } catch { /* already gone */ }
                    reject(new Error(`ffmpeg conversion exceeded ${timeoutMs}ms (MediaManager.ffmpegTimeoutMs) and was killed`));
                }, timeoutMs);
                timer.unref?.();
            }
            command.on('end', settle(() => resolve())).on('error', settle((err) => reject(err))).run();
        });
    }

    static getTempFile(ext) {
        return path.join(os.tmpdir(), `baileys-fw-${randomBytes(8).toString('hex')}.${ext}`);
    }

    /** Materialise input (buffer or path) into a temp file, enforcing the size cap. */
    static async _stageInput(inputPathOrBuffer, tempInput) {
        if (Buffer.isBuffer(inputPathOrBuffer)) {
            MediaManager._assertInputSize(inputPathOrBuffer.byteLength);
            await fs.promises.writeFile(tempInput, inputPathOrBuffer);
        } else {
            MediaManager._assertInputSize((await fs.promises.stat(inputPathOrBuffer)).size);
            await fs.promises.copyFile(inputPathOrBuffer, tempInput);
        }
    }

    /**
     * Convert an image or video into a 512×512 WebP sticker. When
     * packname/author metadata is provided, EXIF is written by the pure-JS muxer.
     */
    static async convertToSticker(inputPathOrBuffer, metadata) {
        const ffmpegLib = await getFfmpeg();
        const tempInput = MediaManager.getTempFile('in');
        const tempOutput = MediaManager.getTempFile('webp');
        try {
            await MediaManager._stageInput(inputPathOrBuffer, tempInput);
            await MediaManager._runFfmpeg(
                ffmpegLib(tempInput)
                    .outputOptions([
                        '-vcodec', 'libwebp',
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0',
                        '-loop', '0',
                        '-preset', 'default',
                        '-an', '-vsync', '0',
                        '-t', '00:00:05'
                    ])
                    .output(tempOutput)
            );
            const webp = await fs.promises.readFile(tempOutput);
            if (metadata?.packname || metadata?.author) {
                const { setStickerExif } = await import('../Utils/sticker-exif.js');
                return setStickerExif(webp, {
                    packName: metadata.packname || '',
                    author: metadata.author || '',
                    emojis: metadata.emojis || ['🤖']
                });
            }
            return webp;
        } finally {
            await fs.promises.unlink(tempInput).catch(() => { });
            await fs.promises.unlink(tempOutput).catch(() => { });
        }
    }

    /** Convert audio into a mono 16 kHz OGG/Opus voice note (WA PTT format). */
    static async convertToVoiceNote(inputPathOrBuffer) {
        const ffmpegLib = await getFfmpeg();
        const tempInput = MediaManager.getTempFile('in');
        const tempOutput = MediaManager.getTempFile('ogg');
        try {
            await MediaManager._stageInput(inputPathOrBuffer, tempInput);
            await MediaManager._runFfmpeg(
                ffmpegLib(tempInput)
                    .inputOptions(['-y'])
                    .outputOptions([
                        '-c:a', 'libopus',
                        '-ac', '1',
                        '-ar', '16000',
                        '-application', 'voip',
                        '-b:a', '32k',
                        '-compression_level', '10',
                        '-vbr', 'on'
                    ])
                    .format('ogg')
                    .output(tempOutput)
            );
            return await fs.promises.readFile(tempOutput);
        } finally {
            await fs.promises.unlink(tempInput).catch(() => { });
            await fs.promises.unlink(tempOutput).catch(() => { });
        }
    }
}
