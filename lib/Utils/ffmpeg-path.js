/**
 * JAP@Add --- one central ffmpeg binary resolver for the whole package.
 *
 * Nothing is bundled (an ffmpeg binary is ~80MB per platform and does not
 * even exist for Termux/Android in ffmpeg-static) — instead the binary is
 * AUTO-DETECTED, in priority order:
 *
 *   1. explicit override        → setFfmpegPath('/path/to/ffmpeg') or
 *                                 the FFMPEG_PATH environment variable
 *   2. `ffmpeg-static`          → if the user installed it (optional peer)
 *   3. `@ffmpeg-installer/ffmpeg` → same, alternative provider
 *   4. system `ffmpeg` on PATH  → Termux (pkg install ffmpeg), apt, brew, ...
 *
 * Every ffmpeg consumer in this package (video thumbs, voice-note/sticker
 * conversion via fluent-ffmpeg, VoIP audio feeder) resolves through here, so
 * `npm i ffmpeg-static` — or nothing at all on systems with ffmpeg installed —
 * just works with zero configuration.
 *
 * @author J.AP
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';

let overridePath = null;
let cached; // undefined = not probed yet; null = probed, nothing found
let rejected = []; // candidates found but unusable, newest first — see inspectFfmpegPath()

/**
 * JAP@Fix (§2.67 / v2.4.8): a candidate used to be accepted on `existsSync` alone,
 * so a non-executable file (the classic lost `+x` after a zip/checkout/copy) or even
 * a *directory* named `ffmpeg` was handed to `spawn()` and blew up with a bare
 * `EACCES` far from the cause. A binary we are about to exec must be a regular file
 * we are allowed to execute.
 *
 * @returns {null | string} null when usable, otherwise the reason it was rejected
 */
const binaryProblem = (path) => {
    let stat;
    try {
        stat = statSync(path);
    }
    catch (err) {
        return err?.code === 'ENOENT' ? 'does not exist' : `cannot be read (${err?.code || err})`;
    }
    if (stat.isDirectory()) {
        return 'is a directory, not a binary';
    }
    if (!stat.isFile()) {
        return 'is not a regular file';
    }
    try {
        accessSync(path, constants.X_OK);
    }
    catch {
        return process.platform === 'win32'
            ? 'is not executable'
            : `is not executable (chmod +x "${path}")`;
    }
    return null;
};

const note = (source, path, problem) => {
    rejected = [{ source, path, problem }, ...rejected.filter(r => !(r.source === source && r.path === path))].slice(0, 8);
};

/** @returns {string | null} the path if it is usable, else null (and the reason is recorded) */
const acceptBinary = (source, path) => {
    const problem = binaryProblem(path);
    if (problem) {
        note(source, path, problem);
        return null;
    }
    return path;
};

const moduleProvidedPath = async () => {
    // 2. ffmpeg-static: default export is the absolute binary path (or null
    //    on platforms it does not ship, e.g. android/Termux)
    try {
        const mod = await import('ffmpeg-static');
        const p = mod?.default ?? mod;
        if (typeof p === 'string' && acceptBinary('ffmpeg-static', p)) {
            return p;
        }
    }
    catch { /* not installed */ }
    // 3. @ffmpeg-installer/ffmpeg: exports { path }
    try {
        const mod = await import('@ffmpeg-installer/ffmpeg');
        const p = (mod?.default ?? mod)?.path;
        if (typeof p === 'string' && acceptBinary('@ffmpeg-installer/ffmpeg', p)) {
            return p;
        }
    }
    catch { /* not installed */ }
    return null;
};

const systemHasFfmpeg = () => {
    try {
        const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return !r.error && r.status === 0;
    }
    catch {
        return false;
    }
};

/** Pin the ffmpeg binary explicitly (wins over every auto-detection step). */
export const setFfmpegPath = (path) => {
    overridePath = path || null;
    cached = undefined; // re-resolve on next use
    rejected = [];
};

/**
 * Resolve the ffmpeg binary to use. Returns an absolute path (module-provided
 * or override) or the bare string 'ffmpeg' when only the system binary is
 * available. Returns null when nothing was found. Result is cached.
 */
