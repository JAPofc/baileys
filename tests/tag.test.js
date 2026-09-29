import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTagContent, tagAll, hideTag } from '../lib/index.js';

const PARTS = [{ id: '1@s.whatsapp.net' }, { id: '2@s.whatsapp.net' }, '3@s.whatsapp.net'];
const fakeSock = (sent) => ({
    groupMetadata: async () => ({ participants: PARTS }),
    sendMessage: async (jid, content) => { sent.push([jid, content]); return { ok: true }; }
});

describe('buildTagContent', () => {
    it('lists visible @tags', () => {
        const c = buildTagContent(PARTS, 'Hello');
        assert.equal(c.mentions.length, 3);
        assert.ok(c.text.includes('@1') && c.text.includes('@3'));
    });
    it('hide mode keeps text clean', () => {
        const c = buildTagContent(PARTS, 'Info', { hide: true });
        assert.equal(c.text, 'Info');
        assert.equal(c.mentions.length, 3);
    });
    it('throws on empty participants', () => {
        assert.throws(() => buildTagContent([], 'x'), /participants/);
    });
});

describe('tagAll / hideTag', () => {
    it('tagAll sends mentions', async () => {
        const sent = [];
        await tagAll(fakeSock(sent), '1@g.us', 'Meeting!');
        assert.equal(sent[0][0], '1@g.us');
        assert.equal(sent[0][1].mentions.length, 3);
    });
    it('hideTag sends no visible tags', async () => {
        const sent = [];
        await hideTag(fakeSock(sent), '1@g.us', 'Info');
        assert.equal(sent[0][1].text, 'Info');
        assert.equal(sent[0][1].mentions.length, 3);
    });
    it('rejects non-groups', async () => {
        await assert.rejects(tagAll(fakeSock([]), '1@s.whatsapp.net', 'x'), /@g\.us/);
    });
});
