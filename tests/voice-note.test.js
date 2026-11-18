import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVoiceNoteContent, sendVoiceNote } from '../lib/index.js';

const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(100)]);

describe('buildVoiceNoteContent', () => {
    it('passes OGG through with ptt flag', async () => {
        const c = await buildVoiceNoteContent(OGG);
        assert.equal(c.ptt, true);
        assert.equal(c.audio, OGG);
        assert.ok(String(c.mimetype).includes('opus'));
    });
    it('skips conversion when asked', async () => {
        const mp3 = Buffer.from('ID3garbage');
        const c = await buildVoiceNoteContent(mp3, { convert: false });
        assert.equal(c.audio, mp3);
    });
    it('rejects bad input / missing file', async () => {
        await assert.rejects(buildVoiceNoteContent(123), /Buffer|path|url/);
        await assert.rejects(buildVoiceNoteContent('/nope/missing.mp3'), /cannot read/);
    });
});

describe('sendVoiceNote', () => {
    it('delegates to sock.sendMessage', async () => {
        const sent = [];
        const sock = { sendMessage: async (j, c) => { sent.push([j, c]); return { ok: 1 }; } };
        await sendVoiceNote(sock, '1@s.whatsapp.net', OGG);
        assert.equal(sent[0][1].ptt, true);
    });
    it('requires a socket', async () => {
        await assert.rejects(sendVoiceNote(null, '1@s.whatsapp.net', OGG), /active Baileys socket/);
    });
});
