/**
 * lib/Utils/payment-messages.js — split bills and payment reminders.
 *
 * JAP@Add (§2.113): WhatsApp's `splitPaymentMessage`, `splitPaymentUpdateMessage` and
 * `paymentReminderMessage` have been in the protobuf for a while with nothing to build them.
 * These helpers turn plain numbers and jids into the wire shapes, and read them back.
 *
 * Money on the wire is an integer plus an `offset`: `{ value: 125000, offset: 1000 }` means
 * 125.00. You pass human amounts here; the scaling is done for you.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { jidNormalizedUser } from '../WABinary/index.js';

/** The wire multiplier for a money value: `value / offset` is the human amount. */
export const WIRE_MONEY_OFFSET = 1000;
/** Where a participant of a split stands. */
export const SPLIT_PAYMENT_PARTICIPANT_STATUS = Object.freeze(proto.Message.SplitPaymentParticipant.SplitPaymentStatus);
/** How often a reminder repeats. */
export const PAYMENT_REMINDER_FREQUENCY = Object.freeze(proto.Message.PaymentReminderMessage.ReminderFrequency);
/** Where a reminder stands. */
export const PAYMENT_REMINDER_STATUS = Object.freeze(proto.Message.PaymentReminderMessage.ReminderStatus);

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const enumValue = (enumObject, value, fallback, label) => {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value === 'number') {
        if (!Object.values(enumObject).includes(value)) {
            throw new Boom(`${label}: unknown value ${value}`, { statusCode: 400 });
        }
        return value;
    }
    const key = String(value).trim().toUpperCase();
    if (key in enumObject) {
        return enumObject[key];
    }
    throw new Boom(`${label}: unknown value ${JSON.stringify(value)}`, { statusCode: 400 });
};

const normalizeCurrency = (currency, label) => {
    if (currency === undefined || currency === null || currency === '') {
        return undefined;
    }
    const code = String(currency).trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(code)) {
        throw new Boom(`${label}: "currency" must be a 3-letter ISO code (e.g. IDR)`, { statusCode: 400 });
    }
    return code;
};

const requireJid = (jid, label) => {
    if (typeof jid !== 'string' || !jid.includes('@')) {
        throw new Boom(`${label}: a jid is required`, { statusCode: 400 });
    }
    return jidNormalizedUser(jid);
};

const asId = (value, label) => {
    if (value === undefined || value === null || value === '') {
        throw new Boom(`${label} is required`, { statusCode: 400 });
    }
    return String(value);
};

/**
 * Build a `Money` from a human amount: `wireMoney(125, 'IDR')` → `{ value: 125000, offset: 1000 }`.
 * Fractions are rounded to the offset's precision.
 */
export const wireMoney = (amount, currency, offset = WIRE_MONEY_OFFSET) => {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        throw new Boom('money: "amount" must be a finite number', { statusCode: 400 });
    }
    if (!Number.isInteger(offset) || offset <= 0) {
        throw new Boom('money: "offset" must be a positive integer', { statusCode: 400 });
    }
    return {
        value: Math.round(amount * offset),
        offset,
        currencyCode: normalizeCurrency(currency, 'money')
    };
};

/** Read a `Money` back as a human amount. Returns `undefined` when there is nothing to read. */
export const readWireMoney = (value) => {
    if (!value || value.value === undefined || value.value === null) {
        return undefined;
    }
    const offset = Number(value.offset) || WIRE_MONEY_OFFSET;
    return {
        amount: Number(value.value) / offset,
        value: Number(value.value),
        offset,
        currency: value.currencyCode || undefined
    };
};

const buildParticipant = (participant, currency, label) => {
    if (!participant || typeof participant !== 'object') {
        throw new Boom(`${label}: each participant must be an object`, { statusCode: 400 });
    }
    const amount = participant.amount;
    return {
        jid: requireJid(participant.jid, `${label} participant`),
        amount: amount === undefined || amount === null
            ? undefined
            : wireMoney(amount, participant.currency ?? currency),
        status: enumValue(SPLIT_PAYMENT_PARTICIPANT_STATUS, participant.status, SPLIT_PAYMENT_PARTICIPANT_STATUS.PENDING, `${label} participant status`)
    };
};

