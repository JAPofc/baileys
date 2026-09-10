import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatusScheduler, ChannelScheduler } from '../lib/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('StatusScheduler', () => {
    it('fires once via StatusHelper.send', async () => {
        const sent = [];
        const sock = { sendMessage: async (j, c, o) => { sent.push([j, c, o]); return { ok: 1 }; } };
        const q = new StatusScheduler(sock);
        const id = q.scheduleIn({ text: 'pagi!' }, 20);
        assert.ok(id.startsWith('post_'));
        assert.equal(q.pending().length, 1);
        await sleep(80);
        assert.equal(sent.length, 1);
        assert.equal(q.pending().length, 0);
    });
    it('cancel prevents firing', async () => {
        let n = 0;
        const sock = { sendMessage: async () => { n++; } };
        const q = new StatusScheduler(sock);
        const id = q.scheduleIn({ text: 'x' }, 30);
        assert.equal(q.cancel(id), true);
        assert.equal(q.cancel(id), false);
        await sleep(70);
        assert.equal(n, 0);
    });
    it('repeats then stops at maxRepeats', async () => {
        let n = 0;
        const sock = { sendMessage: async () => { n++; } };
        const q = new StatusScheduler(sock);
        q.scheduleIn({ text: 'x' }, 10, { repeatMs: 20, maxRepeats: 2 });
        await sleep(120);
        assert.equal(n, 2);
        assert.equal(q.pending().length, 0);
    });
    it('validates input', () => {
        assert.throws(() => new StatusScheduler(null), /active Baileys socket/);
        const q = new StatusScheduler({ sendMessage: async () => { } });
        assert.throws(() => q.schedule({ text: 'x' }, 'kapan'), /Date or epoch/);
    });
});

describe('ChannelScheduler', () => {
    it('posts to the channel', async () => {
        const sent = [];
        const sock = { sendMessage: async (j, c) => { sent.push([j, c]); return { ok: 1 }; } };
        const q = new ChannelScheduler(sock);
        q.scheduleIn('1@newsletter', { text: 'update' }, 20);
        await sleep(80);
        assert.deepEqual(sent, [['1@newsletter', { text: 'update' }]]);
    });
    it('rejects non-channel JIDs', () => {
        const q = new ChannelScheduler({ sendMessage: async () => { } });
        assert.throws(() => q.schedule('1@g.us', { text: 'x' }, Date.now()), /@newsletter/);
    });
});
