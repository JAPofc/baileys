/** Join-request manager — auto approve/reject group membership requests. */

export interface JoinRequestManagerOptions {
	/** 'manual' (default): undecided requests go to onRequest. */
	mode?: 'manual' | 'approve-all' | 'reject-all';
	/** Always approved (beats mode). */
	allowlist?: string[];
	/** Always rejected (beats allowlist and mode). */
	denylist?: string[];
	/** Only watch these group jids. Omit for all groups. */
	groups?: string[];
}

export interface JoinRequest {
	chat: string;
	user: string;
	method?: string;
	author?: string;
	approve(): Promise<boolean>;
	reject(): Promise<boolean>;
}

export interface JoinRequestManager {
	/** Handler for the 'group.join-request' event. */
	handler(update: unknown, sock?: unknown): Promise<void>;
	/** Rule verdict for a jid: 'approve' | 'reject' | null (manual). */
	decide(user: string): 'approve' | 'reject' | null;
	bind(sock: unknown): () => void;
	unbind(): void;
	/** Process the pending list of a group with the same rules. */
	sweep(sock: unknown, groupJid: string): Promise<{ approved: string[]; rejected: string[]; pending: string[] }>;
	allow(jid: string): void;
	deny(jid: string): void;
	onRequest(cb: (request: JoinRequest) => void): () => void;
	onProcessed(cb: (info: { chat: string; user: string; action: 'approve' | 'reject' }) => void): () => void;
	onError(cb: (info: { chat: string; user: string; action: string; error: unknown }) => void): () => void;
	readonly processedCount: number;
}

export declare const createJoinRequestManager: (options?: JoinRequestManagerOptions) => JoinRequestManager;
