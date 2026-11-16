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

export type FfmpegPathSource =
	| 'setFfmpegPath()'
	| 'FFMPEG_PATH'
	| 'ffmpeg-static'
	| '@ffmpeg-installer/ffmpeg'
	| 'PATH'

export type RejectedFfmpegCandidate = {
	/** where the candidate came from */
	source: string
	path: string
	/** why it was skipped, e.g. `is not executable (chmod +x "...")` */
	problem: string
}

export type FfmpegResolution = {
	/** the binary that will be used, or null when nothing usable was found */
	path: string | null
	source: FfmpegPathSource | null
	/** candidates that existed but could not be executed, newest first */
	rejected: RejectedFfmpegCandidate[]
}

/**
 * What the resolver decided and why. Candidates that exist but cannot be executed
 * are skipped rather than handed to `spawn()`; this reports them so a mis-set
 * `FFMPEG_PATH` is obvious instead of mysterious.
 */
export declare const inspectFfmpegPath: () => Promise<FfmpegResolution>;

/** Like resolveFfmpegPath() but throws a platform-aware install guide instead of returning null. */
export declare const requireFfmpegPath: () => Promise<string>;

/** Human install instructions for the current platform (Termux-aware). */
export declare const ffmpegInstallHint: () => string;
