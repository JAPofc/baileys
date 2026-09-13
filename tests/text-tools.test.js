import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMentions, extractGroupInviteCode, joinGroupViaLink, sendBroadcast } from '../lib/Utils/text-tools.js';

describe('text-tools: parseMentions', () => {
    it('extracts full jids, de-duplicated, in order', () => {
        assert.deepEqual(
            parseMentions('hi @6281234567 and @6289876543 (and @6281234567 again)'),
            ['6281234567@s.whatsapp.net', '6289876543@s.whatsapp.net']
        );
    });
    it('ignores emails, short numbers and non-strings', () => {
        assert.deepEqual(parseMentions('mail me a@b.com or @123'), []);
        assert.deepEqual(parseMentions(''), []);
        assert.deepEqual(parseMentions(null), []);
        assert.deepEqual(parseMentions(42), []);
    });
    it('output plugs straight into sendMessage mentions', () => {
        const text = 'welcome @628111111111!';
        const mentions = parseMentions(text);
        assert.deepEqual(mentions, ['628111111111@s.whatsapp.net']);
    });
});

describe('text-tools: extractGroupInviteCode', () => {
    const CODE = 'AbCdEfGh12345678';
    for (const link of [
        `https://chat.whatsapp.com/${CODE}`,
        `http://chat.whatsapp.com/${CODE}`,
        `chat.whatsapp.com/${CODE}`,
        `https://chat.whatsapp.com/invite/${CODE}`,
        `join us! https://chat.whatsapp.com/${CODE} see you`,
        `https://chat.whatsapp.com/${CODE}?utm=x`,
        `https://chat.whatsapp.com/${CODE}/`,
    ]) {
        it(`parses ${link.slice(0, 48)}…`, () => {
            assert.equal(extractGroupInviteCode(link), CODE);
        });
    }
    it('returns null for non-invite text', () => {
        assert.equal(extractGroupInviteCode('https://example.com/x'), null);
        assert.equal(extractGroupInviteCode('no links here'), null);
        assert.equal(extractGroupInviteCode(''), null);
        assert.equal(extractGroupInviteCode(null), null);
    });
});

describe('text-tools: joinGroupViaLink', () => {
    it('extracts the code and calls groupAcceptInvite', async () => {
        let got = null;
        const sock = { groupAcceptInvite: async (code) => { got = code; return { gid: '1@g.us' }; } };
        const res = await joinGroupViaLink(sock, 'https://chat.whatsapp.com/AbCdEfGh12345678');
        assert.equal(got, 'AbCdEfGh12345678');
        assert.deepEqual(res, { gid: '1@g.us' });
    });
    it('accepts a bare code too, and throws on garbage', async () => {
        let got = null;
        const sock = { groupAcceptInvite: async (code) => { got = code; } };
        await joinGroupViaLink(sock, 'AbCdEfGh12345678');
        assert.equal(got, 'AbCdEfGh12345678');
        await assert.rejects(joinGroupViaLink(sock, 'definitely not a link'), /no invite code/);
    });
});

describe('text-tools: sendBroadcast', () => {
    const jids = ['1@s.whatsapp.net', '2@s.whatsapp.net', '3@s.whatsapp.net'];
    it('sends to every jid, reports outcomes, never throws mid-run', async () => {
        const sent = [];
        const sock = { sendMessage: async (jid) => {
            if (jid === '2@s.whatsapp.net') throw new Error('boom');
            sent.push(jid);
        } };
        const progress = [];
        const report = await sendBroadcast(sock, jids, { text: 'hi' }, {
            delayMs: 0,
            onProgress: (p) => progress.push(p),
        });
        assert.deepEqual(report.sent, ['1@s.whatsapp.net', '3@s.whatsapp.net']);
        assert.equal(report.failed.length, 1);
        assert.equal(report.failed[0].jid, '2@s.whatsapp.net');
        assert.equal(report.total, 3);
        assert.deepEqual(progress.map((p) => p.ok), [true, false, true]);
        assert.deepEqual(progress.map((p) => p.index), [0, 1, 2]);
    });
    it('paces sends with delayMs', async () => {
        const t0 = Date.now();
        const sock = { sendMessage: async () => {} };
        await sendBroadcast(sock, jids, { text: 'x' }, { delayMs: 30 });
        // 3 jids → 2 gaps → >= 60ms
        assert.ok(Date.now() - t0 >= 55, 'delayMs pacing applied between sends');
    });
    it('validates inputs and a broken onProgress cannot break the run', async () => {
        const sock = { sendMessage: async () => {} };
        await assert.rejects(sendBroadcast(sock, [], { text: 'x' }), /non-empty array/);
        await assert.rejects(sendBroadcast(sock, jids, null), /content/);
        const report = await sendBroadcast(sock, jids, { text: 'x' }, {
            delayMs: 0,
            onProgress: () => { throw new Error('progress bug'); },
        });
        assert.equal(report.sent.length, 3);
    });
});
