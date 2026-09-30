/** Marriage registry — propose/accept/divorce, strictly monogamous. */

export interface MarriageRegistry {
	propose(from: string, to: string): { ok: true; expiresAt: number } | { ok: false; reason: 'self' | 'you-are-married' | 'target-married' | 'already-proposed' };
	/** Accept a proposal FROM `from`. */
	accept(user: string, from: string): { ok: true; marriedAt: number } | { ok: false; reason: 'no-proposal' | 'someone-married-meanwhile' };
	reject(user: string, from: string): boolean;
	divorce(user: string): { ok: true; partner: string; lastedDays: number } | { ok: false; reason: 'not-married' };
	isMarried(user: string): boolean;
	getPartner(user: string): string | null;
	getMarriage(user: string): { partner: string; marriedAt: number; days: number } | null;
	/** Every couple once, longest first. */
	listCouples(): Array<{ a: string; b: string; marriedAt: number; days: number }>;
	renderCouples(options?: { title?: string }): string;
	onMarried(cb: (info: { a: string; b: string; marriedAt: number }) => void): () => void;
	onDivorced(cb: (info: { a: string; b: string; lastedDays: number }) => void): () => void;
	/** Number of couples. */
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createMarriageRegistry: (options?: { proposalTtlMs?: number; now?: () => number }) => MarriageRegistry;
