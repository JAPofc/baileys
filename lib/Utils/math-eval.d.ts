/** Math eval — safe calculator (no eval), terbilang, Roman numerals. */

/** Evaluate + - * / % ^ with parens & decimals. Throws clear errors. */
export declare const evaluateMath: (expression: string) => number;
/** Indonesian spelling: terbilang(1250) → 'seribu dua ratus lima puluh'. */
export declare const terbilang: (n: number) => string;
/** 1..3999 → 'MMXXVI'. */
export declare const toRoman: (n: number) => string;
/** Canonical Roman numerals → number (round-trip validated). */
export declare const fromRoman: (input: string) => number;
