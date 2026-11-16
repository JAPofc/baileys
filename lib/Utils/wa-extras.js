/**
 * lib/Utils/wa-extras.js — the leftovers other distributions expose and we did not:
 * strict JID validation, the location-broadcast pseudo-chat, member labels, scheduled
 * calls, and the media helpers that need ffmpeg.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import {
    isJidBroadcast, isJidGroup, isJidNewsletter, isLidUser, isPnUser,
    isHostedLidUser, isHostedPnUser, jidDecode, jidEncode, jidNormalizedUser
} from '../WABinary/index.js';
import { normalizeMessageContent } from './messages.js';

/** The pseudo-chat live-location broadcasts arrive in. */
export const LOCATION_BROADCAST_JID = 'location@broadcast';
/** Longest member label WhatsApp accepts. */
export const MEMBER_LABEL_MAX_LENGTH = 25;
/** Servers a valid WhatsApp JID can live on. */
export const VALID_JID_SERVERS = [
    's.whatsapp.net', 'c.us', 'lid', 'g.us', 'broadcast', 'newsletter', 'hosted', 'hosted.lid', 'bot', 'call'
];

/** Is this the live-location broadcast chat? */
export const isJidLocationBroadcast = (jid) => jid === LOCATION_BROADCAST_JID;

/**
 * Strict JID validation: structure, server, and a plausible user part.
 * Returns `{ valid, reason }` — `reason` names what is wrong, so a bot can tell the user.
 */
export const validateJid = (jid) => {
    if (typeof jid !== 'string' || !jid.length) {
        return { valid: false, reason: 'not a string' };
    }
    if (!jid.includes('@')) {
        return { valid: false, reason: 'no @server part' };
    }
    const decoded = jidDecode(jid);
    if (!decoded?.server) {
        return { valid: false, reason: 'unparsable' };
    }
    if (!VALID_JID_SERVERS.includes(decoded.server)) {
        return { valid: false, reason: `unknown server "${decoded.server}"` };
    }
    if (!decoded.user?.length) {
        return { valid: false, reason: 'empty user part' };
    }
    if (decoded.server === 's.whatsapp.net' || decoded.server === 'c.us') {
        if (!/^\d{5,16}$/.test(decoded.user)) {
            return { valid: false, reason: 'phone JIDs must be 5–16 digits' };
        }
    }
    if (decoded.device !== undefined && (!Number.isInteger(decoded.device) || decoded.device < 0 || decoded.device > 99)) {
        return { valid: false, reason: `device ${decoded.device} is out of range` };
    }
    return { valid: true, reason: null };
};

/** Boolean shorthand over {@link validateJid}. */
export const isValidJid = (jid) => validateJid(jid).valid;

/** Throw (with the reason) unless this is a valid JID; returns the normalised form. */
export const assertJid = (jid, label = 'jid') => {
    const check = validateJid(jid);
    if (!check.valid) {
        throw new Boom(`${label}: "${jid}" is not a valid JID (${check.reason})`, { statusCode: 400, data: { jid } });
    }
    return jidNormalizedUser(jid);
};

/** Throw unless this is a LID (hosted LIDs count); returns the normalised form. */
export const assertLid = (jid, label = 'lid') => {
    const value = String(jid ?? '');
    if (!isLidUser(value) && !isHostedLidUser(value)) {
        throw new Boom(`${label}: "${value || 'nothing'}" is not a @lid JID`, { statusCode: 400, data: { jid } });
    }
    return jidNormalizedUser(value);
};

/** Build a JID from loose input: digits, `+62…`, an existing JID, or `{ user, server }`. */
export const toJid = (input, server = 's.whatsapp.net') => {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        return jidEncode(String(input.user ?? ''), input.server ?? server, input.device);
    }
    const value = String(input ?? '').trim();
    if (!value) {
        throw new Boom('toJid: nothing to build a JID from', { statusCode: 400 });
    }
    if (value.includes('@')) {
        return jidNormalizedUser(value);
    }
    const digits = value.replace(/\D/g, '');
    if (!digits) {
        throw new Boom(`toJid: "${value}" has no digits and is not a JID`, { statusCode: 400, data: { input } });
    }
    return jidEncode(digits, server);
};

/** Which kind of chat a JID points at. */
export const jidKind = (jid) => {
    if (isJidGroup(jid)) {
        return 'group';
    }
    if (isJidNewsletter(jid)) {
        return 'newsletter';
    }
    if (isJidLocationBroadcast(jid)) {
        return 'location';
    }
    if (jid === 'status@broadcast') {
        return 'status';
    }
    if (isJidBroadcast(jid)) {
        return 'broadcast';
    }
    if (isLidUser(jid) || isHostedLidUser(jid)) {
        return 'lid';
    }
    if (isPnUser(jid) || isHostedPnUser(jid)) {
        return 'user';
    }
    return 'unknown';
};

/**
 * The protocol message that sets your label inside a group ("Admin", "Support", …).
 * Pass `''` to clear it.
 */
export const buildMemberLabelMessage = (label, { timestamp = Date.now() } = {}) => {
    const text = String(label ?? '').trim();
    if (text.length > MEMBER_LABEL_MAX_LENGTH) {
        throw new Boom(`buildMemberLabelMessage: a label is at most ${MEMBER_LABEL_MAX_LENGTH} characters (got ${text.length})`, {
            statusCode: 400,
            data: { length: text.length }
        });
    }
    return {
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE,
            memberLabel: { label: text, labelTimestamp: timestamp }
        }
    };
};

