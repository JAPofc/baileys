/**
 * lib/Utils/scheduled-message.js — client-side scheduled messages.
 *
 * WhatsApp has no "send this later" field on an ordinary message, so a scheduled message is
 * encoded as a normal message carrying a scheduling envelope in its `messageContextInfo`,
 * which the sender's own client (or `MessageScheduler`) acts on later, and an unschedule is a
 * protocol message pointing at the scheduled message key. This module owns that encoding, so
 * every part of the library — scheduler, CLI, bot framework — reads and writes the same shape.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { proto } from '../../WAProto/index.js';

/** Marker that identifies a scheduling envelope. */
export const SCHEDULED_MSG_MARKER = 'JAPSCHED1';
/** Lifecycle states a scheduled message moves through. */
export const SCHEDULED_MSG_STATUS = {
    PENDING: 'pending',
    SENT: 'sent',
    CANCELLED: 'cancelled',
    FAILED: 'failed'
};
/** How far ahead a message may be scheduled (30 days, matching WhatsApp's own event limit). */
export const SCHEDULED_MSG_MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
/** Smallest useful lead time; anything closer is just a normal send. */
export const SCHEDULED_MSG_MIN_DELAY_MS = 1000;

const toEpochMs = (at) => {
    if (at instanceof Date) {
        return at.getTime();
    }
    if (typeof at === 'number' && Number.isFinite(at)) {
        // accept seconds as well as milliseconds
        return at < 1e12 ? Math.round(at * 1000) : Math.round(at);
    }
    if (typeof at === 'string') {
        const parsed = Date.parse(at);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    throw new Boom('encodeScheduledMessage: "at" must be a Date, a timestamp, or an ISO string', {
        statusCode: 400,
        data: { at }
    });
};

/**
 * Wrap message content with a scheduling envelope.
 *
 * ```js
 * const { content, scheduledAt, scheduleId } = encodeScheduledMessage(
 *     { text: 'Happy new year!' },
 *     { at: new Date('2027-01-01T00:00:00Z') }
 * )
 * ```
 *
 * The returned `content` is a normal `sendMessage()` payload — send it when the time comes,
 * or hand it to `MessageScheduler`. `decodeScheduledMessage()` reads the envelope back out.
 */
export const encodeScheduledMessage = (content, { at, scheduleId, now = Date.now(), timezone, maxDelayMs = SCHEDULED_MSG_MAX_DELAY_MS } = {}) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Boom('encodeScheduledMessage: content must be a message object', { statusCode: 400 });
    }
    const scheduledAt = toEpochMs(at);
    const delay = scheduledAt - now;
    if (delay < SCHEDULED_MSG_MIN_DELAY_MS) {
        throw new Boom(`encodeScheduledMessage: "at" must be at least ${SCHEDULED_MSG_MIN_DELAY_MS}ms in the future`, {
            statusCode: 400,
            data: { at, scheduledAt, now }
        });
    }
    if (delay > maxDelayMs) {
        throw new Boom(`encodeScheduledMessage: "at" is more than ${maxDelayMs}ms away`, {
            statusCode: 400,
            data: { at, scheduledAt, now, maxDelayMs }
        });
    }
    const id = String(scheduleId || `${SCHEDULED_MSG_MARKER}-${scheduledAt.toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    return {
        scheduleId: id,
        scheduledAt,
        delayMs: delay,
        status: SCHEDULED_MSG_STATUS.PENDING,
        content: {
            ...content,
            scheduledMessage: {
                marker: SCHEDULED_MSG_MARKER,
                scheduleId: id,
                scheduledAt,
                createdAt: now,
                status: SCHEDULED_MSG_STATUS.PENDING,
                ...(timezone ? { timezone } : {})
            }
        }
    };
};

/**
 * Read a scheduling envelope back out of content (or a full `WebMessageInfo`).
 * Returns `null` when the message is not a scheduled one.
 */
export const decodeScheduledMessage = (input) => {
    const content = input?.message ?? input;
    const envelope = content?.scheduledMessage;
    if (!envelope || envelope.marker !== SCHEDULED_MSG_MARKER) {
        return null;
    }
    const scheduledAt = Number(envelope.scheduledAt);
    if (!Number.isFinite(scheduledAt)) {
        return null;
    }
    const { scheduledMessage, ...rest } = content;
    return {
        scheduleId: String(envelope.scheduleId || ''),
        scheduledAt,
        createdAt: Number(envelope.createdAt) || undefined,
        status: envelope.status || SCHEDULED_MSG_STATUS.PENDING,
        timezone: envelope.timezone,
        isDue: (now = Date.now()) => scheduledAt <= now,
        content: rest
    };
};

/**
 * The protocol message that cancels a scheduled message that was already announced to the
 * other device(s) — `{ protocolMessage: { type: REVOKE, key } }` with the schedule id carried
 * along so a receiving client can drop it from its own queue.
 */
export const buildUnscheduleProtocolMessage = (key, { scheduleId } = {}) => {
    if (!key?.id) {
        throw new Boom('buildUnscheduleProtocolMessage: a message key with an id is required', { statusCode: 400 });
    }
    return {
        protocolMessage: {
            key,
            type: proto.Message.ProtocolMessage.Type.REVOKE
        },
        scheduledMessage: {
            marker: SCHEDULED_MSG_MARKER,
            ...(scheduleId ? { scheduleId: String(scheduleId) } : {}),
            status: SCHEDULED_MSG_STATUS.CANCELLED,
            cancelledAt: Date.now()
        }
    };
};

/** Length of a reveal key (AES-256-GCM). */
export const SCHEDULED_MSG_REVEAL_KEY_LEN = 32;
const REVEAL_ALGO = 'aes-256-gcm';
const REVEAL_IV_LEN = 12;

/** The `<scheduled_msg>` stanza child that tells the server when a message is meant to fire. */
export const buildScheduledMsgMetaNode = ({ scheduleId, scheduledAt, timezone } = {}) => {
    if (!scheduleId) {
        throw new Boom('buildScheduledMsgMetaNode: "scheduleId" is required', { statusCode: 400 });
    }
    const at = Number(scheduledAt);
    if (!Number.isFinite(at) || at <= 0) {
        throw new Boom('buildScheduledMsgMetaNode: "scheduledAt" must be a timestamp in ms', {
            statusCode: 400,
            data: { scheduledAt }
        });
    }
    return {
        tag: 'scheduled_msg',
        attrs: {
            id: String(scheduleId),
            // the wire carries seconds
            t: String(Math.floor(at / 1000)),
            marker: SCHEDULED_MSG_MARKER,
            ...(timezone ? { tz: timezone } : {})
        }
    };
};

/** Is this a time a message may actually be scheduled for? (no throw — returns a report) */
export const isScheduledTimeValid = (at, { now = Date.now(), maxDelayMs = SCHEDULED_MSG_MAX_DELAY_MS, minDelayMs = SCHEDULED_MSG_MIN_DELAY_MS } = {}) => {
    let scheduledAt;
    try {
        scheduledAt = toEpochMs(at);
    }
    catch {
        return { valid: false, reason: 'unparseable', scheduledAt: null, delayMs: null };
    }
    const delayMs = scheduledAt - now;
    if (delayMs < minDelayMs) {
        return { valid: false, reason: delayMs < 0 ? 'in the past' : 'too soon', scheduledAt, delayMs };
    }
    if (delayMs > maxDelayMs) {
        return { valid: false, reason: 'too far ahead', scheduledAt, delayMs };
    }
    return { valid: true, reason: null, scheduledAt, delayMs };
};

/** A fresh reveal key: the secret that unlocks a conditional/scheduled payload later. */
export const generateRevealKey = () => randomBytes(SCHEDULED_MSG_REVEAL_KEY_LEN);

/** The stable, shareable id of a reveal key (sha256, hex, 32 chars) — never the key itself. */
export const generateRevealKeyId = (key) => {
    if (!Buffer.isBuffer(key) && !(key instanceof Uint8Array)) {
        throw new Boom('generateRevealKeyId: pass the reveal key buffer', { statusCode: 400 });
    }
    return createHash('sha256').update(Buffer.from(key)).digest('hex').slice(0, 32);
};

/** Encrypt a payload under a reveal key (AES-256-GCM). */
export const encryptWithRevealKey = (payload, key) => {
    if (!Buffer.isBuffer(key) && !(key instanceof Uint8Array)) {
        throw new Boom('encryptWithRevealKey: pass the reveal key buffer', { statusCode: 400 });
    }
    if (Buffer.from(key).length !== SCHEDULED_MSG_REVEAL_KEY_LEN) {
        throw new Boom(`encryptWithRevealKey: the reveal key must be ${SCHEDULED_MSG_REVEAL_KEY_LEN} bytes`, {
            statusCode: 400
        });
    }
    const plain = Buffer.isBuffer(payload) || payload instanceof Uint8Array
        ? Buffer.from(payload)
        : Buffer.from(JSON.stringify(payload), 'utf8');
    const iv = randomBytes(REVEAL_IV_LEN);
    const cipher = createCipheriv(REVEAL_ALGO, Buffer.from(key), iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
        keyId: generateRevealKeyId(key),
        iv,
        tag: cipher.getAuthTag(),
        ciphertext
    };
};

/** Decrypt a payload produced by {@link encryptWithRevealKey}. */
export const decryptWithRevealKey = (envelope, key, { json = true } = {}) => {
    const { iv, tag, ciphertext } = envelope || {};
    if (!iv || !tag || !ciphertext) {
        throw new Boom('decryptWithRevealKey: the envelope needs iv, tag and ciphertext', { statusCode: 400 });
    }
    if (envelope.keyId && envelope.keyId !== generateRevealKeyId(key)) {
        throw new Boom('decryptWithRevealKey: this reveal key does not match the envelope', {
            statusCode: 400,
            data: { keyId: envelope.keyId }
        });
    }
    const decipher = createDecipheriv(REVEAL_ALGO, Buffer.from(key), Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    let plain;
    try {
        plain = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
    }
    catch (err) {
        throw new Boom('decryptWithRevealKey: wrong key or tampered payload', { statusCode: 400, cause: err });
    }
    if (!json) {
        return plain;
    }
    try {
        return JSON.parse(plain.toString('utf8'));
    }
    catch {
        return plain;
    }
};

/**
 * A conditional reveal: send the locked payload now, hand out the key when the condition is
 * met (a time, a purchase, a quiz answer). The recipient cannot read it early.
 *
 * ```js
 * const key = generateRevealKey()
 * const locked = buildConditionalRevealMessage({ text: 'Surprise!' }, key, { revealAt: tomorrow })
 * await sock.sendMessage(jid, locked.content)
 * // later: share `key` (or locked.revealWith(key)) to unlock
 * ```
 */
export const buildConditionalRevealMessage = (content, key, { revealAt, condition, placeholder = 'This message unlocks later.' } = {}) => {
    if (!content || typeof content !== 'object') {
        throw new Boom('buildConditionalRevealMessage: content must be a message object', { statusCode: 400 });
    }
    if (revealAt !== undefined) {
        const check = isScheduledTimeValid(revealAt);
        if (!check.valid) {
            throw new Boom(`buildConditionalRevealMessage: "revealAt" is ${check.reason}`, {
                statusCode: 400,
                data: check
            });
        }
    }
    const envelope = encryptWithRevealKey(content, key);
    return {
        keyId: envelope.keyId,
        ...(revealAt ? { revealAt: toEpochMs(revealAt) } : {}),
        ...(condition ? { condition } : {}),
        envelope,
        content: {
            text: placeholder,
            conditionalReveal: {
                marker: SCHEDULED_MSG_MARKER,
                keyId: envelope.keyId,
                iv: envelope.iv.toString('base64'),
                tag: envelope.tag.toString('base64'),
                ciphertext: envelope.ciphertext.toString('base64'),
                ...(revealAt ? { revealAt: toEpochMs(revealAt) } : {}),
                ...(condition ? { condition } : {})
            }
        },
        reveal: (revealKey) => decryptWithRevealKey(envelope, revealKey)
    };
};
