/** Group operation guard — stay under WhatsApp's group-action ceilings. */

export declare class GroupOpLimitError extends Error {
	op: string;
	retryInMs: number;
}

export declare const DEFAULT_GROUP_OP_LIMITS: Record<string, { max: number; windowMs: number }>;

export interface GroupOpCheck {
	allowed: boolean;
	used: number;
	max: number;
	retryInMs: number;
}

export interface GroupOpGuard {
	check(op: string, count?: number): GroupOpCheck;
	record(op: string, count?: number): void;
	/** Change an operation's limit at runtime. */
	configure(op: string, limit: Partial<{ max: number; windowMs: number }>): void;
	/** Wait until allowed, then record (throws past maxWaitMs). */
	waitAndAssert(op: string, count?: number, options?: { maxWaitMs?: number }): Promise<GroupOpCheck>;
	/** check + record; throws GroupOpLimitError on breach. */
	assert(op: string, count?: number): GroupOpCheck;
	/** Proxy a socket so groupParticipantsUpdate/groupCreate are guarded. */
	wrap<T>(sock: T): T;
	onBlocked(cb: (info: { op: string } & GroupOpCheck) => void): () => void;
	getUsage(): Record<string, { used: number; max: number }>;
	/** Serialize the rate-limit history so it survives a restart. */
	toJSON(): { history: Array<[string, number[]]> };
	/** Restore a toJSON() snapshot of the rate-limit history. */
	load(snapshot: { history?: Array<[string, number[]]> }): void;
	reset(): void;
}

export declare const createGroupOpGuard: (options?: {
	limits?: Record<string, Partial<{ max: number; windowMs: number }>>;
	now?: () => number;
}) => GroupOpGuard;
