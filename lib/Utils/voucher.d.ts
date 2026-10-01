/** Voucher manager — generate & redeem codes. */

export type RedeemResult =
	| { ok: true; payload: Record<string, unknown>; usesLeft: number; code: string }
	| { ok: false; reason: 'not-found' | 'revoked' | 'expired' | 'exhausted' | 'already-redeemed' };

export interface VoucherManager {
	create(options?: { payload?: Record<string, unknown>; maxUses?: number; expiresInMs?: number; note?: string }): { code: string; expiresAt: number };
	/** Mint N codes with the same payload. */
	createMany(count: number, options?: { payload?: Record<string, unknown>; maxUses?: number; expiresInMs?: number; note?: string }): string[];
	/** Never throws on user input. */
	redeem(user: string, code: string): RedeemResult;
	/** Public info — never exposes the redeemer list. */
	getInfo(code: string): { code: string; usesLeft: number; maxUses: number; expiresAt: number; expired: boolean; revoked: boolean; note?: string } | null;
	revoke(code: string): boolean;
	/** Drop expired/exhausted/revoked codes. */
	prune(): number;
	onRedeem(cb: (info: { user: string; code: string; payload: Record<string, unknown>; usesLeft: number }) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createVoucherManager: (options?: { prefix?: string; oncePerUser?: boolean; random?: () => number; now?: () => number }) => VoucherManager;
