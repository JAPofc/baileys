/** Session tools — inspect, repair, export/import and migrate auth sessions. */

export declare const SESSION_EXPORT_MAGIC: string;
export declare const SESSION_EXPORT_MAGIC_ENC: string;
export declare const AUTH_KEY_TYPES: string[];

export interface AuthAnalysis {
	folder: string;
	/** registered + no corrupted files + no issues. */
	ok: boolean;
	registered: boolean;
	me?: string;
	platform?: string;
	/** File counts per category (creds, pre-key, session, …). */
	counts: Record<string, number>;
	totalFiles: number;
	totalBytes: number;
	corrupted: Array<{ file: string; error: string }>;
	issues: string[];
}

export declare const analyzeAuthState: (folder: string) => Promise<AuthAnalysis>;

export declare const repairAuthFolder: (
	folder: string,
	options?: { suffix?: string }
) => Promise<{ repaired: string[]; checked: number }>;

/**
 * One portable string holding the whole session — treat it like a password.
 * Pass { password } for an AES-encrypted export (JAPSESS2).
 */
export declare const exportAuthToString: (folder: string, options?: { password?: string }) => Promise<string>;

export declare const isSessionExportString: (value: unknown) => boolean;
/** True when the export string needs a password to import. */
export declare const isEncryptedSessionExport: (value: unknown) => boolean;

export declare const importAuthFromString: (
	sessionString: string,
	folder: string,
	options?: { password?: string }
) => Promise<{ files: number }>;

/** Audit session file permissions (group/other access = leak risk). */
export declare const checkAuthPermissions: (folder: string) => Promise<{
	ok: boolean;
	insecure: Array<{ file: string; mode: string }>;
	folderMode: number | null;
}>;

/** chmod 0700 the folder + 0600 every session file. */
export declare const hardenAuthFolder: (folder: string) => Promise<{ changed: number }>;

/**
 * Push a folder session into any auth-state adapter via keys.set().
 * Ambiguously-encoded ids are migrated as-is and listed in warnings.
 */
export declare const migrateFolderToAuthState: (
	folder: string,
	targetState: { creds: Record<string, unknown>; keys: { set(data: Record<string, Record<string, unknown>>): void | Promise<void> } },
	saveCreds?: () => void | Promise<void>
) => Promise<{ migrated: Record<string, number>; warnings: string[] }>;

/** Quick boolean: is this creds a completed, registered login? */
export declare const isRegistered: (creds: any) => boolean;
/** Non-secret snapshot of creds for safe logging (no private keys). */
export declare const credsPublicInfo: (creds: any) => {
	registered: boolean;
	me?: string;
	name?: string;
	platform?: string;
	registrationId?: number;
	advSecretKeyPresent: boolean;
	deviceId?: unknown;
} | null;
/** Short stable non-secret fingerprint of the session identity key. */
export declare const getSessionFingerprint: (creds: any, opts?: { length?: number }) => string | null;
/** One-line human summary of an analyzeAuthState() report. */
export declare const summarizeAuthReport: (report: any) => string;
/** Estimate pre-key pool health from an analyzeAuthState() report. */
export declare const estimatePreKeyHealth: (report: any, opts?: { minHealthy?: number }) => {
	count: number;
	healthy: boolean;
	low: boolean;
	needsUpload: boolean;
};
/** Parse an export string's header without decrypting/decompressing. */
export declare const parseSessionExportHeader: (value: string) => {
	valid: boolean;
	magic?: string;
	encrypted?: boolean;
	version?: number;
	payloadBytes?: number;
};
/** Stable sha256 fingerprint (hex) of an export string. */
export declare const sessionExportFingerprint: (value: string, opts?: { length?: number }) => string | null;
