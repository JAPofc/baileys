/** Economy system — balances, transfers, daily rewards with streaks. */

export interface EconomyOptions {
	startingBalance?: number;
	/** Daily reward: fixed or [min, max] random range. Default [100, 200]. */
	dailyAmount?: number | [number, number];
	/** Default 24h. */
	dailyCooldownMs?: number;
	/** Extra per consecutive day (streak - 1) * bonus. Default 0. */
	streakBonus?: number;
	maxStreakBonus?: number;
	/** How long after cooldown the streak survives. Default 24h. */
	streakGraceMs?: number;
	/** Transfer fee fraction (0.05 = 5%), charged to the sender. Default 0. */
	transferFee?: number;
	allowNegative?: boolean;
	/** Clock override (testing). */
	now?: () => number;
	/** RNG override (testing / provably-fair bots). */
	random?: () => number;
}

export interface EconomyTransaction {
	type: 'add' | 'deduct' | 'transfer' | 'daily' | 'bet-win' | 'bet-loss';
	user: string;
	to?: string;
	amount: number;
	fee?: number;
	streak?: number;
	balance: number;
	reason?: string;
	at: number;
}

export type DailyClaim =
	| { claimed: true; amount: number; streak: number; balance: number; nextClaimAt: number }
	| { claimed: false; remainingMs: number };

export interface Economy {
	getBalance(user: string): number;
	has(user: string, amount: number): boolean;
	add(user: string, amount: number, reason?: string): number;
	deduct(user: string, amount: number, reason?: string): number;
	transfer(from: string, to: string, amount: number, reason?: string): { sent: number; fee: number };
	claimDaily(user: string): DailyClaim;
	bet(user: string, amount: number, options?: { winChance?: number; multiplier?: number }): { won: boolean; payout: number; balance: number };
	getStreak(user: string): number;
	getLeaderboard(limit?: number): Array<{ rank: number; user: string; balance: number }>;
	onTransaction(cb: (tx: EconomyTransaction) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	readonly size: number;
	clear(): void;
}

export declare const createEconomy: (options?: EconomyOptions) => Economy;