export const resolveFfmpegPath = async () => {
    // JAP@Fix (§2.67 / v2.4.8): both explicit overrides used to be returned unchecked
    // (`setFfmpegPath` did not even look at the filesystem), so one typo or one lost
    // executable bit produced a doomed spawn AND silently masked a perfectly good
    // ffmpeg-static / system binary. An unusable override is now skipped — the reason
    // is kept for inspectFfmpegPath() and surfaced by requireFfmpegPath().
    if (overridePath && acceptBinary('setFfmpegPath()', overridePath)) {
        return overridePath;
    }
    if (process.env.FFMPEG_PATH && acceptBinary('FFMPEG_PATH', process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    if (cached !== undefined) {
        return cached;
    }
    cached = (await moduleProvidedPath()) ?? (systemHasFfmpeg() ? 'ffmpeg' : null);
    return cached;
};

/**
 * JAP@Add (v2.4.8) --- what the resolver actually decided, and why.
 *
 * `resolveFfmpegPath()` deliberately skips candidates it cannot execute, which is the
 * right runtime behaviour but a terrible debugging experience ("I set FFMPEG_PATH and
 * it is still using the system binary"). This reports the resolved path, where it came
 * from, and every candidate that was rejected together with the reason.
 *
 * @returns {Promise<{ path: string | null, source: 'setFfmpegPath()' | 'FFMPEG_PATH' | 'ffmpeg-static' | '@ffmpeg-installer/ffmpeg' | 'PATH' | null, rejected: { source: string, path: string, problem: string }[] }>}
 */
export const inspectFfmpegPath = async () => {
    const path = await resolveFfmpegPath();
    let source = null;
    if (path === overridePath && path) {
        source = 'setFfmpegPath()';
    }
    else if (path && path === process.env.FFMPEG_PATH) {
        source = 'FFMPEG_PATH';
    }
    else if (path === 'ffmpeg') {
        source = 'PATH';
    }
    else if (path) {
        source = path.includes('@ffmpeg-installer') ? '@ffmpeg-installer/ffmpeg' : 'ffmpeg-static';
    }
    return { path, source, rejected: rejected.map(r => ({ ...r })) };
};

/**
 * Like resolveFfmpegPath() but throws a platform-aware install guide instead
 * of returning null — use at every "we need ffmpeg NOW" call site.
 */
export const requireFfmpegPath = async () => {
    const path = await resolveFfmpegPath();
    if (path) {
        return path;
    }
    throw new Error(ffmpegInstallHint());
};

/** Human install instructions for the current platform. */
export const ffmpegInstallHint = () => {
    const lines = [];
    // JAP@Fix (§2.67 / v2.4.8): when a candidate WAS found and only skipped because it
    // is unusable, "ffmpeg not found" is a misleading thing to tell the user.
    for (const r of rejected) {
        lines.push(`ffmpeg candidate from ${r.source} was skipped: "${r.path}" ${r.problem}.`);
    }
    lines.push('ffmpeg not found. Install one of:');
    const isAndroid = process.platform === 'android' ||
        !!process.env.TERMUX_VERSION || existsSync('/data/data/com.termux');
    if (isAndroid) {
        lines.push('  - Termux:  pkg install ffmpeg   (recommended — npm ffmpeg bundles have no Android binary)');
    }
    else if (process.platform === 'linux') {
        lines.push('  - npm:     npm i ffmpeg-static   (auto-detected, no config needed)');
        lines.push('  - Debian/Ubuntu:  sudo apt install ffmpeg');
    }
    else if (process.platform === 'darwin') {
        lines.push('  - npm:     npm i ffmpeg-static   (auto-detected, no config needed)');
        lines.push('  - Homebrew:  brew install ffmpeg');
    }
    else if (process.platform === 'win32') {
        lines.push('  - npm:     npm i ffmpeg-static   (auto-detected, no config needed)');
        lines.push('  - winget:  winget install ffmpeg   (or choco/scoop install ffmpeg)');
    }
    else {
        lines.push('  - npm:     npm i ffmpeg-static');
        lines.push('  - or your system package manager');
    }
    lines.push('  - or pin a binary yourself: setFfmpegPath(\'/path/to/ffmpeg\') / FFMPEG_PATH env var');
    return lines.join('\n');
};

/** Test hook: forget the cached probe result. */
export const _resetFfmpegCache = () => {
    cached = undefined;
    overridePath = null;
    rejected = [];
};
