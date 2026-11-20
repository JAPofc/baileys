import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import jsQR from 'jsqr';
import { Jimp } from 'jimp';
import { fetchBestWaVersion, qrToPNG, qrToMatrix } from '../lib/index.js';
import { resolveSocketVersionConfig } from '../lib/Framework/Bot.js';

const silent = pino({ level: 'silent' });

const withMockedFetch = async (impl, fn) => {
    const orig = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (...args) => { calls.push(args); return impl(...args); };
    try {
        return await fn(calls);
    }
    finally {
        globalThis.fetch = orig;
    }
};

const fakeSock = () => ({ ev: { on: () => { } }, end: async () => { } });

describe('fetchBestWaVersion chain', () => {
    it('uses WA sw.js client_revision when reachable', async () => {
        await withMockedFetch(
            async () => ({ ok: true, text: async () => 'x "client_revision": 1099999999 y' }),
            async () => {
                const res = await fetchBestWaVersion();
                assert.deepEqual(res.version, [2, 3000, 1099999999]);
                assert.equal(res.source, 'wa-web');
                assert.equal(res.isLatest, true);
            });
    });
    it('never throws fully offline — falls back with isLatest false', async () => {
        await withMockedFetch(
            async () => { throw new Error('offline'); },
            async () => {
                const res = await fetchBestWaVersion();
                assert.equal(res.isLatest, false);
                assert.equal(res.source, 'hardcoded-fallback');
                assert.ok(Array.isArray(res.version) && res.version.length === 3);
            });
    });
});

describe('Bot versionCheck wiring (resolveSocketVersionConfig)', () => {
    it('default: resolves the freshest version into socketConfig', async () => {
        await withMockedFetch(
            async () => ({ ok: true, text: async () => '"client_revision": 1088888888' }),
            async (calls) => {
                const cfg = await resolveSocketVersionConfig({ socketConfig: { auth: {} } }, silent);
                assert.deepEqual(cfg.version, [2, 3000, 1088888888]);
                assert.ok(cfg.auth, 'original socketConfig fields preserved');
                assert.ok(calls.length >= 1);
            });
    });

    it('versionCheck:false never touches the network', async () => {
        await withMockedFetch(
            async () => { throw new Error('must not be called'); },
            async (calls) => {
                const cfg = await resolveSocketVersionConfig({ versionCheck: false, socketConfig: { auth: {} } }, silent);
                assert.equal(cfg.version, undefined);
                assert.equal(calls.length, 0);
            });
    });

    it('pinned socketConfig.version never touches the network', async () => {
        await withMockedFetch(
            async () => { throw new Error('must not be called'); },
            async (calls) => {
                const cfg = await resolveSocketVersionConfig({ socketConfig: { auth: {}, version: [2, 3000, 1] } }, silent);
                assert.deepEqual(cfg.version, [2, 3000, 1]);
                assert.equal(calls.length, 0);
            });
    });

    it('offline: returns socketConfig with fallback version, never throws', async () => {
        await withMockedFetch(
            async () => { throw new Error('offline'); },
            async () => {
                const cfg = await resolveSocketVersionConfig({ socketConfig: {} }, silent);
                assert.ok(Array.isArray(cfg.version) && cfg.version.length === 3);
            });
    });
});

describe('qrToPNG', () => {
    it('produces a valid PNG an independent decoder reads back', async () => {
        const png = qrToPNG('https://wa.me/png-test', { scale: 6 });
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        const img = await Jimp.read(png);
        const expected = qrToMatrix('https://wa.me/png-test').length * 6;
        assert.equal(img.width, expected);
        assert.equal(img.height, expected);
        const res = jsQR(new Uint8ClampedArray(img.bitmap.data), img.width, img.height);
        assert.equal(res?.data, 'https://wa.me/png-test');
    });
    it('respects scale and gray levels', async () => {
        const png = qrToPNG('x', { scale: 2, dark: 40, light: 220 });
        const img = await Jimp.read(png);
        const vals = new Set();
        for (let i = 0; i < img.bitmap.data.length; i += 4) {
            vals.add(img.bitmap.data[i]);
        }
        assert.deepEqual([...vals].sort((a, b) => a - b), [40, 220]);
    });
});
