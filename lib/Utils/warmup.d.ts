/** Account warmup — ramp daily send volume on fresh numbers. */

export declare const DEFAULT_WARMUP_RAMP: number[];

export interface WarmupStatus {
	day: number;
	cap: number;
	sentToday: number;
	remaining: number;
	/** Past the ramp — no more caps. */
	graduated: boolean;
}

export interface AccountWarmup {
	canSend(): boolean;
	/** Count sent messages. Returns today's remaining allowance. */
	recordSend(count?: number): number;
	/** check + record in one call. */
	trySend(): { allowed: boolean; remaining: number; cap: number; day: number };
	getStatus(): WarmupStatus;
	/** Next local midnight (counter reset). */
	nextResetAt(): number;
	/** Fires once per day when the cap is reached. */
	onLimit(cb: (info: { day: number; cap: number; sentToday: number }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createAccountWarmup: (options?: {
	/** When the account first logged in. Default: now. */
	startedAt?: number;
	/** Daily caps, day 1 first. Default [20, 50, 100, 200, 400, 800]. */
	ramp?: number[];
	now?: () => number;
}) => AccountWarmup;
