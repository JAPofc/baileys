/** Text poll — vote-by-number polls that work in every client. */

export interface TextPollResult {
	index: number;
	option: string;
	votes: number;
	percent: number;
}

export interface TextPollEnd {
	chat: string;
	question: string;
	results: TextPollResult[];
	/** null on ties or zero votes. */
	winner: TextPollResult | null;
	totalVotes: number;
	reason: string;
}

export interface TextPoll {
	handler(upsert: { messages: unknown[] }): void;
	/** Record a vote by 1-based option number. */
	vote(chat: string, user: string, optionNumber: number): 'ok' | 'invalid' | 'already-voted' | 'unchanged' | null;
	start(chat: string, options: { question: string; options: string[]; durationMs?: number; startedBy?: string }): { chat: string; question: string; options: string[]; endsAt: number };
	end(chat: string): TextPollEnd | null;
	isActive(chat: string): boolean;
	getResults(chat: string): { question: string; results: TextPollResult[]; totalVotes: number } | null;
	/** Live results card with bars while voting is open. */
	renderLive(chat: string): string | null;
	/** Ready-to-send ballot card. */
	render(chat: string): string | null;
	/** Results with text bar charts. */
	formatResults(results: TextPollResult[] | { results: TextPollResult[] }): string;
	bind(sock: unknown): () => void;
	unbind(): void;
	onVote(cb: (info: { chat: string; user: string; option: string; index: number; changed: boolean }) => void): () => void;
	onEnd(cb: (result: TextPollEnd) => void): () => void;
	readonly size: number;
}

export declare const createTextPoll: (options?: { now?: () => number; allowRevote?: boolean }) => TextPoll;
