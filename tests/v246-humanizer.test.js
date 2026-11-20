// Tests for sendHumanized (humanizer) — typing presence, per-chat queue
// serialization, and failure isolation. Uses tiny delays + a mock socket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendHumanized } from '../lib/Utils/humanizer.js';

const fast = { minDelayMs: 1, maxDelayMs: 1, jitter: 0 };

const mockSock = () => {
    const calls = [];
    return {
        calls,
        sendMessage: async (jid, content) => { calls.push(['send', jid, content?.text]); return { ok: true, text: content?.text }; },
        sendPresenceUpdate: async (state, jid) => { calls.push(['presence', state, jid]); },
        presenceSubscribe: async (jid) => { calls.push(['subscribe', jid]); }
    };
};

test('sends the message and returns the socket result', async () => {
    const s = mockSock();
    const r = await sendHumanized(s, 'a@s', { text: 'hi' }, fast);
    assert.equal(r.ok, true);
    assert.ok(s.calls.some((c) => c[0] === 'send' && c[2] === 'hi'));
});

test('shows composing before and paused after (paused last)', async () => {
    const s = mockSock();
    await sendHumanized(s, 'a@s', { text: 'hi' }, fast);
    assert.ok(s.calls.some((c) => c[0] === 'presence' && c[1] === 'composing'));
    const last = s.calls[s.calls.length - 1];
    assert.deepEqual([last[0], last[1]], ['presence', 'paused']);
});

test('typing:false suppresses all presence updates', async () => {
    const s = mockSock();
    await sendHumanized(s, 'a@s', { text: 'x' }, { ...fast, typing: false });
    assert.ok(!s.calls.some((c) => c[0] === 'presence'));
});

test('per-chat queue serializes sends in call order (even if a later one is faster)', async () => {
    const s = mockSock();
    const order = [];
    const p1 = sendHumanized(s, 'a@s', { text: 'first' }, { minDelayMs: 5, maxDelayMs: 5, jitter: 0 }).then(() => order.push('first'));
    const p2 = sendHumanized(s, 'a@s', { text: 'second' }, fast).then(() => order.push('second'));
    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['first', 'second']);
});

test('an invalid socket rejects with a 400 Boom', async () => {
    await assert.rejects(() => sendHumanized(null, 'a@s', { text: 'x' }), (e) => e?.output?.statusCode === 400);
    await assert.rejects(() => sendHumanized({}, 'a@s', { text: 'x' }), (e) => e?.output?.statusCode === 400);
});

test('presence failures never break the send', async () => {
    const s = {
        sendMessage: async (jid, content) => ({ sent: content.text }),
        sendPresenceUpdate: async () => { throw new Error('presence fail'); }
    };
    const r = await sendHumanized(s, 'a@s', { text: 'ok' }, fast);
    assert.equal(r.sent, 'ok');
});
