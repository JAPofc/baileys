/** Connection watchdog — detect silent half-open sockets. */

export interface ConnectionWatchdogOptions {
	/** Silence that counts as stale. Default 5 min. */
	staleMs?: number;
	/** Check frequency. Default 30000. */
	checkIntervalMs?: number;
	/** Events that count as activity. Default: messages/receipts/presence/… */
	events?: string[];
	/** Clock override (testing). */
	now?: () => number;
}

export interface StaleEvent {
	silentMs: number;
	lastActivity: number;
	at: number;
}

export interface ConnectionWatchdog {
	/** Mark the connection alive right now. */
	touch(): void;
	/** Run one staleness check. */
	check(): { silentMs: number; stale: boolean };
	bind(sock: unknown): () => void;
	unbind(): void;
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	/** Fires once per stale period (re-armed by new activity). */
	onStale(cb: (event: StaleEvent) => void): () => void;
	/** Fires when activity resumes after a stale period. */
	onActivity(cb: (info: { at: number }) => void): () => void;
	readonly lastActivity: number;
	readonly silentMs: number;
	readonly isStale: boolean;
	readonly stats: { staleCount: number };
	/** One-line status for dashboards/owner DMs. */
	getReport(): string;
}

export declare const createConnectionWatchdog: (options?: ConnectionWatchdogOptions) => ConnectionWatchdog;
