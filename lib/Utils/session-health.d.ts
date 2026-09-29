/**
 * Session-health monitor + JID canonicalization helpers.
 * Detects bursts of undecryptable (CIPHERTEXT) messages per contact — the
 * signature of a broken Signal session — and canonicalizes JIDs across the
 * PN/LID split so a contact is always keyed the same way.
 */
export declare const canonicalizeJid: (jid?: string) => string | undefined;
export declare const makeJidCanonicalizer: (sock: any, opts?: {
    prefer?: 'pn' | 'lid';
}) => (jid?: string) => Promise<string | undefined>;
export interface SessionHealthEvent {
    jid: string;
    failures: number;
    total: number;
    windowMs?: number;
    at: number;
}
export interface SessionHealthStatus {
    jid: string;
    healthy: boolean;
    failures: number;
    total: number;
    lastFailureAt: number;
}
export interface SessionHealthStats {
    tracked: number;
    unhealthy: number;
    healthy: number;
    totalFailures: number;
    badMacThreshold: number;
    windowMs: number;
}
export interface SessionHealthMonitor {
    bind(sock: any, bindOpts?: { sweepMs?: number }): () => void;
    unbind(): void;
    record(jid: string): void;
    sweep(): void;
    isHealthy(jid: string): boolean;
    getStatus(jid: string): SessionHealthStatus;
    getUnhealthy(): Array<{ jid: string; failures: number; total: number; lastFailureAt: number }>;
    getStats(): SessionHealthStats;
    reset(jid?: string): void;
    onUnhealthy(cb: (e: SessionHealthEvent) => void): () => void;
    onRecover(cb: (e: SessionHealthEvent) => void): () => void;
    onError(cb: (err: unknown) => void): () => void;
}
export declare const createSessionHealthMonitor: (options?: {
    badMacThreshold?: number;
    windowMs?: number;
    maxTracked?: number;
    ignoreFromMe?: boolean;
    keyBy?: (sock: any) => (jid: string) => string | Promise<string>;
    now?: () => number;
}) => SessionHealthMonitor;
