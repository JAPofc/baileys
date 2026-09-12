/** Options for the one-time startup banner. */
export interface PrintBannerOptions {
    /** Explicitly enable/disable (socket config printBanner). Default: auto (TTY only). */
    enabled?: boolean;
    /** Test hook: bypass TTY/env checks and always print. */
    force?: boolean;
}

/**
 * Prints the startup banner once per process on a TTY. Silenced by
 * `enabled: false`, `JAP_NO_BANNER`, `NO_COLOR`, or non-TTY stdout.
 */
export declare const printBanner: (opts?: PrintBannerOptions) => void;

/** Test hook — re-arms the once-per-process guard. */
export declare const _resetBannerShown: () => void;
