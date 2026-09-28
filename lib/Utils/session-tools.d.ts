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
