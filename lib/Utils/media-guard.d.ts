/** Media guard — moderate media types per chat. */

export type GuardedMediaType =
	| 'image' | 'video' | 'audio' | 'sticker' | 'document'
	| 'contact' | 'location' | 'poll';

/** Detect the media type of a message content (wrappers unwrapped), or null. */
export declare const detectMediaType: (message: Record<string, unknown>) => GuardedMediaType | null;

export interface MediaGuardOptions {
	/** Types blocked in every watched chat. */
	blocked?: GuardedMediaType[];
	/** Per-chat overrides: chat jid → blocked types (replaces the global list). */
	rules?: Record<string, GuardedMediaType[]>;
	/** Only watch groups. Default true. */
	groupsOnly?: boolean;
	exemptUsers?: string[];
	/** Delete violations for everyone (bot must be admin). Default false. */
	autoDelete?: boolean;
	includeFromMe?: boolean;
}

export interface MediaGuardDetection {
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	chat: string;
	sender: string;
	mediaType: GuardedMediaType;
	deleted: boolean;
}

export interface MediaGuard {
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	detectMediaType: typeof detectMediaType;
	bind(sock: unknown): () => void;
	unbind(): void;
	onDetected(cb: (detection: MediaGuardDetection) => void): () => void;
	onError(cb: (info: { msg: unknown; error: unknown }) => void): () => void;
	setRule(chat: string, types: GuardedMediaType[] | null): boolean;
	getRule(chat: string): GuardedMediaType[] | null;
	block(type: GuardedMediaType): void;
	unblock(type: GuardedMediaType): boolean;
	addExempt(jid: string): void;
	removeExempt(jid: string): boolean;
}

export declare const createMediaGuard: (options?: MediaGuardOptions) => MediaGuard;
