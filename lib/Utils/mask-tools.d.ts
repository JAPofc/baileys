/** Mask tools — hide the middle of sensitive strings. */
export declare const maskPhone: (input: string, options?: { keepStart?: number; keepEnd?: number; char?: string }) => string;
export declare const maskEmail: (input: string, options?: { keep?: number; char?: string }) => string;
/** Star out listed words (first+last letter kept for 3+ letters). */
export declare const censorText: (text: string, words: string[], options?: { char?: string }) => string;
