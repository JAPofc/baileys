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
/** Normally-distributed random (Box–Muller), optional [min, max] clamp. */
export declare const randomGaussian: (mean?: number, stdDev?: number, options?: { random?: () => number; clamp?: [number, number] }) => number;
/** Gaussian-jittered delay in ms — human-looking pauses. */
export declare const gaussianDelayMs: (meanMs: number, stdMs?: number, options?: { random?: () => number; clamp?: [number, number] }) => number;

/** Deterministic 0-100 rating — same input, same rating forever. */
export declare const hashRating: (text: string) => number;
/** Deterministic 0-100 match score, order-independent. */
export declare const matchScore: (a: string, b: string) => number;
export declare const randomString: (length?: number, alphabet?: string, opts?: { random?: () => number }) => string;
/** Weighted coin: true with probability `p` (default 0.5). */
export declare const randomBool: (p?: number, opts?: { random?: () => number }) => boolean;
/** Cryptographically-strong random hex string of `bytes` bytes. */
export declare const randomHex: (bytes?: number) => string;
/** RFC 4122 v4 UUID (crypto-strong). */
export declare const uuid: () => string;
