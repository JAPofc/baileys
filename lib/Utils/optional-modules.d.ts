/** Import an optional module once, remembering success *and* failure. */
export declare function loadOptionalModule(name: string, opts?: { required?: boolean; hint?: string }): Promise<any | null>;
/** Forget a cached import result so the next call retries. */
export declare function forgetOptionalModule(name: string): boolean;
/** `sharp`, or null when it is not installed. */
export declare function loadSharp(opts?: { required?: boolean; hint?: string }): Promise<any | null>;
/** `fluent-ffmpeg`, or null. */
export declare function loadFfmpeg(opts?: { required?: boolean; hint?: string }): Promise<any | null>;

/** A TTL + LRU cache with promise de-duplication. */
export declare class TTLCache<T = any> {
    constructor(opts?: { ttlMs?: number; max?: number; now?: () => number });
    readonly ttlMs: number;
    readonly max: number;
    readonly size: number;
    hits: number; misses: number; expirations: number; evictions: number;
    set(key: string, value: T, opts?: { ttlMs?: number }): this;
    get(key: string): T | undefined;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    sweep(): number;
    wrap(key: string, producer: () => Promise<T> | T, opts?: { ttlMs?: number }): Promise<T>;
    keys(): string[];
    getStats(): {
        size: number; max: number; ttlMs: number; hits: number; misses: number;
        expirations: number; evictions: number; inFlight: number;
    };
}

/** Fetch + shrink a link thumbnail (cached 10 min; works without sharp, just unscaled). */
export declare function prepareLinkThumbnail(url: string, opts?: {
    size?: number; timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch; cache?: TTLCache | null;
}): Promise<{ jpegThumbnail: Buffer; width?: number; height?: number; bytes: number; scaled: boolean; cached: boolean } | null>;
