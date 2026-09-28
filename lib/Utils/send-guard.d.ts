/** Options for the anti-ban outgoing send pacer. All limits opt-in (0 = off). */
export interface SendGuardOptions {
    /** Global cap across all chats, e.g. 20 → one send per 3s on average. Default 0 (off). */
    messagesPerMinute?: number;
    /** Minimum gap between two sends to the SAME jid, in ms. Default 0 (off). */
    perChatDelayMs?: number;
    /** Randomize each gap by ±ratio (0.2 = ±20%) so pacing isn't robotic. Default 0.2. */
    jitterRatio?: number;
    /** Reject acquire() when this many sends are already queued. Default 5000. */
    maxQueue?: number;
}

export interface SendGuard {
    /** Resolves when this send may proceed. FIFO per chat, fair globally. */
    acquire(jid?: string): Promise<void>;
    /** Sends currently waiting for a slot. */
    readonly pending: number;
    /** Effective settings (for doctor/debug output). */
    readonly settings: Required<SendGuardOptions>;
}

/**
 * Create a standalone send pacer (the same engine `config.sendRateLimit`
 * wires into `sock.sendMessage` automatically).
 */
export function createSendGuard(options?: SendGuardOptions): SendGuard;
