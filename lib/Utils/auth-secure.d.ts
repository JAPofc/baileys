import type { AuthenticationState, SignalDataTypeMap } from '../Types/Auth.js';
import type { Logger } from 'pino';

export declare const ENC_MAGIC: string;
export declare const BACKUP_MAGIC: string;

export declare function deriveKey(password: string, salt: Buffer): Buffer;
export declare function encryptJSON(value: any, password: string): string;
export declare function decryptJSON(payload: string, password: string): any;
export declare function isEncryptedPayload(value: unknown): boolean;

export declare function useEncryptedFileAuthState(folder: string, opts: {
    password: string;
    logger?: Logger;
}): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clearState: () => Promise<void> }>;

export declare function useEncryptedSingleFileAuthState(file: string, opts: {
    password: string;
    logger?: Logger;
}): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    flush: () => Promise<void>;
    clearState: () => Promise<void>;
}>;

export declare function backupAuthState(src: string, outFile: string, opts: { password: string }): Promise<{
    outFile: string; files: number; createdAt: string;
}>;

/** Timestamped, password-encrypted backups with automatic pruning. */
export declare function backupAuthStateRotating(src: string, outDir: string, opts: {
    password: string;
    /** Backups to keep. Default 5. */
    keep?: number;
    /** File name prefix. Default 'auth-backup'. */
    prefix?: string;
}): Promise<{
    outFile: string;
    files: number;
    createdAt: string;
    removed: string[];
    kept: number;
}>;
export declare function restoreAuthState(backupFile: string, dest: string, opts: {
    password: string; single?: boolean;
}): Promise<{ dest: string; files: number; createdAt: string }>;

/**
 * Re-encrypt every auth file in `folder` with a new password (or encrypt a legacy plaintext
 * folder for the first time). Atomic per file; unreadable files are reported, never deleted.
 */
export declare function rotateAuthPassword(folder: string, opts: {
    oldPassword?: string; newPassword: string; logger?: Logger;
}): Promise<{
    rotated: number;
    migratedFromPlaintext: number;
    failed: { file: string; reason: string }[];
    skipped: string[];
}>;

export declare function writeAuthIntegrity(folder: string, opts?: { secret?: string }): Promise<{
    createdAt: string; hmac: boolean; sums: Record<string, string>;
}>;

export declare function verifyAuthIntegrity(folder: string, opts?: { secret?: string }): Promise<{
    ok: boolean; error?: string; mismatched: string[]; missing: string[]; extra: string[];
}>;

export declare function repairAuthState(folder: string, opts?: {
    password?: string; backupFile?: string; backupPassword?: string; logger?: Logger;
}): Promise<{
    ok: boolean; checked: number; quarantined: string[]; credsRestored: boolean; error?: string;
}>;

export interface RateLimitResult {
    allowed: boolean;
    retryAfterMs: number;
}

export declare function createRateLimiter(opts?: {
    max?: number; windowMs?: number; minIntervalMs?: number; now?: () => number;
}): {
    stats: { allowed: number; blocked: number };
    /** Spend a slot if the key is allowed. Updates `stats`. */
    check: (key?: string) => RateLimitResult;
    /**
     * Would `check()` allow this key right now? Consumes nothing and leaves
     * `stats` alone — ask before deciding whether to spend the slot.
     */
    peek: (key?: string) => RateLimitResult;
    /**
     * Requests this key may still make inside the current window. Consumes
     * nothing. Ignores `minIntervalMs` (a spacing rule, not a budget).
     */
    remaining: (key?: string) => number;
    /** How many keys are currently tracked — expired ones are dropped (§2.206). */
    readonly trackedKeys: number;
    reset: (key?: string) => void;
};

export declare function withPairingGuard(sock: any, opts?: {
    maxPerHour?: number; globalMaxPerHour?: number; minIntervalMs?: number;
    logger?: Logger; now?: () => number;
}): {
    restore: () => void;
    limiter: ReturnType<typeof createRateLimiter>;
    global: ReturnType<typeof createRateLimiter>;
};

export declare function createQRGuard(opts?: {
    ttlMs?: number; now?: () => number;
    onFirst?: (qr: string) => void; onBlocked?: (count: number) => void;
}): {
    stats: { passed: number; blocked: number };
    handle: (qr: string | null | undefined) => string | null;
    reset: () => void;
    readonly active: boolean;
};

export declare function redactSecrets<T>(value: T, opts?: { extraKeys?: string[]; maxDepth?: number }): T;
export declare function secureLogger(base: Logger, opts?: { extraKeys?: string[] }): Logger;

export declare function secureLogout(sock: any, opts?: {
    authFolder?: string; authFile?: string; passes?: number; logger?: Logger;
}): Promise<{ loggedOut: boolean; wiped: string[]; credsScrubbed: boolean }>;

/** How many per-file mutexes the encrypted auth states hold (with paths when `detail`). */
export declare function countAuthFileLocks(opts?: { detail?: boolean }): number | { count: number; paths: string[] };
