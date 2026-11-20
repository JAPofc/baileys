import type { proto } from '../../WAProto/index.js';

export declare const SCHEDULED_MSG_MARKER: string;
export declare const SCHEDULED_MSG_STATUS: {
    readonly PENDING: 'pending';
    readonly SENT: 'sent';
    readonly CANCELLED: 'cancelled';
    readonly FAILED: 'failed';
};
export type ScheduledMessageStatus = 'pending' | 'sent' | 'cancelled' | 'failed';
export declare const SCHEDULED_MSG_MAX_DELAY_MS: number;
export declare const SCHEDULED_MSG_MIN_DELAY_MS: number;

export interface EncodedScheduledMessage {
    scheduleId: string;
    scheduledAt: number;
    delayMs: number;
    status: ScheduledMessageStatus;
    content: Record<string, any>;
}
/** Wrap content with a scheduling envelope (throws when `at` is in the past or too far out). */
export declare function encodeScheduledMessage(content: Record<string, any>, opts: {
    at: Date | number | string;
    scheduleId?: string;
    now?: number;
    timezone?: string;
    maxDelayMs?: number;
}): EncodedScheduledMessage;
export interface DecodedScheduledMessage {
    scheduleId: string;
    scheduledAt: number;
    createdAt?: number;
    status: ScheduledMessageStatus;
    timezone?: string;
    isDue: (now?: number) => boolean;
    content: Record<string, any>;
}
/** Read the envelope back out; `null` when the message is not scheduled. */
export declare function decodeScheduledMessage(input: any): DecodedScheduledMessage | null;
/** Protocol message that cancels an already-announced scheduled message. */
export declare function buildUnscheduleProtocolMessage(key: proto.IMessageKey, opts?: {
    scheduleId?: string;
}): proto.IMessage;

export declare const SCHEDULED_MSG_REVEAL_KEY_LEN: number;
/** The `<scheduled_msg>` stanza child. */
export declare function buildScheduledMsgMetaNode(opts: {
    scheduleId: string; scheduledAt: number; timezone?: string;
}): import('../WABinary/index.js').BinaryNode;
/** Validate a schedule time without throwing. */
export declare function isScheduledTimeValid(at: Date | number | string, opts?: {
    now?: number; maxDelayMs?: number; minDelayMs?: number;
}): { valid: boolean; reason: string | null; scheduledAt: number | null; delayMs: number | null };
/** A fresh 32-byte reveal key. */
export declare function generateRevealKey(): Buffer;
/** The shareable id of a reveal key (never the key itself). */
export declare function generateRevealKeyId(key: Uint8Array | Buffer): string;
export interface RevealEnvelope { keyId: string; iv: Buffer; tag: Buffer; ciphertext: Buffer }
/** Encrypt a payload under a reveal key (AES-256-GCM). */
export declare function encryptWithRevealKey(payload: any, key: Uint8Array | Buffer): RevealEnvelope;
/** Decrypt a reveal envelope. */
export declare function decryptWithRevealKey(envelope: RevealEnvelope, key: Uint8Array | Buffer, opts?: { json?: boolean }): any;
/** Send a locked payload now, hand out the key later. */
export declare function buildConditionalRevealMessage(content: Record<string, any>, key: Uint8Array | Buffer, opts?: {
    revealAt?: Date | number | string; condition?: Record<string, any> | string; placeholder?: string;
}): {
    keyId: string;
    revealAt?: number;
    condition?: Record<string, any> | string;
    envelope: RevealEnvelope;
    content: Record<string, any>;
    reveal: (revealKey: Uint8Array | Buffer) => any;
};
