/** Crash guard — survive uncaught exceptions/rejections on your terms. */

/** Circular-safe, depth-capped stringify that never throws. */
export declare const safeStringify: (
	value: unknown,
	options?: { maxDepth?: number; maxLength?: number; indent?: number }
) => string;

export interface CrashGuardOptions {
	/** Called for every caught error (async errors are swallowed safely). */
	onError?: (info: { type: 'uncaughtException' | 'unhandledRejection'; error: unknown; stats: Record<string, number> }) => unknown;
	logger?: unknown;
	/** Min gap between onError alerts per type (anti alert-storm). Default 0. */
	minAlertIntervalMs?: number;
	/** Exit after handling an uncaughtException. Default false (keep running). */
	exitOnUncaught?: boolean;
	exitCode?: number;
}

export interface CrashGuard {
	readonly stats: { uncaughtException: number; unhandledRejection: number };
	readonly isInstalled: boolean;
	/** Most recent caught error, or null. */
	readonly lastError: { type: string; error: unknown; at: number } | null;
	uninstall(): boolean;
}

/** Install process-level handlers. Throws if a guard is already installed. */
export declare const installCrashGuard: (options?: CrashGuardOptions) => CrashGuard;
