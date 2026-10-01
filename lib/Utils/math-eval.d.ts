/** Math eval — safe calculator (no eval), terbilang, Roman numerals. */

/** Evaluate + - * / % ^ with parens & decimals. Throws clear errors. */
export declare const evaluateMath: (expression: string) => number;
/** Indonesian spelling: terbilang(1250) → 'seribu dua ratus lima puluh'. */
export declare const terbilang: (n: number) => string;
/** 1..3999 → 'MMXXVI'. */
export declare const toRoman: (n: number) => string;
/** Canonical Roman numerals → number (round-trip validated). */
export declare const fromRoman: (input: string) => number;
/** Greatest common divisor (absolute, integer). */
export declare const gcd: (a: number, b: number) => number;
/** Least common multiple (absolute, integer). */
export declare const lcm: (a: number, b: number) => number;
/** `part` as a percentage of `whole`, rounded to `decimals` (default 1). */
export declare const percentage: (part: number, whole: number, decimals?: number) => number;
/** Round to `decimals` places, half-up and free of float drift. */
export declare const roundTo: (value: number, decimals?: number) => number;
