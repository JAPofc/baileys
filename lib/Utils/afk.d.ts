/** AFK manager — mark users away, catch pings, welcome them back. */

export interface AfkPing {
	chat: string;
	from: string;
	at: number;
	keyId?: string;
}

export interface AfkEntry {
	user: string;
	reason: string;
	since: number;
	missed: AfkPing[];
}

export interface AfkReturnSummary extends AfkEntry {
	awayMs: number;
}

export interface AfkMentionEvent {
	chat: string;
	from: string;
	afkUser: string;
	reason: string;
	since: number;
	/** The raw WAMessage that pinged the AFK user (usable as `quoted`). */
	msg: Record<string, unknown>;
}

export interface AfkManagerOptions {
	/** Max pings remembered per AFK user. Default 100. */
	maxMissedPerUser?: number;
	/** Automatically mark users back when they send a message. Default true. */
	autoReturn?: boolean;
}

export interface AfkManager {
	handler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	setAfk(jid: string, reason?: string): AfkEntry;
	setBack(jid: string): AfkReturnSummary | null;
	isAfk(jid: string): boolean;
	getAfk(jid: string): AfkEntry | null;
	getAfkUsers(): string[];
	/** Ready-to-send list of who's AFK and for how long. */
	/** Cumulative AFK time (ms) across completed sessions. */
	getTotalAfkMs(jid: string): number;
	renderAfkList(options?: { title?: string }): string;
	onAfkMention(cb: (event: AfkMentionEvent) => void): () => void;
	onReturn(cb: (summary: AfkReturnSummary) => void): () => void;
	readonly size: number;
	clear(): void;
}

export declare const createAfkManager: (options?: AfkManagerOptions) => AfkManager;
