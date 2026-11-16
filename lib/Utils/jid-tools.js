/**
 * JAP@Add --- JID helpers: LID ↔ phone-number resolution.
 *
 * Since WhatsApp's LID migration, events (call offers, group updates, ...) often
 * carry only an opaque `@lid` JID. These helpers resolve it to a phone number
 * through the socket's signal-repository mapping (cached + USYNC-backed).
 *
 * ```js
 * await getPhoneNumber(sock, '123456@lid') // → '62812xxxx' | null
 * await getLidForPhone(sock, '62812xxxx')  // → '123456@lid' | null
 * // or: sock.getPhoneNumber(jid), sock.getLidForPhone(phone)
 * ```
 */
import { Boom } from '@hapi/boom';
import {
    isJidBroadcast, isJidGroup, isJidMetaAI, isJidNewsletter,
    isLidUser, isPnUser, isHostedLidUser, isHostedPnUser, jidDecode, jidEncode, jidNormalizedUser
} from '../WABinary/index.js';
import { normalizeMessageContent } from './messages.js';
/** Resolve any JID to a phone-number string. Returns `null` when unresolvable (never throws for that). */
export const getPhoneNumber = async (sock, jid) => {
    if (typeof jid !== 'string' || !jid.includes('@')) {
        throw new Boom('getPhoneNumber(jid) requires a JID string', { statusCode: 400 });
    }
    let decoded;
    try {
        decoded = jidDecode(jid);
    }
    catch {
        throw new Boom(`getPhoneNumber: invalid JID ${jid}`, { statusCode: 400 });
    }
    const { user, server } = decoded;
    if (server === 's.whatsapp.net') {
        return user;
    }
    if (server === 'lid') {
        const store = sock?.signalRepository?.lidMapping;
        if (!store || typeof store.getPNForLID !== 'function') {
            throw new Boom('getPhoneNumber: LID resolution needs an active socket', { statusCode: 400 });
        }
        try {
            const pn = await store.getPNForLID(`${user}@lid`);
            return typeof pn === 'string' && pn.includes('@') ? pn.split('@')[0] : null;
        }
        catch {
            return null; // best-effort: offline/USYNC failure → unknown, not fatal
        }
    }
    return null; // groups, channels, status, bots have no phone number
};
/**
 * Resolve an incoming message's sender to a phone number.
 * One-liner fix for LID-only events (e.g. call offers without `caller_pn`):
 * `await sock.resolveSenderPn(msg)` → `'62812…'` | `null`.
 */
