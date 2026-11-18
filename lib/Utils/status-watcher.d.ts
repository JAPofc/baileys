/** Status watcher — receive-side stories with a download hook. */

export interface StatusEvent {
	sender: string;
	/** 'image' | 'video' | 'audio' | … | 'text' */
	mediaType: string;
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	/** Download the status media as a Buffer/stream. */
	download(type?: 'buffer' | 'stream', options?: Record<string, unknown>): Promise<unknown>;
}

export interface StatusWatcherOptions {
	/** Only these senders. Omit for everyone. */
	contacts?: string[];
	/** Also report text statuses. Default true. */
	includeText?: boolean;
}

export interface StatusWatcher {
	handler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onStatus(cb: (event: StatusEvent) => void): () => void;
	watch(jid: string): void;
	unwatch(jid: string): boolean;
	getSeen(sender: string): number;
	readonly totalSeen: number;
}

export declare const createStatusWatcher: (options?: StatusWatcherOptions) => StatusWatcher;
