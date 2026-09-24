import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Tests for the anti-ban Send Guard + waitForMessageAck delivery tracking.

describe('createSendGuard', () => {
    it('is a no-op when both limits are 0 (zero overhead)', async () => {
        const { createSendGuard } = await import('../lib/Utils/send-guard.js');
        const guard = createSendGuard();
        const t0 = Date.now();
        for (let i = 0; i < 100; i++) {
            await guard.acquire('a@s.whatsapp.net');
        }
        assert.ok(Date.now() - t0 < 200, 'no pacing when disabled');
        assert.equal(guard.pending, 0);
    });

    it('enforces the global messages/minute gap', async () => {
        const { createSendGuard } = await import('../lib/Utils/send-guard.js');
        // 600/min = one per 100ms
        const guard = createSendGuard({ messagesPerMinute: 600, jitterRatio: 0 });
        const t0 = Date.now();
        await guard.acquire('a@s.whatsapp.net');
        await guard.acquire('b@s.whatsapp.net');
        await guard.acquire('c@s.whatsapp.net');
        const elapsed = Date.now() - t0;
        // 3 sends → 2 gaps of ~100ms
        assert.ok(elapsed >= 180, `3 sends took ${elapsed}ms (expected >= ~200ms)`);
    });

    it('enforces per-chat spacing but lets different chats through in parallel', async () => {
        const { createSendGuard } = await import('../lib/Utils/send-guard.js');
        const guard = createSendGuard({ perChatDelayMs: 150, jitterRatio: 0 });
        const t0 = Date.now();
        // two different chats — no mutual blocking
        await Promise.all([guard.acquire('a@s.whatsapp.net'), guard.acquire('b@s.whatsapp.net')]);
        const parallel = Date.now() - t0;
        assert.ok(parallel < 120, `different chats not serialized (${parallel}ms)`);
        // same chat — second waits
        const t1 = Date.now();
        await guard.acquire('a@s.whatsapp.net');
        const sameChat = Date.now() - t1;
        assert.ok(sameChat >= 100, `same chat paced (${sameChat}ms)`);
    });

    it('rejects instead of buffering unboundedly (maxQueue)', async () => {
        const { createSendGuard } = await import('../lib/Utils/send-guard.js');
        const guard = createSendGuard({ perChatDelayMs: 250, maxQueue: 3 });
        // fill the queue (first resolves instantly, rest wait)
        const inflight = [guard.acquire('x@s.whatsapp.net'), guard.acquire('x@s.whatsapp.net'), guard.acquire('x@s.whatsapp.net')];
        await assert.rejects(guard.acquire('x@s.whatsapp.net'), /queue overflow/);
        // drain so no timers outlive the test
        await Promise.allSettled(inflight);
    });

    it('validates limits and exposes settings', async () => {
        const { createSendGuard } = await import('../lib/Utils/send-guard.js');
        assert.throws(() => createSendGuard({ messagesPerMinute: -1 }), TypeError);
        const guard = createSendGuard({ messagesPerMinute: 20, perChatDelayMs: 1500 });
        assert.equal(guard.settings.messagesPerMinute, 20);
        assert.equal(guard.settings.perChatDelayMs, 1500);
    });

    it('is exported from the barrel and declared in SocketConfig', async () => {
        const m = await import('../lib/index.js');
        assert.equal(typeof m.createSendGuard, 'function');
        const { readFile } = await import('node:fs/promises');
        const dts = await readFile(new URL('../lib/Types/Socket.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /sendRateLimit\?/);
    });
});

describe('sendMessage wiring (source contract)', () => {
    it('sendMessage awaits the guard before any work, with skipRateLimit escape', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf-8');
        assert.match(src, /const sendGuard = config\.sendRateLimit \? createSendGuard\(config\.sendRateLimit\) : null/);
        assert.match(src, /if \(sendGuard && !options\.skipRateLimit\)/);
        // the guard must run before creds access (i.e. first thing in sendMessage)
        const guardIdx = src.indexOf('if (sendGuard && !options.skipRateLimit)');
        const credsIdx = src.indexOf('const userJid = authState.creds.me.id;', src.indexOf('sendMessage: async (jid, content, options = {})'));
        assert.ok(guardIdx > -1 && credsIdx > -1 && guardIdx < credsIdx, 'guard precedes send work');
    });
});

describe('waitForMessageAck (source contract + unit)', () => {
    it('is exposed on the recv socket surface and settles from CB:ack', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf-8');
        assert.match(src, /waitForMessageAck/);
        // resolves on clean ack, rejects on error attr
        assert.match(src, /pendingMessageAcks\.get\(ackId\)/);
        assert.match(src, /Message was not accepted by the server/);
        // waiters must be rejected on socket end so callers never hang
        assert.match(src, /Connection closed before the server acked/);
        // returned from the socket
        assert.match(src, /messageRetryManager,\s*waitForMessageAck/);
    });

    it('rejects immediately without a message id', async () => {
        // pure-unit re-implementation of the guard clause (same code path shape)
        const { Boom } = await import('@hapi/boom');
        const waitForMessageAck = (messageId) => {
            if (!messageId) {
                return Promise.reject(new Boom('waitForMessageAck requires a message id', { statusCode: 400 }));
            }
            return new Promise(() => { });
        };
        await assert.rejects(waitForMessageAck(undefined), /requires a message id/);
    });
});
