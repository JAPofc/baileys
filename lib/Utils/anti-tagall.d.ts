/** Anti-tagall guard — catch mass mentions and hidetag spam in groups. */

export interface AntiTagAllOptions {
	/** Mentions needed to trigger. Default 5. */
	threshold?: number;
	/** Jids never flagged (admins, your own bots). */
	exemptUsers?: string[];
	/** Dynamic exemption check (e.g. live group-admin lookup). */
	isExempt?: (info: { chat: string; sender: string; msg: unknown }) => boolean | Promise<boolean>;
	/** Delete the offending message for everyone. Default false. */
	autoDelete?: boolean;
	/** Also inspect the bot's own messages. Default false. */
	includeFromMe?: boolean;
}

export interface TagAllDetection {
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	chat: string;
	sender: string;
	mentionCount: number;
	mentions: string[];
	/** True when the mentions were invisible (hidetag-style). */
	hidden: boolean;
	deleted: boolean;
}

export interface AntiTagAllGuard {
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onDetected(cb: (detection: TagAllDetection) => void): () => void;
	onError(cb: (info: { msg: unknown; error: unknown }) => void): () => void;
	addExempt(jid: string): void;
	removeExempt(jid: string): boolean;
}

export declare const createAntiTagAllGuard: (options?: AntiTagAllOptions) => AntiTagAllGuard;
