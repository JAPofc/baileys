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

/** Title Case Every Word. */
export declare const titleCase: (text: string) => string;
/** URL/file-safe slug. */
export declare const slugify: (text: string, options?: { separator?: string }) => string;
/** Short unique id with optional prefix ('ord_lx2c…'). */
export declare const generateId: (prefix?: string) => string;
