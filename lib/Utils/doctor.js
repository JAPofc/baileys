// Environment doctor — one call that answers "why doesn't X work on my machine?".
// Probes the Node runtime, every optional dependency this package can use, the
// ffmpeg resolver and the native rust bridge, and reports which features that
// unlocks/blocks. Pure diagnostics: never throws, never mutates anything.
import { createRequire } from 'module';
import { resolveFfmpegPath, ffmpegInstallHint } from './ffmpeg-path.js';

const require = createRequire(import.meta.url);

const readVersion = (name) => {
    try {
        // resolve <pkg>/package.json relative to THIS package, like the real imports do
        return require(`${name}/package.json`).version ?? null;
    } catch {
        // some packages block subpath exports — fall back to reading the file directly
        try {
            const { readFileSync } = require('fs');
            const path = require.resolve(name).split(name)[0] + name + '/package.json';
            return JSON.parse(readFileSync(path, 'utf8')).version ?? null;
        } catch {
            return null;
        }
    }
};

const tryImport = async (name) => {
    try {
        const mod = await import(name);
        void mod;
        return { installed: true, version: readVersion(name) };
    } catch (err) {
        // ERR_MODULE_NOT_FOUND = simply not installed; anything else (e.g. a native
        // module failing to load its .node binary) is worth surfacing to the user.
        const notFound = err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND';
        return {
            installed: false,
            version: null,
            ...(notFound ? {} : { loadError: String(err?.message ?? err).split('\n')[0] }),
        };
    }
};

const OPTIONAL_DEPS = [
    { name: 'sharp', unlocks: 'fast image resize (thumbnails, stickers)' },
    { name: '@napi-rs/image', unlocks: 'native image fallback when sharp is missing' },
    { name: 'jimp', unlocks: 'pure-JS image fallback (bundled)' },
    { name: 'fluent-ffmpeg', unlocks: 'sticker + voice-note conversion' },
    { name: 'ffmpeg-static', unlocks: 'bundled ffmpeg binary (auto-detected)' },
    { name: '@ffmpeg-installer/ffmpeg', unlocks: 'alternative bundled ffmpeg binary' },
    { name: 'audio-decode', unlocks: 'voice-note waveform/duration extraction' },
    { name: 'link-preview-js', unlocks: 'rich link previews in outgoing text' },
    { name: 'better-sqlite3', unlocks: 'SQLite auth/store + Framework SQLiteStore/StatsManager' },
    { name: 'mongodb', unlocks: 'MongoDB store adapter' },
    { name: 'mysql2', unlocks: 'MySQL store adapter' },
    { name: 'pg', unlocks: 'PostgreSQL store adapter' },
    { name: 'ioredis', unlocks: 'Redis store adapter' },
    { name: 'node-webpmux', unlocks: 'sticker packname/author EXIF metadata' },
    { name: '@roamhq/wrtc', unlocks: 'VoIP voice calls (WebRTC relay)' },
    { name: 'whatsapp-rust-bridge', unlocks: 'native LT-Hash app-state + crypto acceleration' },
];

const detectPlatform = () => {
    if (process.env.TERMUX_VERSION || (process.env.PREFIX ?? '').includes('com.termux')) {
        return 'termux';
    }
    return process.platform;
};

/**
 * Collects a full diagnostic snapshot of the runtime environment.
 * Safe to call anywhere — never throws, performs no writes.
 */
export const checkEnvironment = async () => {
    const nodeMajor = Number(process.versions.node.split('.')[0]);

    const deps = {};
    await Promise.all(
        OPTIONAL_DEPS.map(async ({ name, unlocks }) => {
            deps[name] = { ...(await tryImport(name)), unlocks };
        })
    );

    const ffmpegPath = await resolveFfmpegPath().catch(() => null);

    const imageBackend = deps['sharp'].installed
        ? 'sharp'
        : deps['@napi-rs/image'].installed
            ? '@napi-rs/image'
            : deps['jimp'].installed
                ? 'jimp'
                : null;

    const warnings = [];
    if (nodeMajor < 20) {
        warnings.push(`Node ${process.versions.node} is below the required 20+ — the library will refuse to load.`);
    }
    if (!ffmpegPath) {
        warnings.push(ffmpegInstallHint());
    }
    if (!imageBackend) {
        warnings.push('No image backend found (sharp/@napi-rs/image/jimp) — thumbnails and sticker conversion will fail.');
    }
    for (const [name, info] of Object.entries(deps)) {
        if (info.loadError) {
            warnings.push(`${name} is installed but failed to load: ${info.loadError}`);
        }
    }

    return {
        ok: warnings.length === 0,
        platform: detectPlatform(),
        arch: process.arch,
        node: {
            version: process.versions.node,
            supported: nodeMajor >= 20,
        },
        ffmpeg: {
            found: !!ffmpegPath,
            path: ffmpegPath,
        },
        imageBackend,
        optionalDeps: deps,
        warnings,
    };
};

/**
 * Human-friendly wrapper around checkEnvironment(): prints a report to stdout
 * and returns the same snapshot. Ideal for a quick
 * `node -e "import('@japofc/baileys').then(m => m.printEnvironmentReport())"`.
 */
export const printEnvironmentReport = async () => {
    const env = await checkEnvironment();
    const mark = (v) => (v ? '✅' : '❌');
    const lines = [
        '',
        `@japofc/baileys environment check — ${env.ok ? 'all good ✅' : `${env.warnings.length} warning(s) ⚠️`}`,
        `  platform: ${env.platform} (${env.arch})   node: ${env.node.version} ${mark(env.node.supported)}`,
        `  ffmpeg:   ${env.ffmpeg.found ? `✅ ${env.ffmpeg.path}` : '❌ not found'}`,
        `  images:   ${env.imageBackend ? `✅ ${env.imageBackend}` : '❌ none'}`,
        '',
        '  optional packages:',
        ...Object.entries(env.optionalDeps).map(
            ([name, info]) =>
                `    ${info.installed ? '✅' : '➖'} ${name.padEnd(26)} ${info.installed ? '' : '(not installed) '}— ${info.unlocks}${info.loadError ? `  ⚠️ ${info.loadError}` : ''}`
        ),
    ];
    if (env.warnings.length) {
        lines.push('', '  warnings:');
        for (const w of env.warnings) {
            lines.push(...w.split('\n').map((l, i) => (i === 0 ? `    ⚠️ ${l}` : `       ${l}`)));
        }
    }
    lines.push('');
    console.log(lines.join('\n'));
    return env;
};
