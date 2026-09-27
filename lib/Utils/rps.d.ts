/** RPS ("suit") — rock-paper-scissors duels with hidden picks. */

export type RpsChoice = 'rock' | 'paper' | 'scissors';

/** Normalize aliases/emoji (batu/gunting/kertas, ✊✋✌️) or null. */
export declare const normalizeRpsChoice: (input: string) => RpsChoice | null;

export interface RpsResult {
	chat: string;
	draw: boolean;
	winner: string | null;
	loser: string | null;
	picks: Record<string, { choice: RpsChoice; emoji: string }>;
	bet: number;
}

export interface RPS {
	normalizeChoice: typeof normalizeRpsChoice;
	challenge(chat: string, challenger: string, opponent: string, options?: { bet?: number }): { chat: string; challenger: string; opponent: string; bet: number };
	accept(chat: string, user: string): boolean;
	cancel(chat: string): boolean;
	/** 'waiting' | RpsResult | 'no-duel' | 'not-accepted' | 'not-a-player' | 'bad-choice' | 'already-picked' */
	pick(chat: string, user: string, choice: string): 'waiting' | RpsResult | string;
	isActive(chat: string): boolean;
	/** Reveals WHO picked, never WHAT. */
	getDuel(chat: string): { a: string; b: string; bet: number; pendingAccept: boolean; picked: string[] } | null;
	onResult(cb: (result: RpsResult) => void): () => void;
	readonly size: number;
}

export declare const createRPS: (options?: { now?: () => number }) => RPS;
