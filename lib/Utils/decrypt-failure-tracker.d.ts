export interface DecryptFailureTracker {
    /** Record a failure for `key`; returns whether to log it and any suppressed backlog from the previous window. */
    hit(key: string): { log: boolean; occurrences: number; suppressedSincePrevWindow: number };
    /** Current suppressed count for a key in its active window (0 if unknown). */
    suppressedFor(key: string): number;
    clear(): void;
    readonly size: number;
}

export interface DecryptFailureTrackerOptions {
    windowMs?: number;
    maxPerWindow?: number;
    max?: number;
    now?: () => number;
}

export declare const createDecryptFailureTracker: (opts?: DecryptFailureTrackerOptions) => DecryptFailureTracker;

/** Resolve a socket `decryptFailureLog` config value into a tracker (or undefined when unlimited). */
export declare const resolveDecryptFailureTracker: (decryptFailureLog?: false | DecryptFailureTrackerOptions) => DecryptFailureTracker | undefined;
