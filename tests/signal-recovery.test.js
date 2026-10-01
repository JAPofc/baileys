import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import { MessageRetryManager, RetryReason } from '../lib/Utils/message-retry-manager.js';
import { DECRYPTION_RETRY_CONFIG } from '../lib/Utils/decode-wa-message.js';

// Signal session recovery suite. Locks in:
//   - MAC errors (codes 4/7) force IMMEDIATE session recreation (this was
//     dead code until the retry receipt error code got wired through)
//   - session-recreation throttling (once/hour) for non-MAC errors
//   - retry budgets and success/failure bookkeeping
//   - base-key collision detection (same base key on retry 3+ = stuck session)
//   - session-record error classification used by the decrypt path

const silent = pino({ level: 'silent' });
const mk = () => new MessageRetryManager(silent, 5);

describe('signal recovery: session recreation policy', () => {
    it('no session → always recreate', () => {
        const m = mk();
        const r = m.shouldRecreateSession('a@s.whatsapp.net', false);
        assert.equal(r.recreate, true);
        assert.match(r.reason, /don't have a Signal session/);
    });

    it('MAC errors recreate immediately even with a fresh session', () => {
        const m = mk();
        // first recreation "just happened" → normally throttled for an hour
        m.shouldRecreateSession('a@s.whatsapp.net', false);
        // non-MAC within the hour: throttled
        const throttled = m.shouldRecreateSession('a@s.whatsapp.net', true);
        assert.equal(throttled.recreate, false, 'non-MAC within an hour is throttled');
        // Bad MAC (7): must override the throttle
        const badMac = m.shouldRecreateSession('a@s.whatsapp.net', true, RetryReason.SignalErrorBadMac);
        assert.equal(badMac.recreate, true, 'Bad MAC forces immediate recreation');
        // InvalidMessage (4): same
        const invalidMsg = m.shouldRecreateSession('a@s.whatsapp.net', true, RetryReason.SignalErrorInvalidMessage);
        assert.equal(invalidMsg.recreate, true);
    });

    it('parseRetryErrorCode: valid codes, garbage, and absence', () => {
        const m = mk();
        assert.equal(m.parseRetryErrorCode('7'), RetryReason.SignalErrorBadMac);
        assert.equal(m.parseRetryErrorCode('4'), RetryReason.SignalErrorInvalidMessage);
        assert.equal(m.parseRetryErrorCode(''), undefined);
        assert.equal(m.parseRetryErrorCode(undefined), undefined);
        assert.equal(m.parseRetryErrorCode('banana'), undefined);
        assert.equal(m.parseRetryErrorCode('999'), RetryReason.UnknownError, 'out-of-range maps to UnknownError');
    });

    it('isMacError only matches codes 4 and 7', () => {
        const m = mk();
        assert.equal(m.isMacError(RetryReason.SignalErrorBadMac), true);
        assert.equal(m.isMacError(RetryReason.SignalErrorInvalidMessage), true);
        assert.equal(m.isMacError(RetryReason.SignalErrorNoSession), false);
        assert.equal(m.isMacError(undefined), false);
    });
});

describe('signal recovery: retry budgets & bookkeeping', () => {
    it('increments per message and enforces the max', () => {
        const m = mk();
        for (let i = 1; i <= 5; i += 1) {
            assert.equal(m.incrementRetryCount('MSG'), i);
        }
        assert.equal(m.hasExceededMaxRetries('MSG'), true);
        assert.equal(m.hasExceededMaxRetries('OTHER'), false);
    });

    it('markRetrySuccess clears counters and pending phone requests', async () => {
        const m = mk();
        m.incrementRetryCount('MSG');
        let fired = false;
        m.schedulePhoneRequest('MSG', () => { fired = true; }, 5);
        m.markRetrySuccess('MSG');
        assert.equal(m.getRetryCount('MSG'), 0);
        await new Promise((r) => setTimeout(r, 25));
        assert.equal(fired, false, 'pending phone request cancelled on success');
        assert.equal(m.statistics.successfulRetries, 1);
    });

    it('recent-message cache stores and retrieves for resend', () => {
        const m = mk();
        m.addRecentMessage('a@s.whatsapp.net', 'ID1', { conversation: 'x' });
        assert.deepEqual(m.getRecentMessage('a@s.whatsapp.net', 'ID1').message, { conversation: 'x' });
        m.markRetrySuccess('ID1');
        assert.equal(m.getRecentMessage('a@s.whatsapp.net', 'ID1'), undefined, 'cleared after success');
    });
});

describe('signal recovery: base-key collision (stuck session detection)', () => {
    it('same base key across retries is detected, different is not', () => {
        const m = mk();
        const addr = '628@s.whatsapp.net.0';
        const key = Buffer.from([1, 2, 3, 4]);
        m.saveBaseKey(addr, 'MSG', key);
        assert.equal(m.hasSameBaseKey(addr, 'MSG', Buffer.from([1, 2, 3, 4])), true,
            'identical base key on retry 3+ = session never actually rebuilt');
        assert.equal(m.hasSameBaseKey(addr, 'MSG', Buffer.from([9, 9, 9, 9])), false);
        assert.equal(m.hasSameBaseKey(addr, 'MSG', Buffer.from([1, 2, 3])), false, 'length mismatch');
        m.deleteBaseKey(addr, 'MSG');
        assert.equal(m.hasSameBaseKey(addr, 'MSG', key), false, 'deleted');
    });
});

describe('signal recovery: decrypt error classification', () => {
    it('session-record errors carry the patterns the decrypt path matches on', () => {
        // decode-wa-message flags these to distinguish "no session" (recoverable
        // via retry+prekey fetch) from hard crypto failures
        for (const pattern of DECRYPTION_RETRY_CONFIG.sessionRecordErrors) {
            assert.ok(
                'SessionError: No session record for 628@s.whatsapp.net'.includes(pattern) ||
                pattern.includes('No session record'),
                `pattern still matches libsignal message shape: ${pattern}`
            );
        }
        assert.ok(DECRYPTION_RETRY_CONFIG.maxRetries >= 1);
    });
});

describe('signal recovery: simultaneous encryption (keyed mutex)', () => {
    // messages-send.js wraps signalRepository.encryptMessage in a per-jid
    // keyed mutex — two sends to the SAME device must serialize (Signal
    // ratchets corrupt under concurrent advance), different devices parallel.
    it('same jid serializes, different jids run parallel, errors do not poison', async () => {
        const { makeKeyedMutex } = await import('../lib/Utils/make-mutex.js');
        const m = makeKeyedMutex();
        const log = [];
        const job = (key, id, ms) => m.mutex(key, async () => {
            log.push(`${id}:start`);
            await new Promise((r) => setTimeout(r, ms));
            log.push(`${id}:end`);
        });
        await Promise.all([job('dev1', 'A1', 30), job('dev1', 'A2', 5), job('dev2', 'B1', 10)]);
        assert.ok(log.indexOf('A2:start') > log.indexOf('A1:end'), 'same-device encrypts serialized');
        assert.ok(log.indexOf('B1:end') < log.indexOf('A1:end'), 'other device not blocked');
        // an encryption error must not deadlock later sends to that device
        await assert.rejects(m.mutex('dev1', async () => { throw new Error('boom'); }));
        let ran = false;
        await m.mutex('dev1', async () => { ran = true; });
        assert.equal(ran, true, 'mutex chain survives a failed encryption');
    });
});

describe('signal recovery: clear() resets everything', () => {
    it('wipes counters, caches and pending requests', async () => {
        const m = mk();
        m.incrementRetryCount('A');
        m.addRecentMessage('x@s.whatsapp.net', 'A', {});
        let fired = false;
        m.schedulePhoneRequest('A', () => { fired = true; }, 5);
        m.clear();
        assert.equal(m.getRetryCount('A'), 0);
        assert.equal(m.getRecentMessage('x@s.whatsapp.net', 'A'), undefined);
        assert.equal(m.statistics.totalRetries, 0);
        await new Promise((r) => setTimeout(r, 25));
        assert.equal(fired, false);
    });
});
