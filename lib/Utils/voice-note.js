/**
 * JAP@Add --- Voice-note (PTT) sender.
 *
 * WhatsApp only plays voice notes encoded as mono 16kHz Opus in OGG. This
 * helper converts anything (mp3/wav/m4a/...) via `MediaManager.convertToVoiceNote`
 * unless the input already is OGG, then sends it with `ptt: true`.
 * Duration + waveform are auto-computed by the media pipeline when the optional
 * `audio-decode` / `music-metadata` packages are installed.
 *
 * ```js
 * await sendVoiceNote(sock, jid, './hello.mp3') // path | Buffer | { url }
 * // or: await sock.sendVoiceNote(jid, './hello.mp3')
 * ```
 */
import { Boom } from '@hapi/boom';
import { readFile } from 'node:fs/promises';
const isOggBuffer = (buf) => Buffer.isBuffer(buf) && buf.length > 4 && buf.subarray(0, 4).toString('latin1') === 'OggS';
const resolveAudioBuffer = async (audio) => {
    if (Buffer.isBuffer(audio)) {
        return audio;
    }
    const source = typeof audio === 'string' ? audio : audio?.url;
    if (!source || typeof source !== 'string') {
        throw new Boom('sendVoiceNote audio must be a Buffer, a file path, a URL, or { url }', { statusCode: 400 });
    }
    if (/^https?:\/\//i.test(source)) {
        const res = await fetch(source);
        if (!res.ok) {
            throw new Boom(`sendVoiceNote: fetch failed with HTTP ${res.status}`, { statusCode: 400 });
        }
        return Buffer.from(await res.arrayBuffer());
    }
    try {
        return await readFile(source);
    }
    catch (err) {
        throw new Boom(`sendVoiceNote: cannot read file ${source} (${err?.message || err})`, { statusCode: 400 });
    }
};
/** Build `sendMessage`-ready voice-note content (converts to Opus OGG unless skipped). */
export const buildVoiceNoteContent = async (audio, { convert = true, waveform, seconds, ...passthrough } = {}) => {
    let buf = await resolveAudioBuffer(audio);
    if (convert && !isOggBuffer(buf)) {
        // Dynamic import: Framework is not imported by Socket/Utils statically (cycle-safe).
        const { MediaManager } = await import('../Framework/MediaManager.js');
        buf = await MediaManager.convertToVoiceNote(buf);
    }
    return {
        audio: buf,
        ptt: true,
        mimetype: 'audio/ogg; codecs=opus',
        waveform,
        seconds,
        ...passthrough
    };
};
/** Standalone sender: `sendVoiceNote(sock, jid, audio, opts?)`. A `sock.sendVoiceNote` alias exists too. */
export const sendVoiceNote = async (sock, jid, audio, { convert, waveform, seconds, ...sendOptions } = {}) => {
    if (!sock || typeof sock.sendMessage !== 'function') {
        throw new Boom('sendVoiceNote(sock, ...) requires an active Baileys socket', { statusCode: 400 });
    }
    return sock.sendMessage(jid, await buildVoiceNoteContent(audio, { convert, waveform, seconds }), sendOptions);
};
