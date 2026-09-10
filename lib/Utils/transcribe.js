/**
 * JAP@Add --- voice-note transcription with pluggable providers.
 *
 * WhatsApp generates transcripts on-device only — there is no transcript API
 * on the wire. So this module downloads the voice note and hands it to a
 * *provider function* you choose: any `(audioBuffer, { mimetype }) => { text }`.
 * Ships with an OpenAI-compatible Whisper provider; bring your own for local
 * models (faster-whisper sidecar, etc).
 *
 * ```js
 * import { transcribeMessage, openAIWhisperProvider } from '@j.ap/baileys'
 * const provider = openAIWhisperProvider({ apiKey: process.env.OPENAI_API_KEY })
 * sock.ev.on('messages.upsert', async ({ messages }) => {
 *   for (const m of messages) {
 *     if (m.message?.audioMessage?.ptt) console.log(await transcribeMessage(sock, m, { provider }))
 *   }
 * })
 * ```
 */
import { Boom } from '@hapi/boom';
import { downloadContentFromMessage } from './messages-media.js';

const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

const needProvider = (provider) => {
    if (typeof provider !== 'function') {
        throw new Boom('transcription needs { provider } — see customProvider() / openAIWhisperProvider()', { statusCode: 400 });
    }
};

/** Wrap any async `(audioBuffer, meta) => { text } | string` fn into a provider. */
export const customProvider = (fn) => {
    if (typeof fn !== 'function') {
        throw new Boom('customProvider(fn) needs a function', { statusCode: 400 });
    }
    return async (audio, meta = {}) => {
        const res = await fn(audio, meta);
        const text = typeof res === 'string' ? res : res?.text;
        if (!text || typeof text !== 'string') {
            throw new Boom('transcription provider returned no text', { statusCode: 502 });
        }
        return { text };
    };
};

/** OpenAI-compatible `/v1/audio/transcriptions` endpoint (cloud or local clone). */
export const openAIWhisperProvider = ({ apiKey, model = 'whisper-1', baseUrl = 'https://api.openai.com/v1', language, fileName = 'voice.ogg' } = {}) => {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Boom('openAIWhisperProvider needs { apiKey }', { statusCode: 400 });
    }
    return async (audio, { mimetype = 'audio/ogg' } = {}) => {
        const form = new FormData();
        form.append('model', model);
        form.append('file', new Blob([audio], { type: mimetype }), fileName);
        if (language) {
            form.append('language', language);
        }
        const res = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form
        });
        if (!res.ok) {
            throw new Boom(`transcription failed: HTTP ${res.status}`, { statusCode: 502 });
        }
        const { text } = await res.json();
        if (!text || typeof text !== 'string') {
            throw new Boom('transcription endpoint returned no text', { statusCode: 502 });
        }
        return { text };
    };
};

/** Transcribe a raw audio buffer with any provider. */
export const transcribeAudio = async (audio, { provider, mimetype } = {}) => {
    if (!Buffer.isBuffer(audio) || !audio.length) {
        throw new Boom('transcribeAudio(audio) needs a non-empty audio Buffer', { statusCode: 400 });
    }
    needProvider(provider);
    return provider(audio, { mimetype });
};

/**
 * Download + transcribe a voice-note/audio WAMessage.
 * `download` override exists for tests (default hits the WA media CDN).
 */
export const transcribeMessage = async (sock, webMessage, { provider, download } = {}) => {
    const audio = webMessage?.message?.audioMessage;
    if (!audio?.mediaKey) {
        throw new Boom('transcribeMessage needs a voice-note/audio WAMessage', { statusCode: 400 });
    }
    needProvider(provider);
    const dl = download || ((keys) => downloadContentFromMessage(keys, 'audio', {}));
    const stream = await dl({ mediaKey: audio.mediaKey, directPath: audio.directPath, url: audio.url });
    const buf = await streamToBuffer(stream);
    const { text } = await provider(buf, { mimetype: audio.mimetype });
    if (!text || typeof text !== 'string') {
        throw new Boom('transcription provider returned no text', { statusCode: 502 });
    }
    return { text, seconds: audio.seconds ?? null, ptt: audio.ptt ?? false };
};
