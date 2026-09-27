/** Tier manager — premium/VIP memberships with expiry. */

export interface TierDuration {
	days?: number;
	hours?: number;
	ms?: number;
}

export interface TierInfo {
	name: string;
	since: number;
	/** 0 = lifetime. */
	expiresAt: number;
	lifetime: boolean;
	remainingMs: number;
}

export interface TierManagerOptions {
	/** Sweeper interval. Default 60000. */
	sweepIntervalMs?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface TierExpireEvent {
	user: string;
	name: string;
	since: number;
	expiredAt: number;
}

export interface TierManager {
	/** Grant a tier; omit duration for lifetime. Regrant resets the clock. */
	setTier(user: string, name: string, duration?: TierDuration): { user: string; name: string; since: number; expiresAt: number };
	/** Stack time onto an existing membership. */
	extend(user: string, duration: TierDuration): { user: string; name: string; expiresAt: number };
	revoke(user: string): boolean;
	isActive(user: string, name?: string): boolean;
	getTier(user: string): TierInfo | null;
	list(name?: string): Array<{ user: string; name: string; expiresAt: number }>;
	/** Fire expiries now. Returns the expired entries. */
	sweep(): TierExpireEvent[];
	startSweeper(): () => void;
	stopSweeper(): void;
	onExpire(cb: (event: TierExpireEvent) => void): () => void;
	onGrant(cb: (info: { user: string; name: string; expiresAt: number }) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createTierManager: (options?: TierManagerOptions) => TierManager;
