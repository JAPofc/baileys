/** Quiz session — multi-question rounds with running scores. */

export interface QuizQuestion {
	question: string;
	answer: string | number;
	points?: number;
}

export interface QuizSession {
	handler(upsert: { messages: unknown[] }): void;
	answer(chat: string, user: string, text: string): 'correct' | 'wrong' | null;
	start(chat: string, questions: QuizQuestion[]): { chat: string; total: number };
	/** Skip the current question (reveals the answer via onTimeout). */
	skip(chat: string): boolean;
	/** End early. Returns the final ranking. */
	end(chat: string): { chat: string; ranking: Array<{ user: string; score: number }>; winner: { user: string; score: number } | null; questionsAsked: number; total: number; reason: string } | null;
	isActive(chat: string): boolean;
	getScores(chat: string): Array<{ user: string; score: number }> | null;
	bind(sock: unknown): () => void;
	unbind(): void;
	onQuestion(cb: (info: { chat: string; index: number; total: number; question: string; points: number; deadline: number }) => void): () => void;
	onCorrect(cb: (info: { chat: string; user: string; points: number; answer: string | number; index: number; scores: Array<{ user: string; score: number }> }) => void): () => void;
	/** Per-question timeouts AND host skips (skipped: true). */
	onTimeout(cb: (info: { chat: string; index: number; question: string; answer: string | number; skipped?: boolean }) => void): () => void;
	onEnd(cb: (result: Record<string, unknown>) => void): () => void;
	readonly size: number;
}

export declare const createQuizSession: (options?: { perQuestionMs?: number; caseSensitive?: boolean; now?: () => number }) => QuizSession;
