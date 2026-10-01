// Tests for the v2.4.6 Meta AI helper upgrades (jid detection, edit unwrap, streaming).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { META_AI_JID } from '../lib/WABinary/index.js';
import {
    META_AI_USER,
    META_AI_JIDS,
    isMetaAIJid,
    extractMetaAIText,
    askMetaAI
} from '../lib/Utils/meta-ai.js';

const nowSec = () => Math.floor(Date.now() / 1000);
const makeFakeSock = () => {
    const ev = new EventEmitter();
    ev.setMaxListeners(0);
    return {
        ev: { on: (e, f) => ev.on(e, f), off: (e, f) => ev.off(e, f) },
        sendMessage: async (jid, content) => ({ key: { id: 'PROMPT1', remoteJid: jid, fromMe: true }, message: content }),
        emit: (payload) => ev.emit('messages.upsert', payload)
    };
};
const tick = () => new Promise((r) => setTimeout(r, 15));

test('META_AI constants', () => {
    assert.equal(META_AI_USER, '13135550002');
    assert.ok(META_AI_JIDS.includes('13135550002@c.us'));
    assert.equal(META_AI_JID, '13135550002@c.us');
});

test('isMetaAIJid recognizes Meta AI and @bot JIDs', () => {
    assert.equal(isMetaAIJid('13135550002@c.us'), true);
    assert.equal(isMetaAIJid('13135550002@s.whatsapp.net'), true);
    assert.equal(isMetaAIJid('13135550002:12@s.whatsapp.net'), true); // device suffix
    assert.equal(isMetaAIJid('99999999999@bot'), true);               // any WA AI bot
    assert.equal(isMetaAIJid('628123456789@s.whatsapp.net'), false);
    assert.equal(isMetaAIJid('120363000@g.us'), false);
    assert.equal(isMetaAIJid(''), false);
    assert.equal(isMetaAIJid(undefined), false);
});

test('extractMetaAIText reads text and unwraps streamed edits', () => {
    assert.equal(extractMetaAIText({ message: { conversation: 'Halo!' } }), 'Halo!');
    assert.equal(extractMetaAIText({ message: { extendedTextMessage: { text: 'Hai' } } }), 'Hai');
    assert.equal(
        extractMetaAIText({ message: { protocolMessage: { key: { id: 'R1' }, editedMessage: { conversation: 'Versi final' } } } }),
        'Versi final'
    );
    assert.equal(extractMetaAIText({ message: {} }), '');
    assert.equal(extractMetaAIText(null), '');
});

test('askMetaAI one-shot resolves with the first fresh reply', async () => {
    const sock = makeFakeSock();
    const p = askMetaAI(sock, 'hi');
    await tick();
    sock.emit({ messages: [{ key: { id: 'R1', remoteJid: META_AI_JID, fromMe: false }, message: { conversation: 'Halo dari Meta AI' }, messageTimestamp: nowSec() }] });
    const res = await p;
    assert.equal(res.text, 'Halo dari Meta AI');
    assert.equal(res.sent.key.id, 'PROMPT1');
});

test('askMetaAI streams edits and settles on the complete text', async () => {
    const sock = makeFakeSock();
    const updates = [];
    const p = askMetaAI(sock, 'tulis puisi', { settleMs: 40, onUpdate: (t) => updates.push(t) });
    await tick();
    // initial bubble, then two streamed edits of the SAME reply id (R1)
    sock.emit({ messages: [{ key: { id: 'R1', remoteJid: META_AI_JID, fromMe: false }, message: { conversation: 'Mawar' }, messageTimestamp: nowSec() }] });
    await new Promise((r) => setTimeout(r, 10));
    sock.emit({ messages: [{ key: { id: 'E1', remoteJid: META_AI_JID, fromMe: false }, message: { protocolMessage: { key: { id: 'R1' }, editedMessage: { conversation: 'Mawar merah' } } }, messageTimestamp: nowSec() }] });
    await new Promise((r) => setTimeout(r, 10));
    sock.emit({ messages: [{ key: { id: 'E2', remoteJid: META_AI_JID, fromMe: false }, message: { protocolMessage: { key: { id: 'R1' }, editedMessage: { conversation: 'Mawar merah berduri' } } }, messageTimestamp: nowSec() }] });
    const res = await p;
    assert.equal(res.text, 'Mawar merah berduri');
    assert.ok(updates.length >= 3, `expected >=3 updates, got ${updates.length}`);
    assert.equal(updates.at(-1), 'Mawar merah berduri');
});

test('askMetaAI ignores messages from other chats and stale history', async () => {
    const sock = makeFakeSock();
    const p = askMetaAI(sock, 'hi', { timeoutMs: 120 });
    await tick();
    // other chat
    sock.emit({ messages: [{ key: { id: 'X', remoteJid: '628999@s.whatsapp.net', fromMe: false }, message: { conversation: 'bukan' }, messageTimestamp: nowSec() }] });
    // stale (10s before start)
    sock.emit({ messages: [{ key: { id: 'Y', remoteJid: META_AI_JID, fromMe: false }, message: { conversation: 'lama' }, messageTimestamp: nowSec() - 10 }] });
    // the real one
    sock.emit({ messages: [{ key: { id: 'R1', remoteJid: META_AI_JID, fromMe: false }, message: { conversation: 'benar' }, messageTimestamp: nowSec() }] });
    const res = await p;
    assert.equal(res.text, 'benar');
});

test('askMetaAI validates args and times out', async () => {
    const sock = makeFakeSock();
    await assert.rejects(askMetaAI(null, 'x'), /active Baileys socket/);
    await assert.rejects(askMetaAI(sock, ''), /non-empty string/);
    await assert.rejects(askMetaAI(sock, 'hi', { timeoutMs: 30 }), /timed out/);
});