export const resolveSenderPn = async (sock, webMessage) => {
    const sender = webMessage?.key?.participant || webMessage?.key?.remoteJid;
    if (!sender || typeof sender !== 'string') {
        throw new Boom('resolveSenderPn(msg) needs a message with key.participant/remoteJid', { statusCode: 400 });
    }
    return getPhoneNumber(sock, sender);
};
/** Reverse lookup: phone number (or PN JID) → `@lid` JID. Returns `null` when unknown. */
export const getLidForPhone = async (sock, phone) => {
    const store = sock?.signalRepository?.lidMapping;
    if (!store || typeof store.getLIDForPN !== 'function') {
        throw new Boom('getLidForPhone(sock, ...) requires an active socket', { statusCode: 400 });
    }
    const pn = typeof phone === 'string' && phone.includes('@')
        ? phone
        : `${String(phone || '').replace(/\D/g, '')}@s.whatsapp.net`;
    if (!pn.split('@')[0]) {
        throw new Boom('getLidForPhone(phone) requires a phone number', { statusCode: 400 });
    }
    try {
        return (await store.getLIDForPN(pn)) || null;
    }
    catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// JAP@Add (§2.96): task-level JID/LID + message-reading helpers (fork parity wave 4)
// ---------------------------------------------------------------------------

/** Meta AI's phone-form JID (the `@c.us` form is `META_AI_JID` in WABinary). */
export const META_AI_PN_JID = '13135550002@s.whatsapp.net';

/** `jidDecode` under the name other libraries use. Returns null for junk instead of throwing. */
export const parseJid = (jid) => {
    const decoded = jidDecode(jid);
    return decoded ? { user: decoded.user, server: decoded.server, device: decoded.device ?? 0, domainType: decoded.domainType } : null;
};

/** `jidEncode`, tolerant of being handed a whole jid already. */
export const encodeJid = (user, server = 's.whatsapp.net', device) => {
    if (typeof user === 'string' && user.includes('@')) {
        const decoded = jidDecode(user);
        return jidEncode(decoded?.user ?? user, server, device ?? decoded?.device);
    }
    return jidEncode(String(user ?? '').replace(/[^0-9a-zA-Z._:-]/g, ''), server, device);
};

/** Strip the device suffix and normalise `@c.us` → `@s.whatsapp.net`. `''` for junk. */
export const normalizeJid = (jid) => {
    if (typeof jid !== 'string' || !jid.includes('@')) {
        return '';
    }
    return jidNormalizedUser(jid) || '';
};

/** Is this a LID (including the hosted variant)? */
export const isJidLid = (jid) => isLidUser(jid) || isHostedLidUser(jid);
/** Meta AI, under the spelling other libraries use. */
export const isJidMetaAi = (jid) => isJidMetaAI(jid) || normalizeJid(jid) === META_AI_PN_JID;
/** A human-ish addressee: PN, LID, or their hosted forms — not a group/status/channel. */
export const isJidUserLike = (jid) => (isPnUser(jid) || isLidUser(jid) || isHostedPnUser(jid) || isHostedLidUser(jid))
    && !isJidGroup(jid) && !isJidBroadcast(jid) && !isJidNewsletter(jid);

const mappingStoreOf = (source) => source?.signalRepository?.lidMapping
    ?? source?.lidMapping
    ?? (typeof source?.getPNForLID === 'function' ? source : undefined);

/**
 * Resolve a LID to the phone JID **the session actually mapped it to**.
 *
 * There is no formula that turns a LID into a phone number; a fork that swaps `@lid` for
 * `@s.whatsapp.net` is inventing a number that may belong to someone else. This asks the
 * socket's mapping store and returns `null` when the pair is genuinely unknown.
 */
export const lidToJid = async (lid, sock) => {
    const value = normalizeJid(lid);
    if (!value) {
        return null;
    }
    if (isPnUser(value) || isHostedPnUser(value)) {
        return value; // already a phone jid
    }
    const store = mappingStoreOf(sock);
    if (!store?.getPNForLID) {
        throw new Boom('lidToJid: pass the socket — a LID can only be resolved through its mapping store', {
            statusCode: 400
        });
    }
    const pn = await store.getPNForLID(value);
    return pn ? normalizeJid(pn) : null;
};

/** The reverse: the LID the session knows for a phone JID, or `null`. */
export const jidToLid = async (jid, sock) => {
    const value = normalizeJid(jid);
    if (!value) {
        return null;
    }
    if (isJidLid(value)) {
        return value;
    }
    const store = mappingStoreOf(sock);
    if (!store?.getLIDForPN) {
        throw new Boom('jidToLid: pass the socket — a phone jid can only be mapped through its mapping store', {
            statusCode: 400
        });
    }
    const lid = await store.getLIDForPN(value);
    return lid ? normalizeJid(lid) : null;
};

/** Who sent this message (group participant, or the chat itself in a 1:1), normalised. */
export const getSenderJid = (msg) => {
    const key = msg?.key ?? msg;
    if (!key) {
        return '';
    }
    if (key.fromMe && key.remoteJid) {
        return normalizeJid(key.remoteJid);
    }
    return normalizeJid(key.participant || key.participantAlt || key.remoteJid || '');
};

/** The sender's LID form if we have one on the key, else `''`. */
export const getSenderLid = (msg) => {
    const key = msg?.key ?? msg;
    for (const candidate of [key?.participant, key?.participantAlt, key?.remoteJid, key?.remoteJidAlt]) {
        const value = normalizeJid(candidate);
        if (value && isJidLid(value)) {
            return value;
        }
    }
    return '';
};

/** The sender's phone form if we have one on the key, else `''`. */
export const getSenderPn = (msg) => {
    const key = msg?.key ?? msg;
    for (const candidate of [key?.participant, key?.participantAlt, key?.remoteJid, key?.remoteJidAlt]) {
        const value = normalizeJid(candidate);
        if (value && (isPnUser(value) || isHostedPnUser(value))) {
            return value;
        }
    }
    return '';
};

/** The bot/AI JID a message is addressed to, when it is one. */
export const getBotJid = (msg) => {
    const key = msg?.key ?? msg;
    const jid = normalizeJid(key?.remoteJid);
    return jid && isJidMetaAi(jid) ? jid : '';
};

/**
 * Any readable text in a message, whatever shape it arrived in — caption, button reply,
 * list reply, interactive response, poll name, event title. `''` when there is none.
 */
export const getTextFromMessage = (msg) => {
    const content = normalizeMessageContent(msg?.message ?? msg);
    if (!content) {
        return '';
    }
    const candidates = [
        content.conversation,
        content.extendedTextMessage?.text,
        content.imageMessage?.caption,
        content.videoMessage?.caption,
        content.documentMessage?.caption,
        content.documentWithCaptionMessage?.message?.documentMessage?.caption,
        content.buttonsResponseMessage?.selectedDisplayText,
        content.buttonsResponseMessage?.selectedButtonId,
        content.templateButtonReplyMessage?.selectedDisplayText,
        content.templateButtonReplyMessage?.selectedId,
        content.listResponseMessage?.title,
        content.listResponseMessage?.singleSelectReply?.selectedRowId,
        content.interactiveResponseMessage?.body?.text,
        content.reactionMessage?.text,
        content.pollCreationMessage?.name,
        content.pollCreationMessageV3?.name,
        content.eventMessage?.name,
        content.contactMessage?.displayName,
        content.locationMessage?.name,
        content.liveLocationMessage?.caption,
        content.ptvMessage?.caption
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length) {
            return candidate;
        }
    }
    return '';
};

