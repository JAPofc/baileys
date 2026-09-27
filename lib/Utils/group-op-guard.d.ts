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
	/** check + record; throws GroupOpLimitError on breach. */
	assert(op: string, count?: number): GroupOpCheck;
	/** Proxy a socket so groupParticipantsUpdate/groupCreate are guarded. */
	wrap<T>(sock: T): T;
	onBlocked(cb: (info: { op: string } & GroupOpCheck) => void): () => void;
	getUsage(): Record<string, { used: number; max: number }>;
	reset(): void;
}

export declare const createGroupOpGuard: (options?: {
	limits?: Record<string, Partial<{ max: number; windowMs: number }>>;
	now?: () => number;
}) => GroupOpGuard;
