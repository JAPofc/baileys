export declare const MONEY_OFFSET: number;
export declare const MONEY_ZERO_DECIMAL_CURRENCIES: string[];
export declare const SplitPaymentStatus: {
    readonly PENDING: 'pending';
    readonly PARTIAL: 'partial';
    readonly SETTLED: 'settled';
    readonly CANCELLED: 'cancelled';
};
export type SplitPaymentStatusValue = 'pending' | 'partial' | 'settled' | 'cancelled';
export interface MoneyValue { value: number; offset: number; currencyCode: string }
/** Build a WhatsApp money value from a human amount (throws on impossible precision). */
export declare function money(amount: number, currencyCode: string, opts?: { offset?: number }): MoneyValue;
/** Read a money value back into a plain number. */
export declare function readMoney(value: any): { amount: number; currencyCode?: string; offset: number } | null;

export interface SplitPaymentParticipant {
    jid: string;
    amount?: number;
    status: SplitPaymentStatusValue;
    share?: MoneyValue;
    paidAt?: number;
}
export interface SplitPayment {
    requestId: string;
    status: SplitPaymentStatusValue;
    total: MoneyValue;
    currencyCode: string;
    note?: string;
    dueAt?: number;
    participants: SplitPaymentParticipant[];
    createdAt: number;
    updatedAt?: number;
}
/** A split-payment request, split evenly or by explicit per-person amounts. */
export declare function buildSplitPayment(opts: {
    total: number;
    currencyCode: string;
    participants: (string | { jid: string; amount?: number })[];
    note?: string;
    requestId?: string;
    dueAt?: Date | number;
}): SplitPayment;
/** Apply a payment/decline and recompute the status. */
export declare function buildSplitPaymentUpdate(split: SplitPayment, opts: {
    jid: string; status?: SplitPaymentStatusValue; paidAt?: number;
}): SplitPayment;
/** Who still owes what. */
export declare function readSplitPayment(split: SplitPayment): {
    requestId: string; status: SplitPaymentStatusValue; currencyCode: string;
    total: number | null; paid: number;
    outstanding: { jid: string; amount: number; status: SplitPaymentStatusValue }[];
    settled: number; of: number;
} | null;
/** A "you still owe me" reminder. */
export declare function buildPaymentReminder(opts: {
    jid: string; amount: number; currencyCode: string; note?: string; requestId?: string; dueAt?: Date | number;
}): Record<string, any>;
/** Read a reminder back, including whether it is overdue. */
export declare function readPaymentReminder(reminder: any, opts?: { now?: number }): Record<string, any> | null;
/** A native-flow upsell button. */
export declare function quotaUpsellButton(label: string, opts?: {
    url?: string; price?: number; currencyCode?: string; id?: string;
}): { name: string; buttonParamsJson: string };
/** A whole upsell block. */
export declare function quotaUpsellSection(opts: {
    title?: string; body?: string; buttons: (string | Record<string, any>)[]; remaining?: number; limit?: number;
}): { quotaUpsell: Record<string, any> };