/**
 * The structured answer to an interactive message: which button/row/flow the user picked.
 * `null` when the message is not a response to one.
 */
export const getInteractiveResponse = (msg) => {
    const content = normalizeMessageContent(msg?.message ?? msg);
    if (!content) {
        return null;
    }
    if (content.buttonsResponseMessage) {
        const reply = content.buttonsResponseMessage;
        return { type: 'button', id: reply.selectedButtonId ?? null, text: reply.selectedDisplayText ?? null };
    }
    if (content.templateButtonReplyMessage) {
        const reply = content.templateButtonReplyMessage;
        return { type: 'template', id: reply.selectedId ?? null, text: reply.selectedDisplayText ?? null, index: reply.selectedIndex ?? null };
    }
    if (content.listResponseMessage) {
        const reply = content.listResponseMessage;
        return { type: 'list', id: reply.singleSelectReply?.selectedRowId ?? null, text: reply.title ?? null };
    }
    if (content.interactiveResponseMessage) {
        const reply = content.interactiveResponseMessage;
        let params = null;
        try {
            params = reply.nativeFlowResponseMessage?.paramsJson ? JSON.parse(reply.nativeFlowResponseMessage.paramsJson) : null;
        }
        catch { /* a malformed paramsJson is not worth throwing over */ }
        return {
            type: 'native_flow',
            name: reply.nativeFlowResponseMessage?.name ?? null,
            id: params?.id ?? null,
            text: reply.body?.text ?? null,
            params
        };
    }
    return null;
};

/** Which media kind a status/story carries: `'text' | 'image' | 'video' | 'audio' | null`. */
export const getStatusMediaType = (msg) => {
    const content = normalizeMessageContent(msg?.message ?? msg);
    if (!content) {
        return null;
    }
    if (content.imageMessage) {
        return 'image';
    }
    if (content.videoMessage) {
        return 'video';
    }
    if (content.audioMessage) {
        return 'audio';
    }
    if (content.conversation || content.extendedTextMessage) {
        return 'text';
    }
    return null;
};
