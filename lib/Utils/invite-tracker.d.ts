/** Invite tracker — group-add attribution + top-inviter leaderboards. */

export interface InviteTracker {
	handler(update: unknown): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onInvite(cb: (info: { chat: string; inviter: string; invited: string; at: number }) => void): () => void;
	/** Adds credited to an inviter: { total, active } (leavers decrement active). */
	getCount(chat: string, inviter: string): { total: number; active: number };
	/** Who brought this member in, or null. */
	getInviter(chat: string, member: string): string | null;
	getLeaderboard(chat: string, limit?: number): Array<{ inviter: string; total: number; active: number }>;
	renderLeaderboard(chat: string, options?: { title?: string; limit?: number }): string;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createInviteTracker: (options?: { now?: () => number }) => InviteTracker;
