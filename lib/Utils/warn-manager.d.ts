/** Warn manager — strike-based moderation with thresholds. */

export interface WarnRecord {
	reason: string;
	by?: string;
	chat?: string;
	at: number;
}

export interface WarnResult {
	user: string;
	chat?: string;
	count: number;
	threshold: number;
	reachedThreshold: boolean;
	warn: WarnRecord;
}

export interface WarnManagerOptions {
	/** Warns needed to trigger onThreshold. Default 3. */
	threshold?: number;
	/** Track warns per (user, chat) instead of globally per user. Default true. */
	perChat?: boolean;
	/** Max tracked entries (LRU). Default 5000. */
	maxUsers?: number;
}

export interface WarnManager {
	warn(user: string, info?: { chat?: string; reason?: string; by?: string }): WarnResult;
	pardon(user: string, chat?: string, amount?: number): number;
	reset(user: string, chat?: string): void;
	/** Expire warns older than olderThanMs everywhere. Returns removed count. */
	decay(olderThanMs: number): number;
	getCount(user: string, chat?: string): number;
	getWarns(user: string, chat?: string): WarnRecord[];
	list(chat?: string): Array<{ user: string; chat?: string; count: number }>;
	onWarn(cb: (result: WarnResult) => void): () => void;
	onThreshold(cb: (result: WarnResult & { warns: WarnRecord[] }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	readonly size: number;
	clear(): void;
}

export declare const createWarnManager: (options?: WarnManagerOptions) => WarnManager;
