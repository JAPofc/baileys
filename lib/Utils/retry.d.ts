/** Async retry with exponential backoff. */
export interface BackoffOptions {
    baseDelayMs?: number;
    factor?: number;
    maxDelayMs?: number;
    jitter?: boolean;
    random?: () => number;
}
export declare const computeBackoffDelay: (attempt: number, options?: BackoffOptions) => number;
/** Build an `AbortError` (name `'AbortError'`), or return `reason` when provided. */
export declare const createAbortError: (reason?: unknown) => unknown;
export interface RetryOptions extends BackoffOptions {
    attempts?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
    sleep?: (ms: number) => Promise<void>;
    /** Cancel the retry loop: aborts before the first attempt if already aborted, and interrupts a backoff wait mid-flight. Rejects with the signal's `reason` or an `AbortError`. */
    signal?: AbortSignal;
}
export declare const retryWithBackoff: <T>(fn: (attempt: number) => Promise<T> | T, options?: RetryOptions) => Promise<T>;
