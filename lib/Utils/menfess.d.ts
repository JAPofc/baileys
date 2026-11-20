/** Menfess relay — anonymous two-way DM sessions through the bot. */

export interface MenfessSession {
	id: number;
	/** Initiator jid. */
	a: string;
	/** Target jid. */
	b: string;
	aliasA: string;
	aliasB: string;
	startedAt: number;
	lastActiveAt: number;
}

export interface MenfessOptions {
	/** Alias prefix, default 'Anon' (→ Anon-1, Anon-2). */
	aliasPrefix?: string;
	/** Inactivity TTL. Default 30 min. 0 disables. */
	sessionTtlMs?: number;
	/** Messages that end the session. Default ['stop', 'udahan']. */
	stopWords?: string[];
	/** Message prefix emoji/text. Default '💌'. */
	header?: string;
	/** Clock override (testing). */
	now?: () => number;
}

export interface MenfessRelayEvent {
	session: MenfessSession;
	direction: 'a->b' | 'b->a';
	from: string;
	to: string;
	text: string;
}

export interface MenfessRelay {
	/** Start a session and deliver the first message anonymously. */
	start(sock: unknown, fromJid: string, toJid: string, firstText?: string): Promise<MenfessSession>;
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onRelayed(cb: (event: MenfessRelayEvent) => void): () => void;
	onEnded(cb: (info: { session: MenfessSession; reason: string; error?: unknown }) => void): () => void;
	getSession(userJid: string): MenfessSession | null;
	/** Owner overview of live sessions (jids included). */
	listActiveSessions(): Array<{ id: number; a: string; b: string; aliasA: string; aliasB: string; ageMs: number; idleMs: number }>;
	isInSession(userJid: string): boolean;
	end(sessionId: number, reason?: string): boolean;
	readonly size: number;
	/** Lifetime counters. */
	readonly stats: { totalStarted: number; totalRelayed: number; active: number };
	clear(): void;
}

export declare const createMenfessRelay: (options?: MenfessOptions) => MenfessRelay;
