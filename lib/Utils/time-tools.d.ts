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
/** Time-of-day greeting ('en' | 'id'). */
export declare const getGreeting: (hour?: number, lang?: string) => string;
