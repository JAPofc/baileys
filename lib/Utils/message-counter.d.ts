/** Message counter — per-chat/per-user daily activity + digests. */

export interface MessageCounter {
	handler(upsert: { messages: unknown[]; type?: string }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	/** Today's most active users, busiest first. */
	getTopChatters(chat: string, limit?: number): Array<{ user: string; count: number }>;
	getUserCount(chat: string, user: string): number;
	getChatTotal(chat: string): number;
	/** Finished days, oldest first. */
	getHistory(chat: string, days?: number): Array<{ day: string; total: number; topUser: string | null }>;
	/** Ready-to-send daily digest with 🥇🥈🥉. */
	renderDigest(chat: string, options?: { title?: string; limit?: number }): string;
	resetChat(chat: string): boolean;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createMessageCounter: (options?: { historyDays?: number; now?: () => number }) => MessageCounter;
