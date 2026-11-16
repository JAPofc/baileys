// Tests for the upgraded Mini App toolkit: signed + expiring deep links,
// server-side request verification, signed CTA URLs in buildMiniAppContent,
// and reading in-chat Flow submissions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createMiniAppLink, parseMiniAppParams, verifyMiniAppRequest,
    parseMiniAppResponse, buildMiniAppContent, buildFlowNavigate
} from '../lib/Utils/mini-app.js';

const SECRET = 's3cr3t';
const makeClock = (t) => { const s = { t }; return { now: () => s.t, advance: (ms) => { s.t += ms; } }; };

test('createMiniAppLink signs params and parseMiniAppParams verifies + strips sig', () => {
    const link = createMiniAppLink('https://app.example.com', { uid: '123', ref: 'bot' }, { secret: SECRET });
    assert.ok(link.includes('sig='));
    const p = parseMiniAppParams(link, { secret: SECRET });
    assert.equal(p.uid, '123');
    assert.equal(p.ref, 'bot');
    assert.equal(p.sig, undefined);
});

test('tampering with a signed param fails verification with 403', () => {
    const link = createMiniAppLink('https://x.com', { uid: '123' }, { secret: SECRET });
    const tampered = link.replace('uid=123', 'uid=999');
    assert.throws(() => parseMiniAppParams(tampered, { secret: SECRET }), (e) => e?.output?.statusCode === 403);
});

test('the signature is independent of param insertion order', () => {
    const a = createMiniAppLink('https://x.com', { a: '1', b: '2' }, { secret: SECRET });
    const b = createMiniAppLink('https://x.com', { b: '2', a: '1' }, { secret: SECRET });
    assert.equal(new URL(a).searchParams.get('sig'), new URL(b).searchParams.get('sig'));
});

test('expiresIn stamps a signed exp that is enforced on parse', () => {
    const clock = makeClock(1_000_000_000_000);
    const link = createMiniAppLink('https://x.com', { u: '1' }, { secret: SECRET, expiresIn: 3600, now: clock.now });
    assert.equal(new URL(link).searchParams.get('exp'), '1000003600');
    assert.equal(parseMiniAppParams(link, { secret: SECRET, now: clock.now }).u, '1');
    clock.advance(3601 * 1000);
    assert.throws(() => parseMiniAppParams(link, { secret: SECRET, now: clock.now }), (e) => e?.output?.statusCode === 403);
});

test('exp is tamper-proof because the signature covers it', () => {
    const clock = makeClock(1_000_000_000_000);
    const link = createMiniAppLink('https://x.com', { u: '1' }, { secret: SECRET, expiresIn: 60, now: clock.now });
    const forged = link.replace(/exp=\d+/, 'exp=9999999999');
    assert.throws(() => parseMiniAppParams(forged, { secret: SECRET, now: clock.now }), (e) => e?.output?.statusCode === 403);
});

test('a bare exp (no secret) is still courtesy-checked', () => {
    const clock = makeClock(1_000_000_000_000);
    const link = createMiniAppLink('https://x.com', { u: '1' }, { expiresIn: 10, now: clock.now });
    assert.equal(parseMiniAppParams(link, { now: clock.now }).u, '1');
    clock.advance(11 * 1000);
    assert.throws(() => parseMiniAppParams(link, { now: clock.now }), (e) => e?.output?.statusCode === 403);
});

test('expiresIn must be a positive number of seconds', () => {
    assert.throws(() => createMiniAppLink('https://x.com', {}, { expiresIn: -5 }), (e) => e?.output?.statusCode === 400);
    assert.throws(() => createMiniAppLink('https://x.com', {}, { expiresIn: 'soon' }), (e) => e?.output?.statusCode === 400);
});

test('an invalid base URL throws 400', () => {
    assert.throws(() => createMiniAppLink('::not a url::', {}, { secret: SECRET }), (e) => e?.output?.statusCode === 400);
});

