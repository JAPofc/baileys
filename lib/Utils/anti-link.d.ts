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
}

export declare const createAntiLinkGuard: (options?: AntiLinkGuardOptions) => AntiLinkGuard;
