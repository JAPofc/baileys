// Tests for the v2.4.6 mini-app / webview security upgrade:
// audience binding + single-use nonce anti-replay on signed opener links.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMiniAppLink, parseMiniAppParams, verifyMiniAppRequest, createNonceStore
} from '../lib/Utils/mini-app.js';

const SECRET = 'super-secret-key';

describe('mini-app audience binding', () => {
    it('signs an aud claim and accepts the matching opener', () => {
        const link = createMiniAppLink('https://app.example/open', { uid: '1' }, {
            secret: SECRET, audience: '628111@s.whatsapp.net'
        });
        const params = parseMiniAppParams(link, { secret: SECRET, audience: '628111@s.whatsapp.net' });
        assert.equal(params.uid, '1');
        assert.equal(params.aud, '628111@s.whatsapp.net');
    });

    it('rejects a link opened by a different audience (403)', () => {
        const link = createMiniAppLink('https://app.example/open', {}, {
            secret: SECRET, audience: '628111@s.whatsapp.net'
        });
        assert.throws(
            () => parseMiniAppParams(link, { secret: SECRET, audience: '628999@s.whatsapp.net' }),
            (e) => e.output?.statusCode === 403 && /audience mismatch/.test(e.message)
        );
    });

    it('aud is covered by the signature (tampering breaks it)', () => {
        const link = createMiniAppLink('https://app.example/open', {}, {
            secret: SECRET, audience: 'A'
        });
        const tampered = link.replace('aud=A', 'aud=B');
        assert.throws(
            () => parseMiniAppParams(tampered, { secret: SECRET, audience: 'B' }),
            (e) => e.output?.statusCode === 403 && /invalid signature/.test(e.message)
        );
    });
});

describe('createNonceStore', () => {
    it('issue() mints unique nonces; consume() succeeds once then rejects replays', () => {
        const store = createNonceStore();
        const n = store.issue();
        assert.equal(typeof n, 'string');
        assert.ok(store.has(n));
        assert.equal(store.consume(n), true, 'first use ok');
        assert.equal(store.consume(n), false, 'replay rejected');
    });

    it('rejects nonces it never issued', () => {
        const store = createNonceStore();
        assert.equal(store.consume('deadbeef'), false);
        assert.equal(store.consume(''), false);
        assert.equal(store.consume(undefined), false);
    });

    it('expires issued nonces after ttlMs (injected clock)', () => {
        let t = 1_000_000;
        const store = createNonceStore({ ttlMs: 1000, now: () => t });
        const n = store.issue();
        t += 1500; // past ttl
        assert.equal(store.consume(n), false, 'expired nonce rejected');
    });
});

describe('mini-app one-time nonce (end-to-end anti-replay)', () => {
    it('a signed nonce link works once and is rejected on replay', () => {
        const store = createNonceStore();
        const nonce = store.issue();
        const link = createMiniAppLink('https://app.example/open', { uid: '7' }, {
            secret: SECRET, nonce
        });
        // first open succeeds and consumes the nonce
        const first = verifyMiniAppRequest(link, { secret: SECRET, nonceStore: store });
        assert.equal(first.uid, '7');
        assert.equal(first.nonce, nonce);
        // replay of the exact same link is now 403
        assert.throws(
            () => verifyMiniAppRequest(link, { secret: SECRET, nonceStore: store }),
            (e) => e.output?.statusCode === 403 && /nonce invalid or already used/.test(e.message)
        );
    });

    it('a link with no nonce is rejected when a nonceStore is required', () => {
        const store = createNonceStore();
        const link = createMiniAppLink('https://app.example/open', { uid: '7' }, { secret: SECRET });
        assert.throws(
            () => verifyMiniAppRequest(link, { secret: SECRET, nonceStore: store }),
            (e) => e.output?.statusCode === 403
        );
    });

    it('nonce is covered by the signature (a forged nonce fails on sig, not consume)', () => {
        const store = createNonceStore();
        const nonce = store.issue();
        const link = createMiniAppLink('https://app.example/open', {}, { secret: SECRET, nonce });
        const forged = link.replace(`nonce=${nonce}`, 'nonce=ffff');
        assert.throws(
            () => verifyMiniAppRequest(forged, { secret: SECRET, nonceStore: store }),
            (e) => e.output?.statusCode === 403 && /invalid signature/.test(e.message)
        );
        // original nonce remains unconsumed since the forged attempt failed earlier
        assert.equal(store.consume(nonce), true);
    });
});
