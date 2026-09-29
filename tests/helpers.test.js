import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    shareGroupHistory, getGroupHistoryFromStore,
    transcribeAudio, transcribeMessage, customProvider, openAIWhisperProvider,
    createMiniAppLink, parseMiniAppParams, buildFlowDataExchange,
    A2UI,
} from '../lib/index.js';

describe('history-share', () => {
    const fakeMsg = (n) => ({ key: { remoteJid: '1@g.us', id: `m${n}` }, message: { conversation: `msg${n}` } });
    it('forwards last-N to each member with greeting', async () => {
        const sent = [];
        const sock = { sendMessage: async (jid, content) => { sent.push([jid, content]); return {}; } };
        const out = await shareGroupHistory(sock, {
            groupJid: '1@g.us', members: ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
            messages: [fakeMsg(1), fakeMsg(2), fakeMsg(3)], limit: 2, greeting: true, delayMs: 0,
        });
        assert.equal(out.sent, 2);
        assert.equal(out.perMember, 2);
        assert.deepEqual(out.failed, []);
        // greeting + 2 forwards per member = 6 sends
        assert.equal(sent.length, 6);
        assert.equal(sent[0][1].text.includes('1@g.us'), true);
    });
    it('reads history from store shapes', () => {
        assert.equal(getGroupHistoryFromStore({ messages: { g: [1, 2, 3] } }, 'g', 2).length, 2);
        assert.equal(getGroupHistoryFromStore({ messages: { g: { array: [1, 2, 3] } } }, 'g', 2).length, 2);
        assert.throws(() => getGroupHistoryFromStore({ messages: {} }, 'g'), /no cached/);
    });
    it('validates input', async () => {
        const sock = { sendMessage: async () => ({}) };
        await assert.rejects(shareGroupHistory({}, { groupJid: 'g', members: 'a', messages: [1] }), /socket/);
        await assert.rejects(shareGroupHistory(sock, { members: 'a', messages: [1] }), /groupJid/);
        await assert.rejects(shareGroupHistory(sock, { groupJid: 'g', members: 'a', messages: [] }), /messages/);
    });
});

describe('transcribe', () => {
    it('customProvider + transcribeAudio roundtrip', async () => {
        const provider = customProvider(async (buf) => ({ text: `len=${buf.length}` }));
        assert.deepEqual(await transcribeAudio(Buffer.alloc(10), { provider }), { text: 'len=10' });
        const strProvider = customProvider(async () => 'hello');
        assert.deepEqual(await transcribeAudio(Buffer.alloc(3), { provider: strProvider }), { text: 'hello' });
        await assert.rejects(transcribeAudio(Buffer.alloc(1), {}), /provider/);
        await assert.rejects(transcribeAudio('nope', { provider }), /Buffer/);
    });
    it('transcribeMessage downloads (stubbed) + transcribes', async () => {
        const provider = customProvider(async (buf, meta) => ({ text: `${meta.mimetype}:${buf.length}` }));
        async function* fakeDownload() { yield Buffer.alloc(5); yield Buffer.alloc(7); }
        const out = await transcribeMessage(null, {
            message: { audioMessage: { mediaKey: Buffer.alloc(32), mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } }
        }, { provider, download: async () => fakeDownload() });
        assert.deepEqual(out, { text: 'audio/ogg; codecs=opus:12', seconds: 4, ptt: true });
        await assert.rejects(transcribeMessage(null, { message: {} }, { provider }), /voice-note/);
    });
    it('openAIWhisperProvider validates', () => {
        assert.throws(() => openAIWhisperProvider({}), /apiKey/);
        assert.equal(typeof openAIWhisperProvider({ apiKey: 'x' }), 'function');
    });
});

describe('mini-app deep links', () => {
    it('sign + verify roundtrip, tamper rejected', () => {
        const link = createMiniAppLink('https://app.example.com/', { uid: '123', role: 'admin' }, { secret: 's3cr3t' });
        assert.deepEqual(parseMiniAppParams(link, { secret: 's3cr3t' }), { uid: '123', role: 'admin' });
        assert.throws(() => parseMiniAppParams(link.replace('admin', 'owner'), { secret: 's3cr3t' }), /signature/);
        assert.throws(() => parseMiniAppParams(link, { secret: 'wrong' }), /signature/);
        assert.deepEqual(parseMiniAppParams(link), { uid: '123', role: 'admin' });
    });
    it('buildFlowDataExchange shapes payload', () => {
        assert.deepEqual(buildFlowDataExchange('navigate', { screen: 'A' }), { version: '3.0', action: 'navigate', data: { screen: 'A' } });
        assert.throws(() => buildFlowDataExchange(''), /action/);
    });
});

describe('A2UI new components', () => {
    it('builds all 8 new widgets', () => {
        const ui = new A2UI();
        const label = ui.text('Volume');
        const ids = [
            label,
            ui.slider({ label: 'Volume', value: 70 }),
            ui.switch('Notif', { value: true }),
            ui.list([label]),
            ui.progressBar(0.5),
            ui.avatar('https://x/a.png'),
            ui.badge(label, { label: '3' }),
            ui.spacer({ height: 8 }),
            ui.tabs([label]),
        ];
        ui.root(ids);
        const built = ui.build({ wrapped: false });
        const comps = JSON.parse(built.data).components.map((c) => c.component);
        for (const name of ['Slider', 'Switch', 'List', 'ProgressBar', 'Avatar', 'Badge', 'Spacer', 'Tabs']) {
            assert.ok(comps.includes(name), `missing ${name}`);
        }
    });
    it('validates new ref keys', () => {
        const ui = new A2UI();
        ui.badge('ghost-id');
        ui.root([ui.text('x')]);
        assert.throws(() => ui.build(), /unknown id/);
    });
});
