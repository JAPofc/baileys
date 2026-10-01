/**
 * Central ffmpeg binary resolver. Nothing is bundled; the binary is
 * auto-detected in priority order: setFfmpegPath()/FFMPEG_PATH override →
 * ffmpeg-static → @ffmpeg-installer/ffmpeg → system PATH.
 * @author J.AP
 */

/** Pin the ffmpeg binary explicitly (wins over every auto-detection step). */
export declare const setFfmpegPath: (path: string | null) => void;

/**
 * Resolve the ffmpeg binary: an absolute path, the bare 'ffmpeg' (system
 * PATH), or null when nothing was found. Result is cached.
 */
export declare const resolveFfmpegPath: () => Promise<string | null>;

/** Like resolveFfmpegPath() but throws a platform-aware install guide instead of returning null. */
export declare const requireFfmpegPath: () => Promise<string>;

/** Human install instructions for the current platform (Termux-aware). */
export declare const ffmpegInstallHint: () => string;
