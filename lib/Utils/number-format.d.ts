/** Compact/ordinal/grouped number formatting. */
export declare const compactNumber: (value: number, opts?: { decimals?: number }) => string;
export declare const ordinal: (value: number) => string;
export declare const groupDigits: (value: number, opts?: { separator?: string }) => string;
export declare const formatIDR: (value: number, opts?: { symbol?: string; decimals?: number }) => string;
