/** Quota manager — daily usage limits per user with tier support. */

export interface QuotaManagerOptions {
	/** Daily allowance without a tier. Default 20. */
	defaultLimit?: number;
	/** Per-tier daily allowances (Infinity allowed). */
	limits?: Record<string, number>;
	/** Clock override (testing). */
	now?: () => number;
}

export interface QuotaCheck {
	allowed: boolean;
	used: number;
	limit: number;
	remaining: number;
	/** Next local midnight (epoch ms). */
	resetAt: number;
}

export interface QuotaManager {
	/** Spend from today's quota. */
	consume(user: string, tier?: string, amount?: number): QuotaCheck;
	/** Peek without spending. */
	remaining(user: string, tier?: string): number;
	getUsed(user: string): number;
	/** Change a tier's daily limit at runtime. */
	setLimit(tier: string, limit: number): void;
	setDefaultLimit(limit: number): void;
	getLimit(tier?: string): number;
	/** Extra allowance for today only (rewards/promos). */
	grantBonus(user: string, amount: number): void;
	/** Reset one user, or everyone when omitted. */
	reset(user?: string): void;
	onExhausted(cb: (info: { user: string; tier?: string; used: number; limit: number; resetAt: number }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createQuotaManager: (options?: QuotaManagerOptions) => QuotaManager;
