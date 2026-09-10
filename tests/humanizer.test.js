import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendHumanized } from '../lib/index.js';

const fakeSock = (log) => ({
    presenceSubscribe: async (j) => log.push(['sub', j]),
    sendPresenceUpdate: async (t, j) => log.push([t, j]),
    sendMessage: async (j, c) => { log.push(['send', j, c.text]); return { ok: 1 }; }
});
const FAST = { minDelayMs: 5, maxDelayMs: 10 };

describe('sendHumanized', () => {
    it('types, waits, sends, pauses', async () => {
        const log = [];
        await sendHumanized(fakeSock(log), '1@s.whatsapp.net', { text: 'halo apa kabar' }, FAST);
        const kinds = log.map((e) => e[0]);
        assert.deepEqual(kinds, ['sub', 'composing', 'send', 'paused']);
    });
    it('serializes sends per chat (queue)', async () => {
        const order = [];
        const sock = {
            sendMessage: async (j, c) => { await new Promise((r) => setTimeout(r, 15)); order.push(c.text); }
        };
        await Promise.all([
            sendHumanized(sock, '1@s.whatsapp.net', { text: 'a' }, { ...FAST, typing: false }),
            sendHumanized(sock, '1@s.whatsapp.net', { text: 'b' }, { ...FAST, typing: false })
        ]);
        assert.deepEqual(order, ['a', 'b']);
    });
    it('survives missing presence fns', async () => {
        const sock = { sendMessage: async () => ({ ok: 1 }) };
        await sendHumanized(sock, '1@s.whatsapp.net', { text: 'x' }, FAST);
    });
    it('requires a socket', async () => {
        await assert.rejects(sendHumanized(null, '1@s.whatsapp.net', { text: 'x' }, FAST), /active Baileys socket/);
    });
});
