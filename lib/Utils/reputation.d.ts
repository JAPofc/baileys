/** Reputation — +rep/-rep with per-giver cooldowns. */

export type GiveRepResult =
	| { ok: true; total: number }
	| { ok: false; reason: 'self' | 'bad-amount' | 'cooldown'; remainingMs?: number };

export interface Reputation {
	/** amount must be +1 or -1. Never throws on user input. */
	give(from: string, to: string, amount: number, reason?: string): GiveRepResult;
	getRep(user: string): { total: number; up: number; down: number; given: number; history: Array<{ from: string; amount: number; reason: string; at: number }> };
	getLeaderboard(limit?: number): Array<{ user: string; total: number; up: number; down: number }>;
	renderCard(user: string): string;
	onGive(cb: (info: { from: string; to: string; amount: number; reason: string; total: number }) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createReputation: (options?: { cooldownMs?: number; maxHistory?: number; now?: () => number }) => Reputation;
