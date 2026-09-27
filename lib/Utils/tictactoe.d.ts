/** TicTacToe — XO duels with emoji boards. */

export type TTTPlayResult =
	| { status: 'next'; turn: string; board: Array<'x' | 'o' | null> }
	| { status: 'win'; winner: string; loser: string; board?: Array<'x' | 'o' | null>; forfeit?: boolean }
	| { status: 'draw'; x: string; o: string; board: Array<'x' | 'o' | null> }
	| { status: 'invalid'; reason: 'no-game' | 'not-a-player' | 'not-your-turn' | 'bad-square' | 'taken' };

export interface TicTacToe {
	/** Challenger plays ❌; the game starts on accept(). */
	challenge(chat: string, challenger: string, opponent: string): { chat: string; challenger: string; opponent: string };
	accept(chat: string, user: string): boolean;
	cancel(chat: string, reason?: string): boolean;
	/** Give up — the other player wins. */
	forfeit(chat: string, user: string): TTTPlayResult | null;
	/** Play square 1-9. Never throws mid-game. */
	play(chat: string, user: string, square: number): TTTPlayResult;
	/** Emoji board + turn header. */
	render(chat: string): string | null;
	isActive(chat: string): boolean;
	getGame(chat: string): { x: string; o: string; board: Array<'x' | 'o' | null>; turn: 'x' | 'o'; pendingAccept: boolean } | null;
	onEnd(cb: (result: Record<string, unknown>) => void): () => void;
	readonly size: number;
}

export declare const createTicTacToe: (options?: { now?: () => number }) => TicTacToe;
