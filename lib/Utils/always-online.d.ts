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

/** Presence cycler — opt-in "composing…" bursts in chats you list. */
export interface PresenceCycler {
	/** Run one composing→paused burst now. */
	cycleOnce(): Promise<void>;
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	readonly stats: { cycles: number; failures: number };
}

export declare const createPresenceCycler: (sock: unknown, options: {
	/** REQUIRED — it never types in chats you did not list. */
	chats: string[];
	/** Mean gap between bursts. Default 10 min (Gaussian-jittered). */
	meanIntervalMs?: number;
	stdIntervalMs?: number;
	/** Composing duration. Default 3000. */
	typingMs?: number;
	random?: () => number;
}) => PresenceCycler;
