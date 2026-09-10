import type { AuthenticationState, SignalDataTypeMap } from '../Types/Auth';
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

export declare function restoreAuthState(backupFile: string, dest: string, opts: {
    password: string; single?: boolean;
}): Promise<{ dest: string; files: number; createdAt: string }>;

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
    check: (key?: string) => RateLimitResult;
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
