/** Timing tools — debounce, throttle, stopwatches, measurements. */
export declare const debounce: <A extends unknown[]>(fn: (...args: A) => void, waitMs: number) => ((...args: A) => void) & { cancel(): void; flush(): void };
export declare const throttle: <A extends unknown[], R>(fn: (...args: A) => R, waitMs: number, options?: { now?: () => number }) => ((...args: A) => R | undefined) & { reset(): void };
export interface Stopwatch {
	lap(label?: string): number;
	readonly elapsedMs: number;
	getLaps(): Array<{ label: string; ms: number }>;
	format(): string;
}
export declare const createStopwatch: (options?: { now?: () => number }) => Stopwatch;
export declare const measureTime: <T>(fn: () => T | Promise<T>, options?: { now?: () => number }) => Promise<{ result: T; ms: number }>;
