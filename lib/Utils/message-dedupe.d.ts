/**
 * Message de-duplication / idempotency guard — a bounded LRU of message keys
 * already handled, so a bot doesn't reply twice when WhatsApp re-delivers a
 * message (reconnect, history sync, placeholder resend, retries).
 */
export interface MessageDedupe {
    /** True if already recorded (and still fresh); records it when new. */
    seen(input: string | { id?: string; remoteJid?: string; fromMe?: boolean } | { key?: any } | null | undefined): boolean;
    /** Check membership without recording. */
    has(input: string | { id?: string; remoteJid?: string; fromMe?: boolean } | { key?: any } | null | undefined): boolean;
    /** Record a key without returning its previous state. */
    add(input: string | { id?: string; remoteJid?: string; fromMe?: boolean } | { key?: any } | null | undefined): void;
    /** Forget a single key. */
    delete(input: string | { id?: string; remoteJid?: string; fromMe?: boolean } | { key?: any } | null | undefined): boolean;
    /** Drop everything. */
    clear(): void;
    /** Number of keys currently tracked. */
    readonly size: number;
}
export declare const createMessageDedupe: (options?: {
    maxSize?: number;
    ttlMs?: number;
    now?: () => number;
}) => MessageDedupe;
