/** Always online — keep presence refreshed on an interval. */

export interface AlwaysOnlineOptions {
	/** Refresh interval. Default 60000. */
	intervalMs?: number;
	/** Presence to maintain. Default 'available'. */
	presence?: string;
}

export interface AlwaysOnline {
	/** Push presence now (also called by the interval). */
	push(): Promise<void>;
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	/** Switch the maintained presence live. */
	setPresence(presence: string): void;
	readonly presence: string;
	onError(cb: (info: { error: unknown; presence: string }) => void): () => void;
	readonly stats: { updates: number; failures: number };
}

export declare const createAlwaysOnline: (sock: unknown, options?: AlwaysOnlineOptions) => AlwaysOnline;
