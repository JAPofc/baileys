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

    it('prints once with force, and only once per process', () => {
        const first = capture(() => printBanner({ force: true }));
        assert.match(first, /@japofc\/baileys/);
        assert.match(first, /JAP_NO_BANNER/);
        const second = capture(() => printBanner({ force: true }));
        assert.equal(second, ''); // once-per-process guard
    });

    it('never prints when stdout is not a TTY (default path in tests/CI)', () => {
        // node:test pipes stdout, so isTTY is falsy here — the default path must be silent
        const out = capture(() => printBanner());
        assert.equal(out, '');
    });

    it('enabled:false always wins, even on a TTY', () => {
        const out = capture(() => printBanner({ enabled: false }));
        assert.equal(out, '');
    });
});
