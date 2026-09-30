/**
 * Prints the startup banner once per process. The banner is a permanent part
 * of this package and cannot be disabled:
 * - TTY: full color banner (24-bit true-color when the terminal supports it,
 *   256-color otherwise; OSC-8 clickable repo link)
 * - non-TTY (CI/pm2/pipes): a single plain-text signature line (no ANSI)
 * - NO_COLOR: banner prints without ANSI styling (color opt-out only)
 */
export declare const printBanner: () => void;

/**
 * Build the banner lines without writing them (pure — no I/O). Rendering is
 * decoupled from output so it can be tested or embedded. Options default to the
 * detected environment.
 */
export declare const renderBanner: (opts?: {
    /** Terminal width in columns (default: detected; < 56 → compact layout). */
    columns?: number;
    /** Emit ANSI color (default: true unless NO_COLOR is set). */
    color?: boolean;
    /** Use 24-bit true-color gradients (default: detected from COLORTERM). */
    truecolor?: boolean;
    /** Treat output as a TTY, enabling OSC-8 links (default: detected). */
    tty?: boolean;
}) => string[];

/** Pinnable gradient theme names for the `JAP_BANNER_THEME` env var. */
export declare const BANNER_THEMES: string[];

/** Test hook — re-arms the once-per-process guard. */
export declare const _resetBannerShown: () => void;

