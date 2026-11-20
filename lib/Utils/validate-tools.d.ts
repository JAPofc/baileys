/** Validation tools — quick input checks for command arguments. */
export declare const isUrl: (value: string) => boolean;
export declare const isEmail: (value: string) => boolean;
/** ya/yes/on/1/aktif → true; tidak/no/off/0 → false; else null. */
export declare const parseBool: (value: string) => boolean | null;
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const ensureArray: <T>(value: T | T[] | null | undefined) => T[];
export declare const pickFields: <T extends object>(obj: T, keys: Array<keyof T | string>) => Partial<T>;
export declare const isNumeric: (v: unknown) => boolean;
/** Loose phone-number check — 5..15 digits (E.164-ish). */
export declare const isPhoneNumber: (value: unknown) => boolean;
/** Parse to a finite number or return `fallback` (default 0). */
export declare const coerceNumber: (value: unknown, fallback?: number) => number;
/** New object WITHOUT the listed keys (complement of pickFields). */
export declare const omitFields: <T extends object>(obj: T, keys: Array<keyof T | string>) => Partial<T>;
/** Inclusive numeric bounds check. */
export declare const inRange: (value: unknown, min: number, max: number) => boolean;
/** True for an integer, or a string that cleanly represents one. */
export declare const isInteger: (value: unknown) => boolean;
/** Parse to an integer or return `fallback` (default 0). */
export declare const toInt: (value: unknown, fallback?: number) => number;
