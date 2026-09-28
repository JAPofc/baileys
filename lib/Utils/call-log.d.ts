/** Call log — history + per-caller stats from the `call` event. */

export interface CallLogEntry {
	id: string;
	from: string;
	chatId?: string;
	isVideo: boolean;
	isGroup: boolean;
	offerAt: number | null;
	endedAt: number | null;
	outcome: 'ongoing' | 'accepted' | 'rejected' | 'missed' | 'ended';
	statuses: string[];
}

export interface CallLogOptions {
	/** Max entries kept (LRU). Default 500. */
	maxEntries?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface CallLog {
	handler(events: unknown[]): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	/** Fires on terminate with `durationMs`. */
	onEnded(cb: (entry: CallLogEntry & { durationMs: number }) => void): () => void;
	getHistory(filter?: { from?: string; limit?: number }): CallLogEntry[];
	getCallerStats(from: string): { from: string; calls: number; video: number; outcomes: Record<string, number>; totalDurationMs: number } | null;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createCallLog: (options?: CallLogOptions) => CallLog;