/** Schedule a group call: `{ scheduledCallCreationMessage }` content for `sendMessage`. */
export const makeScheduledCallCreationMessage = ({ title, at, callType = 'voice' } = {}) => {
    const name = String(title ?? '').trim();
    if (!name) {
        throw new Boom('makeScheduledCallCreationMessage: "title" is required', { statusCode: 400 });
    }
    const when = at instanceof Date ? at.getTime() : Number(at);
    if (!Number.isFinite(when) || when <= 0) {
        throw new Boom('makeScheduledCallCreationMessage: "at" must be a Date or a timestamp', {
            statusCode: 400,
            data: { at }
        });
    }
    if (when < Date.now()) {
        throw new Boom('makeScheduledCallCreationMessage: "at" is in the past', { statusCode: 400, data: { at } });
    }
    const types = proto.Message.ScheduledCallCreationMessage.CallType;
    const type = typeof callType === 'number' ? callType : types[String(callType).toUpperCase()];
    if (type === undefined) {
        throw new Boom(`makeScheduledCallCreationMessage: unknown callType "${callType}" (voice | video)`, {
            statusCode: 400
        });
    }
    return {
        scheduledCallCreationMessage: {
            scheduledTimestampMs: when > 1e11 ? when : when * 1000,
            callType: type,
            title: name
        }
    };
};

/** Cancel a scheduled call you created. */
export const makeScheduledCallEditMessage = (key, { editType = 'cancel' } = {}) => {
    if (!key?.id) {
        throw new Boom('makeScheduledCallEditMessage: the scheduled-call message key (with an id) is required', {
            statusCode: 400
        });
    }
    const types = proto.Message.ScheduledCallEditMessage.EditType;
    const type = typeof editType === 'number' ? editType : types[String(editType).toUpperCase()];
    if (type === undefined) {
        throw new Boom(`makeScheduledCallEditMessage: unknown editType "${editType}" (cancel)`, { statusCode: 400 });
    }
    return { scheduledCallEditMessage: { key, editType: type } };
};

/** Read a scheduled call back out of a message. */
export const readScheduledCall = (msg) => {
    const content = normalizeMessageContent(msg?.message ?? msg);
    const creation = content?.scheduledCallCreationMessage;
    if (!creation) {
        return null;
    }
    const types = proto.Message.ScheduledCallCreationMessage.CallType;
    return {
        title: creation.title ?? null,
        at: Number(creation.scheduledTimestampMs ?? 0) || null,
        callType: Object.keys(types).find(name => types[name] === creation.callType)?.toLowerCase() ?? 'unknown'
    };
};

/**
 * One JPEG frame out of a video, as a Buffer — the thumbnail helper other distributions
 * call `vid2jpg`. Needs ffmpeg; the error says so plainly instead of failing obscurely.
 */
export const videoToJpeg = async (input, { at = '00:00:01', width = 320 } = {}) => {
    if (!input) {
        throw new Boom('videoToJpeg: pass a file path (or a Buffer)', { statusCode: 400 });
    }
    const { extractVideoThumb } = await import('./messages-media.js');
    let path = input;
    let cleanup;
    if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
        const { writeFile, unlink } = await import('fs/promises');
        const { tmpdir } = await import('os');
        const { join } = await import('path');
        const { randomBytes } = await import('crypto');
        path = join(tmpdir(), `jap-vid-${randomBytes(6).toString('hex')}.mp4`);
        await writeFile(path, Buffer.from(input));
        cleanup = () => unlink(path).catch(() => {});
    }
    try {
        return await extractVideoThumb(path, at, { width, height: -1 });
    }
    finally {
        await cleanup?.();
    }
};

/**
 * Transcode any audio into the Opus/OGG a WhatsApp voice note needs.
 * Needs ffmpeg; returns `{ buffer, mimetype, ptt: true }` ready for `sendMessage`.
 */
export const convertToOpusBuffer = async (input, { bitrate = '64k', channels = 1, sampleRate = 48000 } = {}) => {
    const data = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : null;
    if (!data?.length && typeof input !== 'string') {
        throw new Boom('convertToOpusBuffer: pass audio as a Buffer or a file path', { statusCode: 400 });
    }
    const { requireFfmpegPath } = await import('./ffmpeg-path.js');
    const binary = await requireFfmpegPath();
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const args = [
        '-loglevel', 'error',
        '-i', data ? 'pipe:0' : String(input),
        '-vn', '-map_metadata', '-1',
        '-c:a', 'libopus', '-b:a', String(bitrate),
        '-ac', String(channels), '-ar', String(sampleRate),
        '-f', 'ogg', 'pipe:1'
    ];
    const ffmpeg = spawn(binary, args, { stdio: [data ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const chunks = [];
    const errors = [];
    ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
    ffmpeg.stderr.on('data', chunk => errors.push(chunk));
    if (data) {
        ffmpeg.stdin.on('error', () => {}); // a closed pipe is ffmpeg's business, not a crash
        ffmpeg.stdin.end(data);
    }
    const [code] = await once(ffmpeg, 'close');
    if (code !== 0) {
        throw new Boom(`convertToOpusBuffer: ffmpeg exited ${code}: ${Buffer.concat(errors).toString('utf8').slice(0, 300)}`, {
            statusCode: 500
        });
    }
    return { buffer: Buffer.concat(chunks), mimetype: 'audio/ogg; codecs=opus', ptt: true };
};
