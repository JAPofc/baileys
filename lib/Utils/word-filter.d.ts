/** Word filter — keyword/regex moderation over extracted message text. */

export interface WordFilterOptions {
	/** Words/phrases matched case-insensitively on word boundaries. */
	words?: string[];
	/** Extra regexes checked as-is. */
	patterns?: RegExp[];
	/** Only watch group chats. Default false. */
	groupsOnly?: boolean;
	/** Chat jids exempt from filtering. */
	allowlist?: string[];
	/** Delete matching messages for everyone (bot must be admin). Default false. */
	autoDelete?: boolean;
	/** Also inspect the bot's own messages. Default false. */
	includeFromMe?: boolean;
}

export interface WordFilterMatch {
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	chat: string;
	sender?: string;
	text: string;
	matched: string;
	deleted: boolean;
}

export interface WordFilter {
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onMatch(cb: (match: WordFilterMatch) => void): () => void;
	onError(cb: (info: { msg: unknown; error: unknown }) => void): () => void;
	/** Check a text directly; returns the matched fragment or null. */
	test(text: string): string | null;
	addWords(...words: Array<string | string[]>): void;
	removeWords(...words: Array<string | string[]>): void;
	addPatterns(...patterns: Array<RegExp | RegExp[]>): void;
	getWords(): string[];
	readonly size: number;
}

export declare const createWordFilter: (options?: WordFilterOptions) => WordFilter;
