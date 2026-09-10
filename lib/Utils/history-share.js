/**
 * JAP@Add --- client-side group "history sharing" for new members.
 *
 * WhatsApp's native history-sharing wire format hasn't been captured by any
 * public library, so this helper implements the same *outcome* with public
 * primitives: it forwards the group's recent messages into each new member's
 * DM (optionally with a greeting), with a polite delay between forwards.
 *
 * ```js
 * import { shareGroupHistory, getGroupHistoryFromStore } from '@j.ap/baileys'
 * const messages = getGroupHistoryFromStore(store, groupJid, 10)
 * await shareGroupHistory(sock, { groupJid, members: ['62812@s.whatsapp.net'], messages })
 * ```
 */
import { Boom } from '@hapi/boom';
import { copyNForward } from './chat-history-helpers.js';
import { delay } from './generics.js';

/** Pull the last-N cached messages for a group out of an in-memory store. */
export const getGroupHistoryFromStore = (store, groupJid, limit = 10) => {
    if (!groupJid) {
        throw new Boom('getGroupHistoryFromStore(store, groupJid) needs a group JID', { statusCode: 400 });
    }
    const bucket = store?.messages?.[groupJid];
    const arr = Array.isArray(bucket) ? bucket : bucket?.array || [];
    if (!arr.length) {
        throw new Boom(`no cached messages for ${groupJid} (store empty or not bound?)`, { statusCode: 404 });
    }
    return arr.slice(-Math.max(1, limit));
};

/**
 * Forward recent group history to new members' DMs.
 * Returns `{ groupJid, members, perMember, sent, failed }`.
 */
export const shareGroupHistory = async (sock, { groupJid, members, messages = [], limit = 10, greeting, delayMs = 1200, forceForward = false } = {}) => {
    if (!sock || typeof sock.sendMessage !== 'function') {
        throw new Boom('shareGroupHistory(sock, ...) requires an active socket', { statusCode: 400 });
    }
    if (!groupJid || typeof groupJid !== 'string') {
        throw new Boom('shareGroupHistory needs { groupJid }', { statusCode: 400 });
    }
    const targets = Array.isArray(members) ? members : [members];
    if (!targets.length || targets.some((m) => typeof m !== 'string' || !m)) {
        throw new Boom('shareGroupHistory needs { members } (JID string or array)', { statusCode: 400 });
    }
    if (!Array.isArray(messages) || !messages.length) {
        throw new Boom('shareGroupHistory needs { messages } (recent group WebMessages)', { statusCode: 400 });
    }
    const slice = messages.slice(-Math.max(1, limit));
    const out = { groupJid, members: targets, perMember: slice.length, sent: 0, failed: [] };
    for (const member of targets) {
        try {
            if (greeting) {
                await sock.sendMessage(member, { text: typeof greeting === 'string' ? greeting : `Recent history from ${groupJid} 👇` });
            }
            for (const msg of slice) {
                await copyNForward(sock, member, msg, forceForward);
                if (delayMs > 0) {
                    await delay(delayMs);
                }
            }
            out.sent += 1;
        }
        catch (err) {
            out.failed.push({ member, error: err?.message || String(err) });
        }
    }
    return out;
};
