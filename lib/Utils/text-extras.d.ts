/** Text extras — read-more, progress bars, human formats, fuzzy distance. */

export declare const READ_MORE: string;
/** Compose a message where `hidden` collapses behind "Read more". */
export declare const readMore: (visible: string, hidden?: string) => string;

export declare const progressBar: (
	value: number,
	max?: number,
	options?: { size?: number; filled?: string; empty?: string; showPercent?: boolean }
) => string;

/** '1d 2h 3m' style durations. */
export declare const formatDuration: (ms: number, options?: { parts?: number }) => string;
/** '5 MB' style sizes. */
export declare const formatBytes: (bytes: number, options?: { decimals?: number }) => string;

export declare const truncate: (text: string, max: number, options?: { ellipsis?: string }) => string;
/** Split long text at newline/space boundaries for message limits. */
export declare const chunkText: (text: string, size?: number) => string[];

/** Escape WhatsApp formatting chars (* _ ~ `). */
export declare const escapeMarkdown: (text: string) => string;
export declare const stripMarkdown: (text: string) => string;

export declare const levenshtein: (a: string, b: string) => number;
/** 0..1 similarity from edit distance (1 = identical). */
export declare const similarity: (a: string, b: string) => number;

/** Text sparkline: sparkline([1,5,3,8]) → '▁▅▃█'. */
export declare const sparkline: (values: number[], options?: { chars?: string }) => string;

/** Title Case Every Word. */
export declare const titleCase: (text: string) => string;
/** URL/file-safe slug. */
export declare const slugify: (text: string, options?: { separator?: string }) => string;
/** Short unique id with optional prefix ('ord_lx2c…'). */
export declare const generateId: (prefix?: string) => string;
export declare const wordCount: (str?: string) => number;
export declare const ellipsisMiddle: (str?: string, max?: number, ellipsis?: string) => string;
/** Capitalize the first character, leaving the rest untouched. */
export declare const capitalize: (text?: string) => string;
/** Reverse a string, code-point aware (emoji-safe). */
export declare const reverseText: (text?: string) => string;
/** Count non-overlapping occurrences of `needle` in `haystack`. */
export declare const countOccurrences: (haystack?: string, needle?: string) => number;
/** Center a string within `width` using `fill`. */
export declare const padCenter: (text: string, width: number, fill?: string) => string;
/** Strip diacritics/accents: 'Café' → 'Cafe'. */
export declare const stripAccents: (text?: string) => string;
/** Initials from a name: 'Budi Santoso' → 'BS' (up to `max`). */
export declare const initials: (name?: string, opts?: { max?: number }) => string;
/** Count-aware word form: pluralize(3, 'file') → '3 files'. */
export declare const pluralize: (count: number, singular: string, plural?: string, opts?: { includeCount?: boolean }) => string;
