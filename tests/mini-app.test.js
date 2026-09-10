import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniAppContent, generateWAMessage } from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };

describe('mini-app url mode', () => {
    it('builds cta_url content', async () => {
        const c = await buildMiniAppContent({ title: 'App', body: 'Open it', url: 'https://example.com/app' });
        assert.equal(c.nativeFlow[0].url, 'https://example.com/app');
        assert.equal(c.nativeFlow[0].useWebview, true);
        assert.ok(c.text.includes('Open it'));
    });
    it('reaches cta_url on the wire', async () => {
        const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com' });
        const m = await generateWAMessage(JID, c, OPTS);
        assert.equal(m.message.interactiveMessage.nativeFlowMessage.buttons[0].name, 'cta_url');
    });
    it('appends params to url', async () => {
        const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com/a', params: { ref: 'bot', n: 7 } });
        assert.ok(c.nativeFlow[0].url.includes('ref=bot'));
        assert.ok(c.nativeFlow[0].url.includes('n=7'));
    });
    it('accepts Buffer thumbnail', async () => {
        const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com', thumbnail: Buffer.alloc(100) });
        assert.ok(Buffer.isBuffer(c.externalAdReply.thumbnail));
    });
});

describe('mini-app flow mode', () => {
    it('builds flow_action with token passthrough', async () => {
        const c = await buildMiniAppContent({ body: 'Isi', flow: { id: 'F1', screen: 'W', token: 'tok' } });
        assert.equal(c.nativeFlow.length, 1);
        assert.equal(c.externalAdReply, undefined);
        const m = await generateWAMessage(JID, c, OPTS);
        const btn = m.message.interactiveMessage.nativeFlowMessage.buttons[0];
        assert.equal(btn.name, 'flow_action');
        const params = JSON.parse(btn.buttonParamsJson);
        assert.equal(params.flow_id, 'F1');
        assert.equal(params.flow_token, 'tok');
    });
    it('supports url+flow combo', async () => {
        const c = await buildMiniAppContent({ body: 'b', url: 'https://x.com', flow: 'F9' });
        assert.equal(c.nativeFlow.length, 2);
        assert.equal(c.nativeFlow[1].flow.id, 'F9');
    });
});

describe('mini-app validation', () => {
    it('needs url or flow', async () => {
        await assert.rejects(buildMiniAppContent({ body: 'b' }), /url.*flow|flow.*url/);
    });
    it('needs body', async () => {
        await assert.rejects(buildMiniAppContent({ url: 'https://x.com' }), /body/);
    });
    it('flow needs id', async () => {
        await assert.rejects(buildMiniAppContent({ body: 'x', flow: {} }), /flow\.id/);
    });
    it('params validate the url', async () => {
        await assert.rejects(buildMiniAppContent({ body: 'x', url: '::bad', params: { a: 1 } }), /valid URL/);
    });
});
