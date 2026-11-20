// R32 — native WebView/Flow upgrade + AIRich open_url normalization.
//
// Covers:
//  1. prepareNativeFlowButtons `open_webview` shorthand (via generateWAMessage):
//     `webview` string / object / `openWebview` alias → real open_webview button
//     ({title, link:{url, in_app_webview}}); cta_url still emitted for `url`.
//  2. buildMiniAppContent `openWebview` opt-in → open_webview on the wire, while
//     the default stays cta_url (backward compatible).
//  3. AIRich normalizeRichActionType: aliases → OPEN_URL, no-op for canonical,
//     unknown values trimmed/upper-cased through; applied in addCompact/addFooterAction.
//  4. Button.validate() accepts a correctly-built open_webview button (link.url),
//     and still rejects one missing link.url.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateWAMessage,
    buildMiniAppContent,
    normalizeRichActionType,
    Button,
    AIRich,
} from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };

const wireButtons = async (content) => {
    const m = await generateWAMessage(JID, content, OPTS);
    return m.message.interactiveMessage.nativeFlowMessage.buttons;
};

// ── 1. prepareNativeFlowButtons open_webview shorthand ──────────────────────
test('webview string shorthand → open_webview with link.url + in_app_webview', async () => {
    const [btn] = await wireButtons({ text: 'hi', nativeFlow: [{ buttonText: 'Open App', webview: 'https://x.com/app' }] });
    assert.equal(btn.name, 'open_webview');
    const p = JSON.parse(btn.buttonParamsJson);
    assert.equal(p.title, 'Open App');
    assert.equal(p.link.url, 'https://x.com/app');
    assert.equal(p.link.in_app_webview, true);
    assert.equal(p.url, undefined); // url must NOT be top-level (that's cta_url's shape)
});

test('webview object honours title + inAppWebview:false', async () => {
    const [btn] = await wireButtons({ text: 'hi', nativeFlow: [{ webview: { url: 'https://x.com', title: 'Docs', inAppWebview: false } }] });
    assert.equal(btn.name, 'open_webview');
    const p = JSON.parse(btn.buttonParamsJson);
    assert.equal(p.title, 'Docs');
    assert.equal(p.link.in_app_webview, false);
});

test('openWebview alias key also produces open_webview', async () => {
    const [btn] = await wireButtons({ text: 'hi', nativeFlow: [{ openWebview: { url: 'https://x.com' } }] });
    assert.equal(btn.name, 'open_webview');
});

test('a plain url still emits cta_url (unchanged, non-regressing)', async () => {
    const [btn] = await wireButtons({ text: 'hi', nativeFlow: [{ buttonText: 'Visit', url: 'https://x.com' }] });
    assert.equal(btn.name, 'cta_url');
    const p = JSON.parse(btn.buttonParamsJson);
    assert.equal(p.url, 'https://x.com');
});

// ── 2. mini-app openWebview opt-in ──────────────────────────────────────────
test('mini-app default stays cta_url', async () => {
    const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com' });
    const [btn] = await wireButtons(c);
    assert.equal(btn.name, 'cta_url');
});

test('mini-app openWebview:true → real open_webview button', async () => {
    const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com/app', openWebview: true });
    const [btn] = await wireButtons(c);
    assert.equal(btn.name, 'open_webview');
    const p = JSON.parse(btn.buttonParamsJson);
    assert.equal(p.link.url, 'https://x.com/app');
    assert.equal(p.link.in_app_webview, true);
});

// ── 3. AIRich action-type normalization ─────────────────────────────────────
test('normalizeRichActionType canonicalises open-url aliases', () => {
    for (const v of ['open_url', 'openUrl', 'OPEN_URL', 'url', 'URL', 'link', 'Open Url', 'open-url', 'open_link']) {
        assert.equal(normalizeRichActionType(v), 'OPEN_URL', `alias ${v}`);
    }
});

test('normalizeRichActionType passes unknown actions through (trimmed/upper)', () => {
    assert.equal(normalizeRichActionType('  send_message '), 'SEND_MESSAGE');
    assert.equal(normalizeRichActionType('CALL_PHONE'), 'CALL_PHONE');
    assert.equal(normalizeRichActionType(undefined), 'OPEN_URL'); // fallback
    assert.equal(normalizeRichActionType(''), 'OPEN_URL');
});

test('addCompact normalizes a lowercase action_type to OPEN_URL', () => {
    const r = new AIRich({ logger: { warn() {} } });
    r.addCompact({ title: 'Card', entity_url: 'https://x.com', action_type: 'open_url' });
    const json = JSON.stringify(r._sections);
    assert.ok(json.includes('"action_type":"OPEN_URL"'));
    assert.ok(!json.includes('open_url'));
});

test('addFooterAction normalizes cta_type aliases', () => {
    const r = new AIRich({ logger: { warn() {} } });
    r.addFooterAction([{ text: 'Join', url: 'https://x.com', type: 'url' }]);
    const json = JSON.stringify(r._sections);
    assert.ok(json.includes('"cta_type":"OPEN_URL"'));
});

// ── 4. Button.validate() open_webview link.url ──────────────────────────────
test('addOpenWebview button validates clean (link.url path)', () => {
    const v = new Button({}).addOpenWebview('Docs', 'https://x.com/docs').validate();
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    assert.deepEqual(v.errors, []);
});

test('open_webview missing link.url is reported', () => {
    const v = new Button({}).addButton('open_webview', { title: 'X' }).validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /missing link\.url/.test(e)), JSON.stringify(v.errors));
});
