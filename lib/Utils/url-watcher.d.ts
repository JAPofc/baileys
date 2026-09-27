/** URL watcher — poll an endpoint, get notified when its content changes. */

export interface UrlWatcherOptions {
	/** Poll interval. Default 60000. */
	intervalMs?: number;
	/** Per-request timeout. Default 15000. */
	timeoutMs?: number;
	headers?: Record<string, string>;
	/** Reduce the body before hashing/reporting (e.g. one JSON field). */
	extract?: (body: string) => unknown;
	/** fetch override (testing). */
	fetchImpl?: typeof fetch;
}

export interface UrlChangeEvent {
	url: string;
	body: string;
	hash: string;
	previousHash: string;
	at: number;
}

export interface UrlWatcher {
	/** Poll once (also primes the baseline). */
	check(): Promise<{ changed?: boolean; hash?: string; body?: string; error?: unknown }>;
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	onChange(cb: (event: UrlChangeEvent) => void): () => void;
	onError(cb: (info: { url: string; error: unknown }) => void): () => void;
	readonly lastBody: string | null;
	readonly stats: { checks: number; changes: number };
}

export declare const createUrlWatcher: (url: string, options?: UrlWatcherOptions) => UrlWatcher;
