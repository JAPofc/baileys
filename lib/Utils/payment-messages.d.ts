import type { proto } from '../../WAProto/index.js';

/** The wire multiplier for a money value: `value / offset` is the human amount. */
export declare const WIRE_MONEY_OFFSET: number;
export declare const SPLIT_PAYMENT_PARTICIPANT_STATUS: Readonly<typeof proto.Message.SplitPaymentParticipant.SplitPaymentStatus>;
export declare const PAYMENT_REMINDER_FREQUENCY: Readonly<typeof proto.Message.PaymentReminderMessage.ReminderFrequency>;
export declare const PAYMENT_REMINDER_STATUS: Readonly<typeof proto.Message.PaymentReminderMessage.ReminderStatus>;

export interface ReadWireMoney {
    /** The human amount (`value / offset`). */
    amount: number;
    value: number;
    offset: number;
    currency?: string;
}

/** Build a `Money` from a human amount: `money(125, 'IDR')` → `{ value: 125000, offset: 1000 }`. */
export declare function wireMoney(amount: number, currency?: string, offset?: number): proto.IMoney;
export declare function readWireMoney(value?: proto.IMoney | null): ReadWireMoney | undefined;

export interface SplitPaymentParticipantInput {
    jid: string;
    /** Human amount; omit to let `splitEvenly` fill it in. */
    amount?: number;
    currency?: string;
    status?: number | 'PENDING' | 'PAID';
}

export interface SplitPaymentInput {
    splitId: string | number;
    /** Human total. Required when `splitEvenly` is set. */
    total?: number;
    currency?: string;
    description?: string;
    requesterJid?: string;
    participants: SplitPaymentParticipantInput[];
    createdAt?: number | Date;
    contextInfo?: proto.IContextInfo;
    /** Divide `total` across the participants that did not name their own amount. */
    splitEvenly?: boolean;
}

export declare function buildSplitPaymentMessage(input: SplitPaymentInput): proto.Message.ISplitPaymentMessage;
export declare function buildSplitPaymentUpdateMessage(input: { splitId: string | number; participantJid: string }): proto.Message.ISplitPaymentUpdateMessage;

export interface PaymentReminderInput {
    reminderId: string | number;
    instanceId?: string | number;
    description?: string;
    frequency?: number | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'REMINDER_FREQUENCY_UNKNOWN';
    status?: number | 'ACTIVE' | 'CANCELLED_BY_CREATOR' | 'STOPPED_BY_RECEIVER' | 'EXPIRED' | 'PAID' | 'REMINDER_STATUS_UNKNOWN';
    /** Human amount. */
    amount?: number;
    currency?: string;
    payeeVpa?: string;
    payeeJid?: string;
    payerJid?: string;
}

export declare function buildPaymentReminderMessage(input: PaymentReminderInput): proto.Message.IPaymentReminderMessage;

export interface ReadSplitPayment {
    splitId?: string;
    total?: ReadWireMoney;
    description?: string;
    requesterJid?: string;
    createdAtMs?: number;
    participants: { jid?: string; amount?: ReadWireMoney; status: number; paid: boolean }[];
    /** How much of the bill is already settled, in human units. */
    settled?: number;
    outstanding?: number;
    complete: boolean;
}

export interface ReadPaymentReminder {
    reminderId?: string;
    instanceId?: string;
    description?: string;
    frequency: number;
    status: number;
    amount?: ReadWireMoney;
    payeeVpa?: string;
    payeeJid?: string;
    payerJid?: string;
    active: boolean;
}

export declare function readSplitPaymentMessage(msg: any): ReadSplitPayment | null;
export declare function readSplitPaymentUpdateMessage(msg: any): { splitId?: string; participantJid?: string } | null;
export declare function readPaymentReminderMessage(msg: any): ReadPaymentReminder | null;
export declare function readPaymentMessage(msg: any):
    | { type: 'split'; value: ReadSplitPayment }
    | { type: 'splitUpdate'; value: { splitId?: string; participantJid?: string } }
    | { type: 'reminder'; value: ReadPaymentReminder }
    | null;

/** Bridge the in-app bookkeeping object from `buildSplitPayment()` into a sendable message. */
export declare function toSplitPaymentMessage(split: any, opts?: { description?: string; requesterJid?: string }): proto.Message.ISplitPaymentMessage;