/**
 * Build a split-bill message.
 *
 * ```js
 * buildSplitPaymentMessage({
 *   splitId: 'dinner-1', total: 300, currency: 'IDR', description: 'Makan malam',
 *   participants: [{ jid: a, amount: 150 }, { jid: b, amount: 150, status: 'PAID' }]
 * })
 * ```
 *
 * With `splitEvenly: true` the total is divided across the participants that did not name
 * their own amount (the remainder goes to the first of them, so the parts always add up).
 */
export const buildSplitPaymentMessage = ({
    splitId, total, currency, description, requesterJid, participants,
    createdAt, contextInfo, splitEvenly = false
} = {}) => {
    const id = asId(splitId, 'buildSplitPaymentMessage: "splitId"');
    if (!Array.isArray(participants) || !participants.length) {
        throw new Boom('buildSplitPaymentMessage: "participants" must be a non-empty array', { statusCode: 400 });
    }
    const code = normalizeCurrency(currency, 'buildSplitPaymentMessage');
    let entries = participants.map(p => buildParticipant(p, code, 'buildSplitPaymentMessage'));
    if (splitEvenly) {
        if (typeof total !== 'number') {
            throw new Boom('buildSplitPaymentMessage: "splitEvenly" needs a numeric "total"', { statusCode: 400 });
        }
        const open = entries.filter(p => !p.amount);
        if (open.length) {
            const taken = entries.reduce((sum, p) => sum + (p.amount ? p.amount.value : 0), 0);
            const totalValue = Math.round(total * WIRE_MONEY_OFFSET);
            const share = Math.floor((totalValue - taken) / open.length);
            const remainder = (totalValue - taken) - share * open.length;
            open.forEach((p, i) => {
                p.amount = { value: share + (i === 0 ? remainder : 0), offset: WIRE_MONEY_OFFSET, currencyCode: code };
            });
        }
    }
    const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : createdAt;
    return {
        splitId: id,
        totalAmount: typeof total === 'number' ? wireMoney(total, code) : undefined,
        description: description ? String(description) : undefined,
        requesterJid: requesterJid ? requireJid(requesterJid, 'buildSplitPaymentMessage: "requesterJid"') : undefined,
        participants: entries,
        createdAtMs: createdAtMs === undefined || createdAtMs === null ? Date.now() : Number(createdAtMs),
        contextInfo: contextInfo || undefined
    };
};

/** Mark yourself (or someone) as having settled their part of a split. */
export const buildSplitPaymentUpdateMessage = ({ splitId, participantJid } = {}) => ({
    splitId: asId(splitId, 'buildSplitPaymentUpdateMessage: "splitId"'),
    participantJid: requireJid(participantJid, 'buildSplitPaymentUpdateMessage: "participantJid"')
});

/** Build a (optionally repeating) payment reminder. */
export const buildPaymentReminderMessage = ({
    reminderId, instanceId, description, frequency, status, amount, currency, payeeVpa, payeeJid, payerJid
} = {}) => {
    const code = normalizeCurrency(currency, 'buildPaymentReminderMessage');
    return {
        reminderId: asId(reminderId, 'buildPaymentReminderMessage: "reminderId"'),
        instanceId: instanceId === undefined || instanceId === null ? undefined : String(instanceId),
        description: description ? String(description) : undefined,
        frequency: enumValue(PAYMENT_REMINDER_FREQUENCY, frequency, PAYMENT_REMINDER_FREQUENCY.REMINDER_FREQUENCY_UNKNOWN, 'buildPaymentReminderMessage: "frequency"'),
        status: enumValue(PAYMENT_REMINDER_STATUS, status, PAYMENT_REMINDER_STATUS.ACTIVE, 'buildPaymentReminderMessage: "status"'),
        amount: amount === undefined || amount === null ? undefined : wireMoney(amount, code),
        payeeVpa: payeeVpa ? String(payeeVpa) : undefined,
        payeeJid: payeeJid ? requireJid(payeeJid, 'buildPaymentReminderMessage: "payeeJid"') : undefined,
        payerJid: payerJid ? requireJid(payerJid, 'buildPaymentReminderMessage: "payerJid"') : undefined
    };
};

const unwrap = (msg) => msg?.message ?? msg;

