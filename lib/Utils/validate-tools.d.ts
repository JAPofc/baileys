/** Validation tools — quick input checks for command arguments. */
export declare const isUrl: (value: string) => boolean;
export declare const isEmail: (value: string) => boolean;
/** ya/yes/on/1/aktif → true; tidak/no/off/0 → false; else null. */
export declare const parseBool: (value: string) => boolean | null;
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const ensureArray: <T>(value: T | T[] | null | undefined) => T[];
export declare const pickFields: <T extends object>(obj: T, keys: Array<keyof T | string>) => Partial<T>;