test('verifyMiniAppRequest accepts a URL, a query string, or a params object', () => {
    const link = createMiniAppLink('https://app.example.com', { uid: '123' }, { secret: SECRET });
    const url = new URL(link);
    assert.equal(verifyMiniAppRequest(link, { secret: SECRET }).uid, '123');
    assert.equal(verifyMiniAppRequest(url.search, { secret: SECRET }).uid, '123'); // '?uid=…&sig=…'
    assert.equal(verifyMiniAppRequest(url.search.slice(1), { secret: SECRET }).uid, '123'); // no leading ?
    const obj = Object.fromEntries(url.searchParams.entries());
    assert.equal(verifyMiniAppRequest(obj, { secret: SECRET }).uid, '123');
});

test('verifyMiniAppRequest rejects tampering and bad input', () => {
    const link = createMiniAppLink('https://x.com', { uid: '1' }, { secret: SECRET });
    const obj = Object.fromEntries(new URL(link).searchParams.entries());
    obj.uid = '2';
    assert.throws(() => verifyMiniAppRequest(obj, { secret: SECRET }), (e) => e?.output?.statusCode === 403);
    assert.throws(() => verifyMiniAppRequest(123), (e) => e?.output?.statusCode === 400);
});

test('buildMiniAppContent signs the CTA URL when a secret is supplied', async () => {
    const c = await buildMiniAppContent({ body: 'hi', url: 'https://x.com/app', params: { uid: '7' }, secret: SECRET });
    assert.ok(c.nativeFlow[0].url.includes('sig='));
    assert.equal(parseMiniAppParams(c.nativeFlow[0].url, { secret: SECRET }).uid, '7');
});

test('buildMiniAppContent stays unsigned without a secret (backward compatible)', async () => {
    const c = await buildMiniAppContent({ body: 'hi', url: 'https://x.com/app', params: { uid: '7' } });
    assert.ok(!c.nativeFlow[0].url.includes('sig='));
    assert.ok(c.nativeFlow[0].url.includes('uid=7'));
});

test('buildMiniAppContent can sign + expire the CTA URL together', async () => {
    const clock = makeClock(1_000_000_000_000);
    const c = await buildMiniAppContent({ body: 'hi', url: 'https://x.com', secret: SECRET, expiresIn: 300 });
    // exp present and CTA verifies now
    assert.ok(c.nativeFlow[0].url.includes('exp='));
    assert.doesNotThrow(() => parseMiniAppParams(c.nativeFlow[0].url, { secret: SECRET, now: clock.now }));
});

test('buildFlowNavigate nests the screen inside data with a navigate action', () => {
    assert.deepEqual(
        buildFlowNavigate('SUMMARY', { orderId: 42 }),
        { version: '3.0', action: 'navigate', data: { screen: 'SUMMARY', orderId: 42 } }
    );
    assert.deepEqual(
        buildFlowNavigate('WELCOME', {}, { version: '3.1', token: 'tok' }),
        { version: '3.1', action: 'navigate', data: { screen: 'WELCOME' }, token: 'tok' }
    );
    assert.throws(() => buildFlowNavigate(''), (e) => e?.output?.statusCode === 400);
});

test('parseMiniAppResponse reads a Flow submission', () => {
    const msg = {
        message: {
            interactiveResponseMessage: {
                body: { text: 'Submitted' },
                nativeFlowResponseMessage: { name: 'flow', version: 3, paramsJson: JSON.stringify({ flow_token: 'T1', email: 'a@b.com' }) }
            }
        }
    };
    const r = parseMiniAppResponse(msg);
    assert.equal(r.flowToken, 'T1');
    assert.equal(r.params.email, 'a@b.com');
    assert.equal(r.body, 'Submitted');
    assert.equal(r.name, 'flow');
    assert.equal(r.version, 3);
});

test('parseMiniAppResponse accepts inner/ephemeral shapes and handles junk', () => {
    const inner = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"flow_token":"X"}' } } };
    assert.equal(parseMiniAppResponse(inner).flowToken, 'X');
    const eph = { message: { ephemeralMessage: { message: inner } } };
    assert.equal(parseMiniAppResponse(eph).flowToken, 'X');
    // not a flow response
    assert.equal(parseMiniAppResponse({ message: { conversation: 'hi' } }), null);
    assert.equal(parseMiniAppResponse(null), null);
    // invalid JSON degrades to {}
    const bad = { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{bad' } } } };
    assert.deepEqual(parseMiniAppResponse(bad).params, {});
});
