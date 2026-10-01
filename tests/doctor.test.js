import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvironment } from '../lib/Utils/doctor.js';
import { printBanner, _resetBannerShown } from '../lib/Utils/banner.js';

describe('doctor: checkEnvironment()', () => {
    it('returns a complete, well-shaped report and never throws', async () => {
        const env = await checkEnvironment();
        assert.equal(typeof env.ok, 'boolean');
        assert.equal(typeof env.platform, 'string');
        assert.equal(typeof env.arch, 'string');
        assert.equal(env.node.version, process.versions.node);
        assert.equal(env.node.supported, true); // tests require Node 20+
        assert.equal(typeof env.ffmpeg.found, 'boolean');
        assert.ok(Array.isArray(env.warnings));
        // core probed packages must always be present in the map
        for (const name of ['sharp', 'jimp', 'fluent-ffmpeg', 'better-sqlite3', '@roamhq/wrtc']) {
            assert.ok(env.optionalDeps[name], `missing probe for ${name}`);
            assert.equal(typeof env.optionalDeps[name].installed, 'boolean');
            assert.equal(typeof env.optionalDeps[name].unlocks, 'string');
        }
    });

    it('imageBackend matches the actual fallback chain', async () => {
        const env = await checkEnvironment();
        const { optionalDeps: d, imageBackend } = env;
        if (d['sharp'].installed) assert.equal(imageBackend, 'sharp');
        else if (d['@napi-rs/image'].installed) assert.equal(imageBackend, '@napi-rs/image');
        else if (d['jimp'].installed) assert.equal(imageBackend, 'jimp');
        else assert.equal(imageBackend, null);
    });

    it('ok is false exactly when there are warnings', async () => {
        const env = await checkEnvironment();
        assert.equal(env.ok, env.warnings.length === 0);
    });
});

describe('banner: printBanner()', () => {
    afterEach(() => _resetBannerShown());

    const capture = (fn) => {
        const chunks = [];
        const orig = process.stdout.write;
        process.stdout.write = (s) => (chunks.push(String(s)), true);
        try {
            fn();
        } finally {
            process.stdout.write = orig;
        }
        return chunks.join('');
    };

    it('always prints, and only once per process', () => {
        const first = capture(() => printBanner());
        assert.match(first, /@japofc\/baileys/);
        assert.match(first, /J\.AP/);
        const second = capture(() => printBanner());
        assert.equal(second, ''); // once-per-process guard
    });

    it('non-TTY (CI/pipes) gets a single plain signature line with no ANSI codes', () => {
        // node:test pipes stdout, so isTTY is falsy here — the plain path
        const out = capture(() => printBanner());
        assert.match(out, /@japofc\/baileys/);
        assert.match(out, /github\.com\/JAPofc\/baileys/);
        assert.ok(!out.includes('\x1b['), 'no ANSI escapes on non-TTY output');
        assert.equal(out.trim().split('\n').length, 1, 'exactly one line');
    });

    it('TTY: framed info card with WA Web version and a daily tagline', () => {
        const origTTY = process.stdout.isTTY;
        process.stdout.isTTY = true;
        try {
            const out = capture(() => printBanner());
            assert.match(out, /╭─+╮/, 'framed card top border');
            assert.match(out, /WA Web.*2\.3000\.\d+/s, 'baked WA version shown');
            assert.match(out, /node \d+\.\d+/, 'node version shown');
            assert.match(out, /Made with/, 'signature present');
            assert.match(out, /"[^"]+\."/, 'a tagline is quoted');
        } finally {
            process.stdout.isTTY = origTTY;
        }
    });

    it('NO_COLOR TTY: full multi-line banner without any ANSI codes', () => {
        const origTTY = process.stdout.isTTY;
        process.stdout.isTTY = true;
        process.env.NO_COLOR = '1';
        try {
            const out = capture(() => printBanner());
            assert.ok(!out.includes('\x1b['), 'no ANSI under NO_COLOR');
            assert.ok(out.split('\n').length > 5, 'still the full banner, just unstyled');
            assert.match(out, /WA Web 2\.3000\.\d+/);
        } finally {
            delete process.env.NO_COLOR;
            process.stdout.isTTY = origTTY;
        }
    });

    it('cannot be disabled: no opt-out via env or options', () => {
        process.env.JAP_NO_BANNER = '1';
        process.env.NO_COLOR = '1';
        try {
            const out = capture(() => printBanner({ enabled: false }));
            assert.match(out, /@japofc\/baileys/, 'banner prints regardless of env vars and options');
        } finally {
            delete process.env.JAP_NO_BANNER;
            delete process.env.NO_COLOR;
        }
    });
});
