/**
 * lib/Utils/payment.js — money values, split payments and payment reminders.
 *
 * WhatsApp carries money as an integer in the currency's smallest unit plus an exponent
 * (`offset`), never as a float — 25.50 USD is `{ value: 2550n, offset: 100 }`. Getting that
 * wrong is how bots end up charging 100× too much, so the conversion lives here, once.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';

/** Default offset: two decimal places (cents, sen, pence…). */
export const MONEY_OFFSET = 1000;
/** Currencies WhatsApp carries with no decimal places at all. */
export const MONEY_ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK'];
/** Lifecycle of a split-payment request. */
export const SplitPaymentStatus = {
    PENDING: 'pending',
    PARTIAL: 'partial',
    SETTLED: 'settled',
    CANCELLED: 'cancelled'
};

const assertCurrency = (currencyCode, fn) => {
    const code = String(currencyCode ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
        throw new Boom(`${fn}: "currencyCode" must be a 3-letter ISO code, got "${currencyCode}"`, {
            statusCode: 400,
            data: { currencyCode }
        });
    }
    return code;
};

/**
 * Build a WhatsApp money value from a human amount.
 *
 * ```js
 * money(25.5, 'USD')     // { value: 25500, offset: 1000, currencyCode: 'USD' }
 * money(15000, 'IDR')    // { value: 15000, offset: 1, currencyCode: 'IDR' }  (no decimals)
 * readMoney(money(25.5, 'USD'))   // 25.5
 * ```
 */
export const money = (amount, currencyCode, { offset } = {}) => {
    const code = assertCurrency(currencyCode, 'money');
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        throw new Boom('money: "amount" must be a finite number', { statusCode: 400, data: { amount } });
    }
    const resolvedOffset = offset ?? (MONEY_ZERO_DECIMAL_CURRENCIES.includes(code) ? 1 : MONEY_OFFSET);
    if (!Number.isInteger(resolvedOffset) || resolvedOffset < 1) {
        throw new Boom('money: "offset" must be a positive integer (1, 100, 1000…)', {
            statusCode: 400,
            data: { offset: resolvedOffset }
        });
    }
    const scaled = amount * resolvedOffset;
    const value = Math.round(scaled);
    if (Math.abs(scaled - value) > 1e-6) {
        throw new Boom(`money: ${amount} ${code} has more precision than offset ${resolvedOffset} can carry`, {
            statusCode: 400,
            data: { amount, offset: resolvedOffset }
        });
    }
    return { value, offset: resolvedOffset, currencyCode: code };
};

/** Read a WhatsApp money value back into a plain number. */
export const readMoney = (value) => {
    const raw = value?.value ?? value?.amount1000;
    const offset = Number(value?.offset ?? (value?.amount1000 !== undefined ? MONEY_OFFSET : undefined));
    if (raw === undefined || raw === null || !Number.isFinite(Number(raw)) || !Number.isFinite(offset) || offset < 1) {
        return null;
    }
    return {
        amount: Number(raw) / offset,
        currencyCode: value?.currencyCode ? String(value.currencyCode).toUpperCase() : undefined,
        offset
    };
};

const normalizeParticipants = (participants, fn) => {
    const list = (Array.isArray(participants) ? participants : [participants]).filter(Boolean);
    if (!list.length) {
        throw new Boom(`${fn}: at least one participant is required`, { statusCode: 400 });
    }
    return list.map(entry => {
        const jid = typeof entry === 'string' ? entry : entry?.jid;
        if (!jid) {
            throw new Boom(`${fn}: every participant needs a jid`, { statusCode: 400, data: { entry } });
        }
        return {
            jid,
            ...(typeof entry === 'object' && entry.amount !== undefined ? { amount: entry.amount } : {}),
            status: (typeof entry === 'object' && entry.status) || SplitPaymentStatus.PENDING
        };
    });
};

/**
 * A split-payment request: one total, split evenly (or by explicit per-person amounts).
 *
 * ```js
 * buildSplitPayment({ total: 240000, currencyCode: 'IDR', participants: ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
 *                     note: 'Dinner' })
 * ```
 */
export const buildSplitPayment = ({ total, currencyCode, participants, note, requestId, dueAt } = {}) => {
    const code = assertCurrency(currencyCode, 'buildSplitPayment');
    const people = normalizeParticipants(participants, 'buildSplitPayment');
    const totalMoney = money(total, code);
    const explicit = people.filter(person => person.amount !== undefined);
    if (explicit.length && explicit.length !== people.length) {
        throw new Boom('buildSplitPayment: give an amount for every participant, or for none of them', {
            statusCode: 400
        });
    }
    let shares;
    if (explicit.length) {
        shares = people.map(person => ({ ...person, share: money(person.amount, code) }));
        const sum = shares.reduce((acc, person) => acc + person.share.value, 0);
        if (sum !== totalMoney.value) {
            throw new Boom(`buildSplitPayment: the shares add up to ${sum / totalMoney.offset}, not ${total}`, {
                statusCode: 400,
                data: { sum, total: totalMoney.value }
            });
        }
    }
    else {
        // split evenly, giving the remainder (in the smallest unit) to the first people
        const base = Math.floor(totalMoney.value / people.length);
        const remainder = totalMoney.value - base * people.length;
        shares = people.map((person, index) => ({
            ...person,
            share: { value: base + (index < remainder ? 1 : 0), offset: totalMoney.offset, currencyCode: code }
        }));
    }
    return {
        requestId: requestId || `SP${Date.now().toString(36).toUpperCase()}`,
        status: SplitPaymentStatus.PENDING,
        total: totalMoney,
        currencyCode: code,
        ...(note ? { note } : {}),
        ...(dueAt ? { dueAt: dueAt instanceof Date ? dueAt.getTime() : Number(dueAt) } : {}),
        participants: shares,
        createdAt: Date.now()
    };
};

