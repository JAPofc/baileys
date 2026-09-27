/** Flood guard — per-user burst detection in chats. */

export interface FloodGuardOptions {
	/** Messages within the window that count as flooding. Default 10. */
	maxMessages?: number;
	/** Sliding window size in ms. Default 10000. */
	windowMs?: number;
	/** Only watch group chats. Default true. */
	groupsOnly?: boolean;
	/** Also count the bot's own messages. Default false. */
	includeFromMe?: boolean;
	/** Suppress further alerts from a flooder for this long. Default 0. */
	autoMuteMs?: number;
	/** Max (chat,user) buckets tracked (LRU). Default 2000. */
	maxTracked?: number;
}

export interface FloodEvent {
	chat: string;
	user: string;
	count: number;
	windowMs: number;
	mutedUntil?: number;
	msg: Record<string, unknown>;
}

export interface FloodGuard {
	handler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	/** Fires once per burst per user. */
	onFlood(cb: (event: FloodEvent) => void): () => void;
	getCount(chat: string, user: string): number;
	reset(chat: string, user: string): void;
	isMuted(chat: string, user: string): boolean;
	muteFor(chat: string, user: string, ms: number): void;
	unmute(chat: string, user: string): void;
	clear(): void;
}

export declare const createFloodGuard: (options?: FloodGuardOptions) => FloodGuard;
