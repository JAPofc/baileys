/**
 * JAP@Add --- everyday text/JID parsing helpers + broadcast sender.
 *
 * Three gaps every prefix-bot ends up hand-rolling:
 *
 *   parseMentions(text)            '@62812… halo @62813…' -> ['62812…@s.whatsapp.net', …]
 *   extractGroupInviteCode(link)   any chat.whatsapp.com URL/text -> 'AbCdEf123' (or null)
 *   sendBroadcast(sock, jids, …)   send one message to many jids with pacing +
 *                                  per-jid results (never throws mid-run)
 *
 * All pure logic is dependency-free and fully unit-tested; sendBroadcast only
 * needs a `sock.sendMessage` and works with any composed socket.
 *
 * @author J.AP
 */

const MENTION_RE = /@(\d{5,20})/g;
const INVITE_RE = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{16,32})/;

/**
 * Extract `@<number>` mentions from message text.
 * Returns full jids, de-duplicated, in order of first appearance.
 *
 *   parseMentions('hi @6281234567 and @6289876543 (and @6281234567 again)')
 *   // ['6281234567@s.whatsapp.net', '6289876543@s.whatsapp.net']
 *
 * Pair it with sendMessage:
 *   await sock.sendMessage(jid, { text, mentions: parseMentions(text) })
 */
export const parseMentions = (text) => {
    if (typeof text !== 'string' || !text) return [];
    const seen = new Set();
    const out = [];
    for (const m of text.matchAll(MENTION_RE)) {
        const jid = `${m[1]}@s.whatsapp.net`;
        if (!seen.has(jid)) {
            seen.add(jid);
            out.push(jid);
        }
    }
    return out;
};

/**
 * Pull the invite code out of a WhatsApp group link (or any text containing
 * one). Accepts with/without protocol, with/without `invite/`, trailing
 * slashes/query strings, and surrounding text. Returns null when absent.
 *
 *   extractGroupInviteCode('https://chat.whatsapp.com/AbCdEfGh12345678')
 *   // 'AbCdEfGh12345678'
 */
export const extractGroupInviteCode = (link) => {
    if (typeof link !== 'string' || !link) return null;
    const m = link.match(INVITE_RE);
    return m ? m[1] : null;
};

/**
 * Join a group straight from an invite link (or bare code).
 * Thin wrapper: extractGroupInviteCode + sock.groupAcceptInvite.
 * Throws if no code can be found in the input.
 */
export const joinGroupViaLink = async (sock, linkOrCode) => {
    const code = extractGroupInviteCode(linkOrCode) ??
        (/^[0-9A-Za-z]{16,32}$/.test(String(linkOrCode ?? '')) ? String(linkOrCode) : null);
    if (!code) {
        throw new Error(`joinGroupViaLink: no invite code found in ${JSON.stringify(linkOrCode)}`);
    }
    return sock.groupAcceptInvite(code);
};

/**
 * Send one message to many jids with pacing and per-jid outcomes.
 * NEVER throws mid-run: every jid gets attempted, failures are collected.
 *
 *   const report = await sendBroadcast(sock, jids, { text: 'hi' }, {
 *       delayMs: 1200,                       // pause between sends (default 1000)
 *       onProgress: ({ jid, index, total, ok }) => {},
 *   })
 *   // { sent: [...jids], failed: [{ jid, error }], total }
 *
 * Notes: pacing matters — WhatsApp rate-limits bulk sends; keep delayMs >= 1000
 * and prefer sending to users who have messaged you first (anti-spam).
 */
export const sendBroadcast = async (sock, jids, content, options = {}) => {
    const { delayMs = 1000, onProgress, sendOptions = {} } = options;
    if (!Array.isArray(jids) || jids.length === 0) {
        throw new Error('sendBroadcast: jids must be a non-empty array');
    }
    if (!content || typeof content !== 'object') {
        throw new Error('sendBroadcast: content must be a message content object (e.g. { text })');
    }
    const sent = [];
    const failed = [];
    const total = jids.length;
    for (let i = 0; i < total; i++) {
        const jid = jids[i];
        let ok = true;
        try {
            await sock.sendMessage(jid, content, sendOptions);
            sent.push(jid);
        } catch (error) {
            ok = false;
            failed.push({ jid, error });
        }
        try {
            onProgress?.({ jid, index: i, total, ok });
        } catch { /* progress callback must never break the run */ }
        if (i < total - 1 && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    return { sent, failed, total };
};
