/** Array tools — chunk, unique, groupBy, sortBy, sample, range. */
export declare const chunk: <T>(items: T[], size: number) => T[][];
export declare const unique: <T>(items: T[], keyFn?: (item: T) => unknown) => T[];
export declare const groupBy: <T>(items: T[], keyFn: (item: T) => unknown) => Record<string, T[]>;
export declare const sortBy: <T>(items: T[], keyFn: (item: T) => number | string) => T[];
/** N distinct random elements. */
export declare const sample: <T>(items: T[], n?: number, options?: { random?: () => number }) => T[];
/** Inclusive range; descending supported. */
export declare const range: (from: number, to: number, step?: number) => number[];
export declare const partition: <T>(arr: T[], pred: (v: T, i: number) => boolean) => [T[], T[]];
export declare const zip: (...arrays: any[][]) => any[][];
/** Flatten nested arrays up to `depth` levels (default 1). */
export declare const flatten: (items: any[], depth?: number) => any[];
/** Tally occurrences by a computed key. */
export declare const countBy: <T>(items: T[], keyFn?: (item: T) => unknown) => Record<string, number>;
/** Drop falsy values (null/undefined/0/''/false/NaN). */
export declare const compact: <T>(items: T[]) => T[];
/** Sum a list, optionally by a numeric key function. */
export declare const sum: <T>(items: T[], keyFn?: (item: T) => number) => number;
/** Arithmetic mean of a list (0 for empty). */
export declare const mean: <T>(items: T[], keyFn?: (item: T) => number) => number;
/** Move an element to a new index (new array); negative indexes count from the end. */
export declare const move: <T>(items: T[], from: number, to: number) => T[];
/** Elements present in BOTH arrays (order/uniqueness from the first). */
export declare const intersection: <T>(a: T[], b: T[], keyFn?: (item: T) => unknown) => T[];
/** Elements in `a` that are NOT in `b`. */
export declare const difference: <T>(a: T[], b: T[], keyFn?: (item: T) => unknown) => T[];
/** Leading run of elements while `pred` holds. */
export declare const takeWhile: <T>(items: T[], pred: (v: T, i: number) => boolean) => T[];
/** Drop the leading run while `pred` holds, keep the rest. */
export declare const dropWhile: <T>(items: T[], pred: (v: T, i: number) => boolean) => T[];
/** Element with the largest computed key (first winner on ties). */
export declare const maxBy: <T>(items: T[], keyFn: (item: T) => number) => T | undefined;
/** Element with the smallest computed key (first winner on ties). */
export declare const minBy: <T>(items: T[], keyFn: (item: T) => number) => T | undefined;
/** Median of a numeric list (0 for empty). */
export declare const median: <T>(items: T[], keyFn?: (item: T) => number) => number;