/** Apply a payment/decline to a split request and recompute its status. */
export const buildSplitPaymentUpdate = (split, { jid, status = SplitPaymentStatus.SETTLED, paidAt = Date.now() } = {}) => {
    if (!split?.participants?.length) {
        throw new Boom('buildSplitPaymentUpdate: pass a split built by buildSplitPayment()', { statusCode: 400 });
    }
    if (!Object.values(SplitPaymentStatus).includes(status)) {
        throw new Boom(`buildSplitPaymentUpdate: unknown status "${status}"`, {
            statusCode: 400,
            data: { status, allowed: Object.values(SplitPaymentStatus) }
        });
    }
    if (!split.participants.some(person => person.jid === jid)) {
        throw new Boom(`buildSplitPaymentUpdate: "${jid}" is not part of this split`, { statusCode: 400, data: { jid } });
    }
    const participants = split.participants.map(person => (person.jid === jid ? { ...person, status, paidAt } : person));
    const settled = participants.filter(person => person.status === SplitPaymentStatus.SETTLED).length;
    const next = settled === participants.length
        ? SplitPaymentStatus.SETTLED
        : settled > 0
            ? SplitPaymentStatus.PARTIAL
            : split.status === SplitPaymentStatus.CANCELLED ? SplitPaymentStatus.CANCELLED : SplitPaymentStatus.PENDING;
    return { ...split, participants, status: next, updatedAt: Date.now() };
};

/** Read a split payment back: who still owes what. */
export const readSplitPayment = (split) => {
    if (!split?.participants?.length) {
        return null;
    }
    const outstanding = split.participants.filter(person => person.status !== SplitPaymentStatus.SETTLED);
    const owedValue = outstanding.reduce((acc, person) => acc + (person.share?.value ?? 0), 0);
    const offset = split.total?.offset ?? MONEY_OFFSET;
    return {
        requestId: split.requestId,
        status: split.status,
        currencyCode: split.currencyCode,
        total: readMoney(split.total)?.amount ?? null,
        paid: ((split.total?.value ?? 0) - owedValue) / offset,
        outstanding: outstanding.map(person => ({
            jid: person.jid,
            amount: (person.share?.value ?? 0) / offset,
            status: person.status
        })),
        settled: split.participants.length - outstanding.length,
        of: split.participants.length
    };
};

/** A "you still owe me" reminder for a split payment or a one-off request. */
export const buildPaymentReminder = ({ jid, amount, currencyCode, note, requestId, dueAt } = {}) => {
    if (!jid) {
        throw new Boom('buildPaymentReminder: "jid" is required', { statusCode: 400 });
    }
    const value = money(amount, currencyCode);
    return {
        reminderId: `PR${Date.now().toString(36).toUpperCase()}`,
        ...(requestId ? { requestId } : {}),
        jid,
        amount: value,
        ...(note ? { note } : {}),
        ...(dueAt ? { dueAt: dueAt instanceof Date ? dueAt.getTime() : Number(dueAt) } : {}),
        sentAt: Date.now()
    };
};

/** Read a reminder back, including whether it is overdue. */
export const readPaymentReminder = (reminder, { now = Date.now() } = {}) => {
    if (!reminder?.jid || !reminder?.amount) {
        return null;
    }
    const value = readMoney(reminder.amount);
    return {
        reminderId: reminder.reminderId,
        requestId: reminder.requestId,
        jid: reminder.jid,
        amount: value?.amount ?? null,
        currencyCode: value?.currencyCode,
        note: reminder.note,
        dueAt: reminder.dueAt,
        overdue: !!reminder.dueAt && reminder.dueAt < now
    };
};

/**
 * The "you are out of quota, upgrade" button used on AI/premium cards.
 * Returns a native-flow button descriptor the Button/AIRich builders accept.
 */
export const quotaUpsellButton = (label, { url, price, currencyCode, id } = {}) => {
    const text = String(label ?? '').trim();
    if (!text) {
        throw new Boom('quotaUpsellButton: a label is required', { statusCode: 400 });
    }
    const amount = price !== undefined ? money(price, currencyCode ?? 'USD') : undefined;
    return url
        ? {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: text, url, ...(amount ? { price: amount } : {}) })
        }
        : {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: text, id: id || 'quota_upsell', ...(amount ? { price: amount } : {}) })
        };
};

/** A whole upsell block: headline, reason, and one or more upsell buttons. */
export const quotaUpsellSection = ({ title, body, buttons, remaining, limit } = {}) => {
    const list = (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean);
    if (!list.length) {
        throw new Boom('quotaUpsellSection: at least one button is required', { statusCode: 400 });
    }
    if (remaining !== undefined && limit !== undefined && remaining > limit) {
        throw new Boom('quotaUpsellSection: "remaining" cannot exceed "limit"', {
            statusCode: 400,
            data: { remaining, limit }
        });
    }
    return {
        quotaUpsell: {
            title: String(title ?? 'Out of quota'),
            ...(body ? { body } : {}),
            ...(remaining !== undefined ? { remaining } : {}),
            ...(limit !== undefined ? { limit } : {}),
            buttons: list.map(button => (typeof button === 'string' ? quotaUpsellButton(button) : button))
        }
    };
};
