import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { askMetaAI, META_AI_JID } from '../lib/index.js';

const fakeSock = (sent) => ({
    ev: new EventEmitter(),
    sendMessage: async (j, c) => { sent.push([j, c]); return { key: { id: 'sent1' } }; }
});
const reply = (text, extra = {}) => ({
    key: { remoteJid: META_AI_JID, fromMe: false, id: 'r1' },
    messageTimestamp: Date.now() / 1000,
    message: { extendedTextMessage: { text } },
    ...extra
});

describe('askMetaAI', () => {
    it('sends + resolves reply text', async () => {
        const sent = [];
        const sock = fakeSock(sent);
        const p = askMetaAI(sock, 'hello', { timeoutMs: 2000 });
        await new Promise((r) => setTimeout(r, 10)); // let askMetaAI register its listener first
        sock.ev.emit('messages.upsert', { messages: [reply('hai juga!')] });
        const { text } = await p;
        assert.equal(sent[0][0], META_AI_JID);
        assert.equal(text, 'hai juga!');
    });
    it('ignores own messages', async () => {
        const sent = [];
        const sock = fakeSock(sent);
        const p = askMetaAI(sock, 'hello', { timeoutMs: 2000 });
        await new Promise((r) => setTimeout(r, 10));
        sock.ev.emit('messages.upsert', { messages: [reply('mine', { key: { remoteJid: META_AI_JID, fromMe: true, id: 'm' } })] });
        sock.ev.emit('messages.upsert', { messages: [reply('real')] });
        const { text } = await p;
        assert.equal(text, 'real');
    });
    it('times out', async () => {
        const sock = fakeSock([]);
        await assert.rejects(askMetaAI(sock, 'hello?', { timeoutMs: 30 }), /timed out/);
    });
    it('validates input', async () => {
        await assert.rejects(askMetaAI(null, 'x'), /active Baileys socket/);
        await assert.rejects(askMetaAI(fakeSock([]), ''), /non-empty/);
    });
});
