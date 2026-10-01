/** Call guard — track incoming calls and optionally auto-reject them. */

export type CallStatus = 'offer' | 'ringing' | 'timeout' | 'reject' | 'accept' | 'terminate' | 'relaylatency';

export interface GuardedCall {
	id: string;
	chatId: string;
	from: string;
	callerPn?: string;
	date: Date;
	offline: boolean;
	status: CallStatus | string;
	isVideo?: boolean;
	isGroup?: boolean;
	groupJid?: string;
	latencyMs?: number;
	/** Whether the guard rejected this call. */
	rejected: boolean;
}

export interface CallGuardOptions {
	/** Reject incoming call offers — boolean or per-call predicate. Default false. */
	autoReject?: boolean | ((call: GuardedCall) => boolean | Promise<boolean>);
	/** Text (or content factory) sent to the caller after rejecting. */
	rejectMessage?: string | ((call: GuardedCall) => unknown);
	/** JIDs whose calls are never auto-rejected. */
	allowlist?: string[];
	/** Always rejected — beats allowlist and schedule. */
	denylist?: string[];
	/** Quiet hours — only auto-reject inside this window (overnight ok). */
	schedule?: { from: string; to: string };
	/** Clock override (testing). */
	now?: () => number;
	/** Max calls kept in the log (LRU). Default 200. */
	maxCalls?: number;
}

export interface CallGuard {
	handler(events: unknown[], sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onCall(cb: (call: GuardedCall) => void): () => void;
	onRejected(cb: (call: GuardedCall) => void): () => void;
	onError(cb: (info: { call: unknown; error: unknown }) => void): () => void;
	getCalls(): GuardedCall[];
	getCall(id: string): GuardedCall | undefined;
	getCallCount(jid: string): number;
	readonly size: number;
	clear(): void;
}

export declare const createCallGuard: (options?: CallGuardOptions) => CallGuard;
