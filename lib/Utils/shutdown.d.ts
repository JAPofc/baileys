/** Shutdown manager — clean teardown on signals or on demand. */

export interface ShutdownManagerOptions {
	sock?: unknown;
	/** Flushed FIRST during teardown — the login must survive. */
	saveCreds?: () => void | Promise<void>;
	/** Per-step timeout. Default 10000. 0 disables. */
	timeoutMs?: number;
	/** Default ['SIGINT', 'SIGTERM']. */
	signals?: string[];
	/** process.exit() after teardown (code 1 when a step failed). Default false. */
	exit?: boolean;
	onError?: (info: { step: string; error: unknown }) => void;
}

export interface ShutdownResult {
	reason: string;
	/** Step names that completed. */
	steps: string[];
	errors: Array<{ step: string; error: unknown }>;
}

export interface ShutdownManager {
	/** Add a teardown hook (runs in registration order). Returns a remover. */
	register(name: string, fn: () => void | Promise<void>): () => void;
	register(fn: () => void | Promise<void>): () => void;
	/** Run the teardown once; later calls return the same promise. */
	shutdown(reason?: string): Promise<ShutdownResult>;
	/** Listen for the configured signals. Returns a detach function. */
	attach(): () => void;
	detach(): void;
	onDone(cb: (result: ShutdownResult) => void): () => void;
	readonly isShuttingDown: boolean;
	readonly hookCount: number;
}

export declare const createShutdownManager: (options?: ShutdownManagerOptions) => ShutdownManager;
