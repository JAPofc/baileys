/** Random tools — dice, coins, picks, deterministic rate/match meters. */

export interface DiceRoll {
	rolls: number[];
	modifier: number;
	total: number;
	notation: string;
}

/** Roll dice notation: '2d6+3', 'd20'. Throws on invalid/out-of-range. */
export declare const rollDice: (notation: string, options?: { random?: () => number }) => DiceRoll;
export declare const flipCoin: (options?: { random?: () => number }) => 'heads' | 'tails';
export declare const randomInt: (min: number, max: number, options?: { random?: () => number }) => number;
export declare const randomPick: <T>(items: T[], options?: { random?: () => number }) => T | undefined;
/** Fisher–Yates shuffle (returns a new array). */
export declare const shuffle: <T>(items: T[], options?: { random?: () => number }) => T[];
export declare const weightedPick: <T>(entries: Array<{ value: T; weight: number }>, options?: { random?: () => number }) => T | undefined;
/** Deterministic 0-100 rating — same input, same rating forever. */
export declare const hashRating: (text: string) => number;
/** Deterministic 0-100 match score, order-independent. */
export declare const matchScore: (a: string, b: string) => number;
