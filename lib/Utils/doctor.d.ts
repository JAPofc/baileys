/** Result of probing one optional dependency. */
export interface OptionalDepStatus {
    /** Whether the package could be imported. */
    installed: boolean;
    /** Version string when detectable, else null. */
    version: string | null;
    /** Which feature(s) this package unlocks. */
    unlocks: string;
    /** Present when the package exists but failed to load (e.g. missing native binary). */
    loadError?: string;
}

/** Full diagnostic snapshot returned by checkEnvironment(). */
export interface EnvironmentReport {
    /** True when there are no warnings at all. */
    ok: boolean;
    /** 'termux' when running under Termux, otherwise process.platform. */
    platform: string;
    arch: string;
    node: {
        version: string;
        supported: boolean;
    };
    ffmpeg: {
        found: boolean;
        path: string | null;
    };
    /** Which image backend the library will use, or null when none is available. */
    imageBackend: 'sharp' | '@napi-rs/image' | 'jimp' | null;
    optionalDeps: Record<string, OptionalDepStatus>;
    warnings: string[];
}

/**
 * Probes the runtime: Node version, every optional dependency, the ffmpeg
 * resolver and the image backend chain. Never throws, performs no writes.
 */
export declare const checkEnvironment: () => Promise<EnvironmentReport>;

/** Prints a human-friendly report to stdout and returns the snapshot. */
export declare const printEnvironmentReport: () => Promise<EnvironmentReport>;
