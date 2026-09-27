/** Message serializer — flat, bot-friendly view of a WAMessage. */

export interface SerializedQuoted {
	key: Record<string, unknown>;
	sender?: string;
	type?: string;
	message?: Record<string, unknown>;
	body: string;
	isMedia: boolean;
	download(downloadType?: 'buffer' | 'stream', options?: Record<string, unknown>): Promise<unknown>;
}

export interface SerializedMessage {
	/** The original WAMessage. */
	raw: Record<string, unknown>;
	key: Record<string, unknown>;
	id?: string;
	chat?: string;
	sender?: string;
	fromMe: boolean;
	isGroup: boolean;
	pushName?: string;
	timestamp?: number;
	/** Inner content type, e.g. 'conversation' or 'imageMessage'. */
	type?: string;
	/** Best-effort text: body, caption, poll name, ... */
	body: string;
	/** Normalized (unwrapped) message content. */
	message?: Record<string, unknown>;
	mentions: string[];
	isMedia: boolean;
	/** Epoch-ms timestamp (Long + second units handled), or null. */
	timestampMs: number | null;
	isViewOnce: boolean;
	/** Unwrapped view-once info or null. */
	viewOnce: { message: Record<string, unknown>; type: string; mediaType?: string; media: Record<string, unknown> } | null;
	/** Disappearing-message timer (seconds), if any. */
	expiration?: number;
	quoted: SerializedQuoted | null;
	reply(content: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
	send(content: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
	react(emoji: string): Promise<unknown>;
	download(downloadType?: 'buffer' | 'stream', options?: Record<string, unknown>): Promise<unknown>;
	forward(jid: string, options?: Record<string, unknown>): Promise<unknown>;
	delete(): Promise<unknown>;
}

/**
 * Serialize a WAMessage. Returns null for messages without a key.
 * `sock` may be null — data fields still work, socket helpers throw.
 */
export declare const serializeMessage: (sock: unknown, msg: unknown) => SerializedMessage | null;
