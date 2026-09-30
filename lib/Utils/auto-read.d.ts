/** Auto-read — automatically mark incoming messages as read, with filters. */

export interface AutoReadOptions {
	/** Read group chats. Default true. */
	groups?: boolean;
	/** Read direct chats. Default true. */
	dms?: boolean;
	/** Also view status broadcasts. Default false. */
	statusBroadcast?: boolean;
	/** If set, ONLY these chat jids are read (overrides groups/dms flags). */
	allowlist?: string[];
	/** Chat jids never auto-read. */
	denylist?: string[];
	/** Only read real-time ('notify') upserts, skipping history sync. Default true. */
	notifyOnly?: boolean;
}

export interface AutoRead {
	handler(upsert: { messages: unknown[]; type?: string }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onRead(cb: (keys: Array<Record<string, unknown>>) => void): () => void;
	onError(cb: (info: { keys: unknown[]; error: unknown }) => void): () => void;
	pause(): void;
	resume(): void;
	readonly isPaused: boolean;
	/** Total messages auto-read since creation. */
	readonly count: number;
}

export declare const createAutoRead: (options?: AutoReadOptions) => AutoRead;
