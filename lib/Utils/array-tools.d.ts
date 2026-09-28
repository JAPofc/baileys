/** Array tools — chunk, unique, groupBy, sortBy, sample, range. */
export declare const chunk: <T>(items: T[], size: number) => T[][];
export declare const unique: <T>(items: T[], keyFn?: (item: T) => unknown) => T[];
export declare const groupBy: <T>(items: T[], keyFn: (item: T) => unknown) => Record<string, T[]>;
export declare const sortBy: <T>(items: T[], keyFn: (item: T) => number | string) => T[];
/** N distinct random elements. */
export declare const sample: <T>(items: T[], n?: number, options?: { random?: () => number }) => T[];
/** Inclusive range; descending supported. */
export declare const range: (from: number, to: number, step?: number) => number[];
