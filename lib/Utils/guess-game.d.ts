/** Guess game engine — one round per chat, first correct answer wins. */

export interface GuessGameOptions {
	/** Round duration. Default 60000. 0 disables the timer. */
	timeoutMs?: number;
	/** Default false (case-insensitive matching). */
	caseSensitive?: boolean;
	/** Trim guesses before matching. Default true. */
	trim?: boolean;
	/** Clock override (testing). */
	now?: () => number;
}

export interface GuessRoundInfo {
	hint: string;
	reward: number;
	attempts: number;
	startedAt: number;
	deadline: number;
	startedBy?: string;
}

export interface GuessCorrectEvent {
	chat: string;
	user: string;
	answer: string;
	reward: number;
	attempts: number;
	elapsedMs: number;
	msg?: unknown;
}

export interface GuessGame {
	start(chat: string, round: { answer: string | number; hint?: string; reward?: number; timeoutMs?: number; startedBy?: string }): { chat: string; hint: string; reward: number; deadline: number };
	guess(chat: string, user: string, text: string, msg?: unknown): 'correct' | 'wrong' | null;
	handler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onCorrect(cb: (event: GuessCorrectEvent) => void): () => void;
	onWrong(cb: (event: { chat: string; user: string; text: string; attempts: number; msg?: unknown }) => void): () => void;
	onTimeout(cb: (event: { chat: string; answer: string; hint: string; attempts: number }) => void): () => void;
	isActive(chat: string): boolean;
	/** Round info WITHOUT the answer. */
	getRound(chat: string): GuessRoundInfo | null;
	/** End a round without a winner; returns the answer. */
	end(chat: string): string | null;
	readonly size: number;
	clear(): void;
}

export declare const createGuessGame: (options?: GuessGameOptions) => GuessGame;
