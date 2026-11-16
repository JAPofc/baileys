/**
 * JAP@Add --- Meta AI chat helper (EXPERIMENTAL).
 *
 * Sends a prompt to Meta AI's official JID (`13135550002@c.us`, override via
 * `opts.jid` — e.g. the newer `*@bot`) and waits for its reply. Meta AI streams
 * its answer by repeatedly EDITING the same message, so this helper can either
 * return the first bubble (default, one-shot) or wait for the stream to settle
 * and hand back the complete text.
 *
 * This relies on Meta AI being available for the linked account/region — expect
 * timeouts where Meta AI is not rolled out.
 *
 * ```js
 * const { text } = await askMetaAI(sock, 'Jelaskan black hole!')
 * // stream the full answer, printing partial updates as they arrive:
 * const { text } = await askMetaAI(sock, 'Tulis puisi', {
 *   settleMs: 2500,
 *   onUpdate: (partial) => process.stdout.write('\r' + partial)
 * })
 * // or: await sock.askMetaAI('...')
 * ```
 */
import { Boom } from '@hapi/boom';
import { META_AI_JID } from '../WABinary/index.js';
import { normalizeMessageContent } from './messages.js';

/** Meta AI's canonical numeric account. */
export const META_AI_USER = '13135550002';

/** Well-known Meta AI JIDs (the `*@bot` server also identifies WA AI bots). */
export const META_AI_JIDS = [`${META_AI_USER}@c.us`, `${META_AI_USER}@s.whatsapp.net`];

/**
 * True when `jid` addresses Meta AI (or any WhatsApp AI bot on the `@bot`
 * server), device/agent suffixes tolerated.
 */
export const isMetaAIJid = (jid) => {
    if (!jid || typeof jid !== 'string') {
        return false;
    }
    const at = jid.indexOf('@');
    if (at < 0) {
        return false;
    }
    const server = jid.slice(at + 1);
    if (server === 'bot') {
        return true;
    }
    const user = jid.slice(0, at).split(':')[0].split('.')[0];
    return user === META_AI_USER && (server === 'c.us' || server === 's.whatsapp.net' || server === 'lid');
};

/**
 * Pull the plain text out of a Meta AI web message, transparently unwrapping a
 * streamed EDIT (`protocolMessage.editedMessage`). Returns '' when there is no
 * text yet. Exported so callers can reuse the exact extraction logic.
 */
export const extractMetaAIText = (webMessage) => {
    if (!webMessage?.message) {
        return '';
    }
    let content = normalizeMessageContent(webMessage.message);
    const edited = content?.protocolMessage?.editedMessage;
    if (edited) {
        content = normalizeMessageContent(edited) ?? content;
    }
    return content?.conversation
        || content?.extendedTextMessage?.text
        || content?.imageMessage?.caption
        || content?.videoMessage?.caption
        || '';
};

/** The message id a web message edits, if it is a streamed EDIT. */
const editedStanzaId = (webMessage) => {
    const content = normalizeMessageContent(webMessage?.message);
    const pm = content?.protocolMessage;
    // WA edit protocol messages carry the target key + editedMessage.
    if (pm?.editedMessage && pm?.key?.id) {
        return pm.key.id;
    }
    return null;
};

/**
 * Ask Meta AI something. Resolves `{ sent, reply, text }`.
 *
 * Options:
 *   - `timeoutMs` (default 60000): hard cap; rejects with 408 on timeout.
 *   - `jid` (default META_AI_JID): who to ask.
 *   - `settleMs` (default 0): when > 0, keep collecting streamed edits to the
 *     reply and resolve only after this many ms pass with no further update
 *     (or the hard timeout). 0 keeps the classic one-shot behaviour.
 *   - `onUpdate(text, message)`: called on every partial/edited chunk.
 */
export const askMetaAI = async (sock, prompt, { timeoutMs = 60000, jid = META_AI_JID, settleMs = 0, onUpdate } = {}) => {
    if (!sock || typeof sock.sendMessage !== 'function' || typeof sock.ev?.on !== 'function') {
        throw new Boom('askMetaAI(sock, ...) requires an active Baileys socket', { statusCode: 400 });
    }
    if (!prompt || typeof prompt !== 'string') {
        throw new Boom('askMetaAI(prompt) requires a non-empty string', { statusCode: 400 });
    }
    const sent = await sock.sendMessage(jid, { text: prompt });
    const sentId = sent?.key?.id;
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        let replyId = null;      // id of the accepted reply bubble
        let reply = null;        // latest message object for that bubble
        let text = '';           // best text captured so far
        let settleTimer = null;

        const cleanup = () => {
            clearTimeout(hardTimer);
            clearTimeout(settleTimer);
            try { sock.ev.off('messages.upsert', onUpsert); }
            catch { }
        };
        const succeed = () => { cleanup(); resolve({ sent, reply, text }); };
        const fail = (err) => { cleanup(); reject(err); };

        const hardTimer = setTimeout(
            () => (replyId ? succeed() : fail(new Boom('askMetaAI: timed out waiting for Meta AI reply', { statusCode: 408 }))),
            timeoutMs
        );

        const armSettle = () => {
            if (settleMs > 0) {
                clearTimeout(settleTimer);
                settleTimer = setTimeout(succeed, settleMs);
            }
        };

        const accept = (m, nextText) => {
            reply = m;
            if (nextText) {
                text = nextText;
            }
            if (typeof onUpdate === 'function') {
                try { onUpdate(text, m); }
                catch { }
            }
            if (settleMs > 0) {
                armSettle();
            }
            else {
                succeed();
            }
        };

        const onUpsert = ({ messages } = {}) => {
            for (const m of messages || []) {
                if (!m || m.key?.fromMe || m.key?.remoteJid !== jid || !m.message) {
                    continue;
                }
                // Ignore stale history replayed on (re)connect.
                const msgMs = Number(m.messageTimestamp || 0) * 1000;
                if (msgMs && msgMs < startedAt - 5000) {
                    continue;
                }
                const editId = editedStanzaId(m);
                if (replyId) {
                    // Only follow edits to the bubble we already locked onto.
                    if (editId === replyId || m.key?.id === replyId) {
                        accept(m, extractMetaAIText(m));
                    }
                    continue;
                }
                // First fresh message: prefer one that quotes our prompt.
                const quotedId = m.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId && sentId && quotedId !== sentId) {
                    continue;
                }
                replyId = editId || m.key?.id || 'meta-ai-reply';
                accept(m, extractMetaAIText(m));
            }
        };

        sock.ev.on('messages.upsert', onUpsert);
    });
};
