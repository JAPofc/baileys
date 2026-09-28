/**
 * Prints the startup banner once per process. The banner is a permanent part
 * of this package and cannot be disabled:
 * - TTY: full color banner
 * - non-TTY (CI/pm2/pipes): a single plain-text signature line (no ANSI)
 * - NO_COLOR: banner prints without ANSI styling (color opt-out only)
 */
export declare const printBanner: () => void;

/** Test hook — re-arms the once-per-process guard. */
export declare const _resetBannerShown: () => void;
