/** Word games — scrambles, math problems, word chains. */

/** Shuffle a word's letters — never returns the original (when possible). */
export declare const scrambleWord: (word: string, options?: { random?: () => number }) => string;

/** Random arithmetic problem, answer as a string (feeds createGuessGame). */
export declare const generateMathProblem: (
	difficulty?: 'easy' | 'medium' | 'hard',
	options?: { random?: () => number }
) => { question: string; answer: string };

/** Reveal the first n letters: hintFor('bandung', 3) → 'ban____'. */
export declare const hintFor: (word: string, n?: number, options?: { maskChar?: string }) => string;

export type WordChainPlay =
	| { ok: true; nextLetter: string; score: number }
	| { ok: false; reason: 'no-game' | 'not-your-turn' | 'too-short' | 'wrong-letter' | 'already-used' | 'not-a-word'; expected?: string };

export interface WordChain {
	start(chat: string, options?: { firstWord?: string }): { chat: string; firstWord: string; nextLetter: string | null };
	play(chat: string, user: string, word: string): Promise<WordChainPlay>;
	/** End the round: scores best-first, longest word, turn count. */
	end(chat: string): { chat: string; scores: Array<{ user: string; score: number }>; turns: number; longestWord: string | null; words: number } | null;
	isActive(chat: string): boolean;
	getState(chat: string): { lastWord: string; nextLetter: string | null; lastPlayer: string | null; turns: number; words: number } | null;
	onWord(cb: (info: { chat: string; user: string; word: string; nextLetter: string; score: number }) => void): () => void;
	onEnd(cb: (result: Record<string, unknown>) => void): () => void;
	readonly size: number;
}

export declare const createWordChain: (options?: {
	/** Minimum word length. Default 3. */
	minLength?: number;
	/** Optional dictionary check. */
	validateWord?: (word: string) => boolean | Promise<boolean>;
	now?: () => number;
}) => WordChain;