/** Read a `splitPaymentMessage` back into plain values, or `null` when it isn't one. */
export const readSplitPaymentMessage = (msg) => {
    const split = unwrap(msg)?.splitPaymentMessage ?? (msg?.splitId && msg?.participants ? msg : null);
    if (!split) {
        return null;
    }
    const participants = (split.participants || []).map(p => ({
        jid: p.jid || undefined,
        amount: readWireMoney(p.amount),
        status: p.status ?? SPLIT_PAYMENT_PARTICIPANT_STATUS.PENDING,
        paid: (p.status ?? 0) === SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID
    }));
    const total = readWireMoney(split.totalAmount);
    const paidValue = participants.reduce((sum, p) => sum + (p.paid ? (p.amount?.value ?? 0) : 0), 0);
    return {
        splitId: split.splitId || undefined,
        total,
        description: split.description || undefined,
        requesterJid: split.requesterJid || undefined,
        createdAtMs: split.createdAtMs ? Number(split.createdAtMs) : undefined,
        participants,
        /** How much of the bill is already settled, in the same units as `total`. */
        settled: total ? paidValue / (total.offset || WIRE_MONEY_OFFSET) : undefined,
        outstanding: total ? (total.value - paidValue) / (total.offset || WIRE_MONEY_OFFSET) : undefined,
        complete: participants.length > 0 && participants.every(p => p.paid)
    };
};

/** Read a `splitPaymentUpdateMessage`, or `null`. */
export const readSplitPaymentUpdateMessage = (msg) => {
    const update = unwrap(msg)?.splitPaymentUpdateMessage;
    if (!update) {
        return null;
    }
    return { splitId: update.splitId || undefined, participantJid: update.participantJid || undefined };
};

/** Read a `paymentReminderMessage`, or `null`. */
export const readPaymentReminderMessage = (msg) => {
    const reminder = unwrap(msg)?.paymentReminderMessage;
    if (!reminder) {
        return null;
    }
    return {
        reminderId: reminder.reminderId || undefined,
        instanceId: reminder.instanceId || undefined,
        description: reminder.description || undefined,
        frequency: reminder.frequency ?? PAYMENT_REMINDER_FREQUENCY.REMINDER_FREQUENCY_UNKNOWN,
        status: reminder.status ?? PAYMENT_REMINDER_STATUS.REMINDER_STATUS_UNKNOWN,
        amount: readWireMoney(reminder.amount),
        payeeVpa: reminder.payeeVpa || undefined,
        payeeJid: reminder.payeeJid || undefined,
        payerJid: reminder.payerJid || undefined,
        active: (reminder.status ?? 0) === PAYMENT_REMINDER_STATUS.ACTIVE
    };
};

/** Whichever payment message this is, read it: `{ type, value }` or `null`. */
export const readPaymentMessage = (msg) => {
    const split = readSplitPaymentMessage(unwrap(msg)?.splitPaymentMessage ? msg : {});
    if (split) {
        return { type: 'split', value: split };
    }
    const update = readSplitPaymentUpdateMessage(msg);
    if (update) {
        return { type: 'splitUpdate', value: update };
    }
    const reminder = readPaymentReminderMessage(msg);
    if (reminder) {
        return { type: 'reminder', value: reminder };
    }
    return null;
};

/**
 * Bridge the in-app bookkeeping object produced by `buildSplitPayment()` (lib/Utils/payment.js)
 * into a real `splitPaymentMessage` that can actually be sent. The bookkeeping helpers predate
 * the protobuf support and use a different shape (`requestId`, `participants[].share`).
 */
export const toSplitPaymentMessage = (split, { description, requesterJid } = {}) => {
    if (!split?.participants?.length) {
        throw new Boom('toSplitPaymentMessage: pass a split built by buildSplitPayment()', { statusCode: 400 });
    }
    const offset = split.total?.offset ?? WIRE_MONEY_OFFSET;
    return {
        splitId: String(split.requestId ?? split.splitId ?? Date.now()),
        totalAmount: split.total
            ? { value: Number(split.total.value), offset, currencyCode: split.total.currencyCode || split.currencyCode }
            : undefined,
        description: description ?? split.note ?? undefined,
        requesterJid: requesterJid ? requireJid(requesterJid, 'toSplitPaymentMessage: "requesterJid"') : undefined,
        participants: split.participants.map(person => ({
            jid: requireJid(person.jid, 'toSplitPaymentMessage participant'),
            amount: person.share
                ? { value: Number(person.share.value), offset: person.share.offset ?? offset, currencyCode: person.share.currencyCode || split.currencyCode }
                : undefined,
            status: person.status === 'settled' || person.status === SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID
                ? SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID
                : SPLIT_PAYMENT_PARTICIPANT_STATUS.PENDING
        })),
        createdAtMs: Number(split.createdAt ?? Date.now())
    };
};
