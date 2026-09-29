/** Time tools — relative times, clocks, windows, greetings. */

/** '5m ago' / 'in 2h' / 'just now'. */
export declare const formatRelative: (timestamp: number, options?: { now?: number }) => string;
/** ms → 'HH:MM:SS' ('D:HH:MM:SS' past 24h). */
export declare const formatClock: (ms: number) => string;
/** Parse 'HH:MM' (24h). Throws on invalid input. */
export declare const parseClockTime: (value: string) => { hour: number; minute: number };
/** Next local occurrence of 'HH:MM' as epoch ms. */
export declare const nextOccurrence: (at: string, options?: { now?: number }) => number;
/** Inside a window? Overnight ranges handled; probe = 'HH:MM' or epoch ms. */
export declare const isWithinHours: (probe: string | number, from: string, to: string) => boolean;
/** Locale-pretty date: humanDate(ts, 'id') → '28 September 2026'. */
export declare const humanDate: (timestamp?: number, lang?: string, options?: Intl.DateTimeFormatOptions) => string;

/** Time-of-day greeting ('en' | 'id'). */
export declare const getGreeting: (hour?: number, lang?: string) => string;
/** Local midnight of the day containing `timestamp`, as epoch ms. */
export declare const startOfDay: (timestamp?: number) => number;
/** True when two timestamps fall on the same local calendar day. */
export declare const isSameDay: (a: number, b: number) => boolean;
/** Add `n` calendar days to a timestamp (n may be negative/fractional), as epoch ms. */
export declare const addDays: (timestamp: number, n: number) => number;
/** Whole calendar days between two timestamps (local); sign follows a→b. */
export declare const daysBetween: (a: number, b: number) => number;
/** Local weekday name for a timestamp ('en' | 'id'). */
export declare const weekdayName: (timestamp?: number, lang?: string) => string;
export declare const formatCountdown: (ms: number) => string;
