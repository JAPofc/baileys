import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pairing E.164 validation upgrade + race-free sendMessageAcked.

describe('normalizePairingPhone', () => {
    it('accepts full international numbers and normalizes formatting noise', async () => {
        const { normalizePairingPhone } = await import('../lib/index.js');
        assert.equal(normalizePairingPhone('628123456789'), '628123456789');
        assert.equal(normalizePairingPhone('+62 812-3456-789'), '628123456789');
        assert.equal(normalizePairingPhone('(1) 555 010 9999'), '15550109999');
        assert.equal(normalizePairingPhone(628123456789), '628123456789'); // number input
    });

    it('strips a leading international call prefix (00)', async () => {
        const { normalizePairingPhone } = await import('../lib/index.js');
        assert.equal(normalizePairingPhone('0062812345678'), '62812345678');
        assert.equal(normalizePairingPhone('+00 62 812 345 678'), '62812345678');
    });

    it('rejects local-format numbers with a leading 0 (the classic silent failure)', async () => {
        const { normalizePairingPhone } = await import('../lib/index.js');
        assert.throws(() => normalizePairingPhone('08123456789'), /LOCAL number/);
        assert.throws(() => normalizePairingPhone('0812 3456 789'), /628123456789/); // error suggests the fix
    });

    it('rejects junk, too-short and over-15-digit input', async () => {
        const { normalizePairingPhone } = await import('../lib/index.js');
        assert.throws(() => normalizePairingPhone(''), /full international number/);
        assert.throws(() => normalizePairingPhone('abc'), /full international number/);
        assert.throws(() => normalizePairingPhone('12345'), /full international number/);
        assert.throws(() => normalizePairingPhone('62812345678901234'), /at most 15/);
        // exactly 15 digits is legal E.164
        assert.equal(normalizePairingPhone('123456789012345'), '123456789012345');
    });

    it('is wired into requestPairingCode (source contract)', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/socket.js', import.meta.url), 'utf-8');
        assert.match(src, /cleanPhone = normalizePairingPhone\(phoneNumber\)/);
        // validation failures surface as Boom 400, matching the old behavior
        assert.match(src, /throw new Boom\(err\.message, \{ statusCode: 400 \}\)/);
    });
});

describe('sendMessageAcked', () => {
    it('registers the ack waiter BEFORE the send goes out (race-free)', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf-8');
        const fnStart = src.indexOf('const sendMessageAcked = async (jid, content, options = {})');
        assert.ok(fnStart > -1, 'sendMessageAcked defined');
        const body = src.slice(fnStart, fnStart + 2000);
        const waiterIdx = body.indexOf('waitForMessageAck(messageId, ackTimeoutMs)');
        const sendIdx = body.indexOf('sock.sendMessage(jid, content, sendOptions)');
        assert.ok(waiterIdx > -1 && sendIdx > -1 && waiterIdx < sendIdx, 'waiter registered before sendMessage');
        // the pre-registered promise must be guarded against unhandled rejection
        assert.match(body, /ackPromise\.catch\(\(\) => \{ \}\)/);
        // a failed send cancels the pending waiter instead of leaking it
        assert.match(body, /pendingMessageAcks\.delete\(messageId\)/);
        assert.match(body, /clearTimeout\(waiter\.timer\)/);
    });

    it('mints its own message id so the waiter can target it', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf-8');
        assert.match(src, /sendOptions\.messageId \|\| generateMessageIDV2\(authState\?\.creds\?\.me\?\.id\)/);
        assert.match(src, /sendOptions\.messageId = messageId/);
    });

    it('is exposed on the socket surface and typed', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf-8');
        assert.match(src, /waitForMessageAck,\s*sendMessageAcked/);
        const dts = await readFile(new URL('../lib/Socket/messages-recv.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /sendMessageAcked: \(jid: string, content: any, options\?: \{/);
        assert.match(dts, /ackTimeoutMs\?: number;/);
    });

    it('cancel-on-failure pattern works (unit replica)', async () => {
        // replicate the exact waiter/cancel structure with a failing send
        const pending = new Map();
        const waitForAck = (id, ms) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, ms);
            timer.unref?.();
            pending.set(id, { resolve, reject, timer });
        });
        const sendAcked = async () => {
            const id = 'MSG1';
            const ackPromise = waitForAck(id, 60_000);
            ackPromise.catch(() => { });
            try {
                throw new Error('send failed');
            } catch (err) {
                const waiter = pending.get(id);
                if (waiter) { clearTimeout(waiter.timer); pending.delete(id); waiter.reject(err); }
                throw err;
            }
        };
        await assert.rejects(sendAcked(), /send failed/);
        assert.equal(pending.size, 0, 'no leaked waiter after a failed send');
    });
});
