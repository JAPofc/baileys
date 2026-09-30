/** Gatekeeper — ban users/chats and filter them out of handlers. */

export interface GatekeeperOptions {
	/** 'denylist' (default): everyone passes except banned. 'allowlist': only allowed pass. */
	mode?: 'denylist' | 'allowlist';
	allowedUsers?: string[];
	allowedChats?: string[];
}

export interface GatekeeperBlockEvent {
	user?: string;
	chat?: string;
	msg: Record<string, unknown>;
}

export interface Gatekeeper {
	allows(msg: unknown): boolean;
	allowsJid(user?: string, chat?: string): boolean;
	/** Wrap a messages.upsert handler — banned messages never reach it. */
	filter<T extends (upsert: { messages: unknown[] }, ...rest: unknown[]) => unknown>(handler: T): T;
	banUser(jid: string, reason?: string, options?: { expiresInMs?: number }): void;
	/** Bulk ban (raid cleanup). Returns how many were newly added. */
	banMany(jids: string[], reason?: string, options?: { expiresInMs?: number }): number;
	unbanUser(jid: string): boolean;
	banChat(jid: string, reason?: string, options?: { expiresInMs?: number }): void;
	unbanChat(jid: string): boolean;
	allowUser(jid: string): void;
	allowChat(jid: string): void;
	disallowUser(jid: string): boolean;
	disallowChat(jid: string): boolean;
	isBannedUser(jid: string): boolean;
	isBannedChat(jid: string): boolean;
	getBanInfo(jid: string): { reason: string; at: number; expiresAt?: number } | null;
	/** Detailed ban list with reasons and remaining time. */
	listBans(): Array<{ jid: string; type: 'user' | 'chat'; reason: string; at: number; expiresAt: number | null; remainingMs: number | null }>;
	getBannedUsers(): string[];
	getBannedChats(): string[];
	onBlocked(cb: (event: GatekeeperBlockEvent) => void): () => void;
	readonly blockedCount: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	/** Amnesty — lift every user ban. Returns how many. */
	unbanAll(): number;
	clear(): void;
}

export declare const createGatekeeper: (options?: GatekeeperOptions) => Gatekeeper;
