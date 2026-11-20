// Tests for the v2.4.6 retry-with-backoff helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBackoffDelay, retryWithBackoff } from '../lib/Utils/retry.js';

const noSleep = () => Promise.resolve();

test('computeBackoffDelay: exponential growth', () => {
    const opts = { baseDelayMs: 100, factor: 2 };
    assert.equal(computeBackoffDelay(1, opts), 100);
    assert.equal(computeBackoffDelay(2, opts), 200);
    assert.equal(computeBackoffDelay(3, opts), 400);
    assert.equal(computeBackoffDelay(4, opts), 800);
});

test('computeBackoffDelay: caps at maxDelayMs', () => {
    assert.equal(computeBackoffDelay(10, { baseDelayMs: 100, factor: 2, maxDelayMs: 1000 }), 1000);
});

test('computeBackoffDelay: full jitter samples [0, delay]', () => {
    assert.equal(computeBackoffDelay(3, { baseDelayMs: 100, factor: 2, jitter: true, random: () => 0 }), 0);
    // random()=0.999 → ~399 (below the 400 ceiling)
    const d = computeBackoffDelay(3, { baseDelayMs: 100, factor: 2, jitter: true, random: () => 0.999 });
    assert.ok(d >= 0 && d < 400, `got ${d}`);
});

test('computeBackoffDelay: floors attempt to >= 1', () => {
    assert.equal(computeBackoffDelay(0, { baseDelayMs: 50 }), 50);
    assert.equal(computeBackoffDelay(-5, { baseDelayMs: 50 }), 50);
});

test('retryWithBackoff: returns first success without retrying', async () => {
    let calls = 0;
    const result = await retryWithBackoff(() => { calls++; return 'ok'; }, { sleep: noSleep });
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
});

test('retryWithBackoff: retries then succeeds', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async (attempt) => {
        calls++;
        if (attempt < 3) throw new Error('transient');
        return `done@${attempt}`;
    }, { attempts: 5, sleep: noSleep });
    assert.equal(result, 'done@3');
    assert.equal(calls, 3);
});

test('retryWithBackoff: throws the last error after exhausting attempts', async () => {
    let calls = 0;
    await assert.rejects(
        retryWithBackoff(() => { calls++; throw new Error(`fail-${calls}`); }, { attempts: 3, sleep: noSleep }),
        /fail-3/
    );
    assert.equal(calls, 3);
});

test('retryWithBackoff: stops early when shouldRetry returns false', async () => {
    let calls = 0;
    await assert.rejects(
        retryWithBackoff(() => { calls++; const e = new Error('fatal'); e.fatal = true; throw e; }, {
            attempts: 5,
            sleep: noSleep,
            shouldRetry: (err) => !err.fatal
        }),
        /fatal/
    );
    assert.equal(calls, 1);
});

test('retryWithBackoff: passes the 1-based attempt number to fn', async () => {
    const seen = [];
    await retryWithBackoff((attempt) => {
        seen.push(attempt);
        if (attempt < 3) throw new Error('x');
        return true;
    }, { attempts: 3, sleep: noSleep });
    assert.deepEqual(seen, [1, 2, 3]);
});

test('retryWithBackoff: onRetry fires per retry with delay info', async () => {
    const events = [];
    await retryWithBackoff((attempt) => {
        if (attempt < 3) throw new Error('x');
        return true;
    }, {
        attempts: 3,
        baseDelayMs: 100,
        factor: 2,
        sleep: noSleep,
        onRetry: (info) => events.push(info)
    });
    assert.equal(events.length, 2); // fired before attempt 2 and 3
    assert.deepEqual(events.map((e) => e.attempt), [1, 2]);
    assert.deepEqual(events.map((e) => e.delayMs), [100, 200]);
});

test('retryWithBackoff: actually awaits the injected sleep between tries', async () => {
    const slept = [];
    await retryWithBackoff((attempt) => {
        if (attempt < 3) throw new Error('x');
        return true;
    }, { attempts: 3, baseDelayMs: 10, factor: 3, sleep: (ms) => { slept.push(ms); return Promise.resolve(); } });
    assert.deepEqual(slept, [10, 30]);
});

test('retryWithBackoff: rejects a non-function fn', async () => {
    await assert.rejects(retryWithBackoff(42), /must be a function/);
});

// ── AbortSignal support (v2.4.6 R-batch upgrade) ─────────────────────────────
test('retryWithBackoff: an already-aborted signal rejects before the first attempt', async () => {
    let calls = 0;
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
        retryWithBackoff(() => { calls++; return 'ok'; }, { signal: ac.signal, sleep: noSleep }),
        (e) => e?.name === 'AbortError'
    );
    assert.equal(calls, 0); // fn never ran
});

test('retryWithBackoff: aborting during a backoff wait interrupts immediately', async () => {
    let calls = 0;
    const ac = new AbortController();
    // sleep that never resolves on its own — only the abort can end the wait
    const hangingSleep = () => new Promise(() => {});
    const p = retryWithBackoff(() => { calls++; throw new Error('boom'); }, {
        attempts: 5,
        signal: ac.signal,
        sleep: hangingSleep
    });
    // let the first attempt run + enter the backoff wait, then abort
    await Promise.resolve();
    ac.abort();
    await assert.rejects(p, (e) => e?.name === 'AbortError');
    assert.equal(calls, 1); // only the first attempt ran; the wait was cut short
});

test('retryWithBackoff: abort rejects with the signal reason when provided', async () => {
    const ac = new AbortController();
    const reason = new Error('custom-cancel');
    ac.abort(reason);
    await assert.rejects(
        retryWithBackoff(() => 'ok', { signal: ac.signal, sleep: noSleep }),
        (e) => e === reason
    );
});

test('retryWithBackoff: a signal that never aborts is a no-op (still succeeds)', async () => {
    const ac = new AbortController();
    const out = await retryWithBackoff((attempt) => {
        if (attempt < 2) throw new Error('x');
        return 'done';
    }, { attempts: 3, sleep: noSleep, signal: ac.signal });
    assert.equal(out, 'done');
});
