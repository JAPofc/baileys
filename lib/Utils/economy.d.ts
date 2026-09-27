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
	/** Currency symbol for format(). Default 💰. */
	currency?: string;
	/** Max money the bank can hold per user. Default Infinity. */
	bankCapacity?: number;
	allowNegative?: boolean;
	/** Clock override (testing). */
	now?: () => number;
	/** RNG override (testing / provably-fair bots). */
	random?: () => number;
}

export interface EconomyTransaction {
	type: 'add' | 'deduct' | 'transfer' | 'daily' | 'bet-win' | 'bet-loss' | 'deposit' | 'withdraw' | 'interest' | 'rob-success' | 'rob-fail' | 'work';
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
	getBankBalance(user: string): number;
	/** '1.234.567 💰' locale formatting. */
	format(amount: number): string;
	deposit(user: string, amount: number): { balance: number; bank: number };
	withdraw(user: string, amount: number): { balance: number; bank: number };
	/** Whole-economy overview for dashboards. */
	getEconomyStats(): { users: number; totalWallet: number; totalBank: number; totalMoney: number; richest: string | null; average: number };
	/** Earn with a built-in per-user cooldown. */
	work(user: string, options?: { jobs?: string[]; pay?: number | [number, number]; cooldownMs?: number }): { worked: true; job: string; earned: number; balance: number } | { worked: false; remainingMs: number };
	/** Rob a wallet (bank money is safe). Failure fines the robber. */
	rob(robber: string, target: string, options?: { successChance?: number; maxStealFraction?: number; finePercent?: number }): { success: boolean; amount: number; robberBalance: number; targetBalance: number };
	/** Pay interest on all bank balances (0.01 = 1%). */
	applyInterest(rate: number): { users: number; totalAdded: number };
	/** Leaderboard position by wallet + bank, or null. */
	getRank(user: string): number | null;
	/** Ready-to-send balance card. */
	getBalanceCard(user: string): string;
	getLeaderboard(limit?: number): Array<{ rank: number; user: string; balance: number; bank: number; total: number }>;
	onTransaction(cb: (tx: EconomyTransaction) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	readonly size: number;
	clear(): void;
}

export declare const createEconomy: (options?: EconomyOptions) => Economy;
