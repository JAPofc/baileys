/** View-once toolkit — detect, unwrap and capture view-once messages. */

export interface UnwrappedViewOnce {
	/** Inner message content (the wrapped message). */
	message: Record<string, unknown>;
	/** Inner field name, e.g. 'imageMessage'. */
	type: string;
	/** 'image' | 'video' | 'audio' when recognized. */
	mediaType?: string;
	/** The inner media object itself. */
	media: Record<string, unknown>;
}

export declare const isViewOnceMessage: (msg: unknown) => boolean;
export declare const unwrapViewOnce: (msg: unknown) => UnwrappedViewOnce | null;

export interface ViewOnceCaptureOptions {
	/** Max captured messages kept (LRU). Default 200. */
	maxMessages?: number;
}

export interface ViewOnceCaptureEntry {
	msg: Record<string, unknown>;
	unwrapped: UnwrappedViewOnce | null;
	at: number;
}

export interface ViewOnceCapture {
	handler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onViewOnce(cb: (entry: { msg: Record<string, unknown>; unwrapped: UnwrappedViewOnce | null }) => void): () => void;
	get(key: { remoteJid?: string | null; id?: string | null }): ViewOnceCaptureEntry | undefined;
	getAll(): ViewOnceCaptureEntry[];
	readonly size: number;
	clear(): void;
}

export declare const createViewOnceCapture: (options?: ViewOnceCaptureOptions) => ViewOnceCapture;
