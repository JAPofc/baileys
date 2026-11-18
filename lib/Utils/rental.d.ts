/** Rental manager ("sewa bot") — per-chat subscriptions with expiry. */

export interface RentalInfo {
	chat: string;
	since: number;
	/** 0 = lifetime. */
	expiresAt: number;
	lifetime: boolean;
	trial: boolean;
	remainingMs: number;
}

export interface RentalManager {
	/** Grant/replace a rental; { lifetime: true } for forever. */
	add(chat: string, options?: { days?: number; hours?: number; ms?: number; by?: string; lifetime?: boolean }): { chat: string; expiresAt: number };
	/** Stack time (adds a rental when none exists). A paid top-up: clears the
	 * trial flag and, if `by` is given, records the payer. */
	extend(chat: string, duration: { days?: number; hours?: number; ms?: number; by?: string }): { chat: string; expiresAt: number };
	/** One free trial per chat, ever. Returns false when already used. */
	startTrial(chat: string, options?: { days?: number }): { chat: string; expiresAt: number } | false;
	revoke(chat: string): boolean;
	isActive(chat: string): boolean;
	getRental(chat: string): RentalInfo | null;
	/** Wrap a messages.upsert handler — unrented groups are dropped. */
	filter<T extends (upsert: { messages: unknown[] }, ...rest: unknown[]) => unknown>(handler: T): T;
	/** '✅ Aktif — 12d 4h tersisa' style status line. */
	renderStatus(chat: string): string;
	getExpiring(withinMs: number): Array<{ chat: string; expiresAt: number; remainingMs: number }>;
	list(): Array<{ chat: string; expiresAt: number; trial: boolean }>;
	/** Owner overview of every active rental. */
	renderList(options?: { title?: string }): string;
	/** Owner dashboard counts across all rentals. `paid` is non-trial (incl. lifetime). */
	stats(): { active: number; trial: number; paid: number; lifetime: number; expiringSoon: number; trialsEverUsed: number };
	/** Migrate a rental to a new chat jid (e.g. a re-created group). Carries the
	 * "trial burned" marker across. Returns false if there is nothing to move or
	 * the destination already has a rental (unless `overwrite: true`). */
	transfer(fromChat: string, toChat: string, options?: { overwrite?: boolean }): { from: string; to: string; expiresAt: number } | false;
	/** Fire expiries + renewal warnings now. Returns expired chats. */
	sweep(): string[];
	startSweeper(): () => void;
	stopSweeper(): void;
	onExpire(cb: (info: { chat: string; since: number; trial: boolean; expiredAt: number }) => void): () => void;
	/** Fires once per rental as it crosses the expiring threshold. */
	onExpiring(cb: (info: { chat: string; remainingMs: number; expiresAt: number }) => void): () => void;
	onGrant(cb: (info: { chat: string; expiresAt: number; by?: string; trial: boolean }) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createRentalManager: (options?: {
	sweepIntervalMs?: number;
	/** onExpiring threshold. Default 24h. */
	expiringThresholdMs?: number;
	/** DMs pass filter() by default. */
	allowDms?: boolean;
	now?: () => number;
}) => RentalManager;
