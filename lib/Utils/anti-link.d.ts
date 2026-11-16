/** Anti-link guard — detect and optionally auto-delete link messages. */

export declare const extractLinks: (text: string) => string[];
export declare const containsGroupInvite: (text: string) => boolean;

export interface AntiLinkGuardOptions {
	/** Only watch group chats. Default true. */
	groupsOnly?: boolean;
	/** Only trigger on chat.whatsapp.com invite links. Default true. */
	inviteLinksOnly?: boolean;
	/** Chat JIDs where links are allowed. */
	allowlist?: string[];
	/** Domains that never trigger (only used when inviteLinksOnly is false). */
	allowedDomains?: string[];
	/** Delete the offending message for everyone (bot must be group admin). Default false. */
	autoDelete?: boolean;
	/** Also inspect the bot's own messages. Default false. */
	includeFromMe?: boolean;
}

export interface AntiLinkDetection {
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	chat: string;
	sender?: string;
	text: string;
	links: string[];
	inviteCode: string | null;
	deleted: boolean;
}

export interface AntiLinkGuard {
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onDetected(cb: (detection: AntiLinkDetection) => void): () => void;
	onError(cb: (info: { msg: unknown; error: unknown }) => void): () => void;
	/** Add exempt chat jid(s) to the allowlist at runtime. Returns the new allowlist size. */
	allow(...chats: Array<string | string[]>): number;
	/** Remove chat jid(s) from the allowlist at runtime. Returns the new allowlist size. */
	unallow(...chats: Array<string | string[]>): number;
	/** Is this chat currently exempt? */
	isAllowed(chat: string): boolean;
	/** Current allowlist (exempt chat jids). */
	getAllowlist(): string[];
	/** Add allowed link domain(s) at runtime (non-invite mode). Returns the new count. */
	allowDomain(...domains: Array<string | string[]>): number;
	/** Remove allowed link domain(s) at runtime. Returns the new count. */
	disallowDomain(...domains: Array<string | string[]>): number;
	/** Current allowed link domains. */
	getAllowedDomains(): string[];
	/** Toggle delete-for-everyone on detections at runtime. Returns the new state. */
	setAutoDelete(on: boolean): boolean;
	/** Whether auto-delete is currently enabled. */
	readonly autoDelete: boolean;
	/** Running counters since creation. */
	readonly stats: { detected: number; deleted: number };
}

export declare const createAntiLinkGuard: (options?: AntiLinkGuardOptions) => AntiLinkGuard;
