import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcaster, createScheduler } from '../lib/Framework/index.js';

const noSleep = () => Promise.resolve();

// ---------------------------------------------------------------------------
// Broadcaster
// ---------------------------------------------------------------------------

test('broadcast delivers to every recipient in order', async () => {
    const seen = [];
    const bc = createBroadcaster({ send: async (jid) => { seen.push(jid); return 'ok'; }, throttleMs: 0, sleep: noSleep });
    const summary = await bc.broadcast(['a@x', 'b@x', 'c@x'], { text: 'hi' }).done;
    assert.deepEqual(seen, ['a@x', 'b@x', 'c@x']);
    assert.equal(summary.total, 3);
    assert.equal(summary.sent, 3);
    assert.equal(summary.failed, 0);
});

test('broadcast dedupes recipients and drops empties', async () => {
    const seen = [];
    const bc = createBroadcaster({ send: async (jid) => { seen.push(jid); }, throttleMs: 0, sleep: noSleep });
    const summary = await bc.broadcast(['a@x', 'a@x', '', 'b@x', null], 'm').done;
    assert.deepEqual(seen, ['a@x', 'b@x']);
    assert.equal(summary.total, 2);
});

test('broadcast accepts a per-recipient message factory', async () => {
    const payloads = [];
    const bc = createBroadcaster({ send: async (_jid, msg) => { payloads.push(msg); }, throttleMs: 0, sleep: noSleep });
    await bc.broadcast(['a@x', 'b@x'], (jid, i) => ({ text: `${jid}#${i}` })).done;
    assert.deepEqual(payloads, [{ text: 'a@x#0' }, { text: 'b@x#1' }]);
});

test('broadcast retries a failing send and succeeds within maxRetries', async () => {
    let calls = 0;
    const bc = createBroadcaster({
        send: async () => { calls++; if (calls < 3) throw new Error('flaky'); return 'ok'; },
        throttleMs: 0, maxRetries: 2, retryDelayMs: 0, sleep: noSleep
    });
    const summary = await bc.broadcast(['a@x'], 'm').done;
    assert.equal(summary.sent, 1);
    assert.equal(summary.failed, 0);
    assert.equal(summary.results[0].attempts, 3);
});

test('broadcast marks a recipient failed after exhausting retries', async () => {
    const bc = createBroadcaster({
        send: async () => { throw new Error('down'); },
        throttleMs: 0, maxRetries: 1, retryDelayMs: 0, sleep: noSleep
    });
    const summary = await bc.broadcast(['a@x', 'b@x'], 'm').done;
    assert.equal(summary.sent, 0);
    assert.equal(summary.failed, 2);
    assert.equal(summary.results[0].ok, false);
    assert.equal(summary.results[0].attempts, 2); // first try + 1 retry
    assert.match(summary.results[0].error.message, /down/);
});

test('broadcast throttles between recipients but not after the last', async () => {
    let throttleWaits = 0;
    const bc = createBroadcaster({
        send: async () => {},
        throttleMs: 100,
        sleep: async (ms) => { if (ms === 100) throttleWaits++; }
    });
    await bc.broadcast(['a@x', 'b@x', 'c@x'], 'm').done;
    assert.equal(throttleWaits, 2, 'N recipients -> N-1 throttle gaps');
});

test('broadcast reports progress for each recipient', async () => {
    const events = [];
    const bc = createBroadcaster({
        send: async () => {}, throttleMs: 0, sleep: noSleep,
        onProgress: (p) => events.push(p)
    });
    await bc.broadcast(['a@x', 'b@x'], 'm').done;
    assert.equal(events.length, 2);
    assert.equal(events[0].remaining, 1);
    assert.equal(events[1].remaining, 0);
    assert.equal(events[1].sent, 2);
});

test('broadcast can be cancelled mid-run (remaining recipients skipped)', async () => {
    let sentCount = 0;
    let handle;
    const bc = createBroadcaster({
        throttleMs: 0, sleep: noSleep,
        send: async () => { sentCount++; if (sentCount === 1) handle.cancel(); }
    });
    handle = bc.broadcast(['a@x', 'b@x', 'c@x'], 'm');
    const summary = await handle.done;
    assert.equal(summary.cancelled, true);
    assert.equal(summary.sent, 1);
    assert.equal(summary.skipped, 2);
});

test('createBroadcaster validates its options', () => {
    assert.throws(() => createBroadcaster({}), /send/);
    assert.throws(() => createBroadcaster({ send: async () => {}, throttleMs: -1 }), /throttleMs/);
    assert.throws(() => createBroadcaster({ send: async () => {}, maxRetries: 1.5 }), /maxRetries/);
});

// ---------------------------------------------------------------------------
// Scheduler (with an injected fake timer + controllable clock)
// ---------------------------------------------------------------------------

function makeFakeTimers() {
    let clock = 0;
    let nextHandle = 1;
    const timers = new Map(); // handle -> { fireAt, fn }
    return {
        now: () => clock,
        setTimer: (fn, ms) => { const h = nextHandle++; timers.set(h, { fireAt: clock + ms, fn }); return h; },
        clearTimer: (h) => timers.delete(h),
        // advance clock and fire any due timers (re-armed timers may fire again)
        advance(ms) {
            clock += ms;
            let ran = true;
            while (ran) {
                ran = false;
                for (const [h, t] of [...timers.entries()]) {
                    if (t.fireAt <= clock) {
                        timers.delete(h);
                        ran = true;
                        t.fn();
                    }
                }
            }
        },
        pending: () => timers.size
    };
}

test('scheduleAfter fires the task once when its delay elapses', async () => {
    const ft = makeFakeTimers();
    let fired = 0;
    const sched = createScheduler({ now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer });
    sched.scheduleAfter(1000, () => { fired++; });
    assert.equal(fired, 0);
    ft.advance(999);
    assert.equal(fired, 0);
    ft.advance(1);
    assert.equal(fired, 1);
});

test('cancel prevents a pending job from firing', () => {
    const ft = makeFakeTimers();
    let fired = 0;
    const sched = createScheduler({ now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer });
    const id = sched.scheduleAfter(500, () => { fired++; });
    assert.equal(sched.size, 1);
    assert.equal(sched.cancel(id), true);
    assert.equal(sched.size, 0);
    ft.advance(1000);
    assert.equal(fired, 0);
    assert.equal(sched.cancel(id), false); // already gone
});

test('scheduler survives delays beyond the 32-bit timer ceiling (no overflow)', () => {
    const ft = makeFakeTimers();
    let fired = 0;
    const sched = createScheduler({ now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer });
    const MAX = 2 ** 31 - 1;
    sched.scheduleAfter(MAX + 5000, () => { fired++; });
    // A naive setTimeout would overflow and fire ~immediately — assert it does NOT.
    ft.advance(MAX);
    assert.equal(fired, 0, 'must not fire early despite exceeding timer ceiling');
    ft.advance(5000);
    assert.equal(fired, 1);
});

test('scheduler routes task errors to onError and keeps running', async () => {
    const ft = makeFakeTimers();
    const errors = [];
    const sched = createScheduler({
        now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer,
        onError: (err, job) => errors.push({ msg: err.message, id: job.id })
    });
    sched.scheduleAfter(10, () => { throw new Error('boom'); });
    ft.advance(10);
    await Promise.resolve(); // let the async fire() settle
    assert.equal(errors.length, 1);
    assert.match(errors[0].msg, /boom/);
});

test('list() reflects pending jobs and cancelAll clears them', () => {
    const ft = makeFakeTimers();
    const sched = createScheduler({ now: ft.now, setTimer: ft.setTimer, clearTimer: ft.clearTimer });
    sched.scheduleAfter(100, () => {});
    sched.scheduleAfter(200, () => {});
    assert.equal(sched.list().length, 2);
    assert.equal(sched.list()[0].status, 'pending');
    assert.equal(sched.cancelAll(), 2);
    assert.equal(sched.size, 0);
});

test('scheduleAt/scheduleAfter validate arguments', () => {
    const sched = createScheduler();
    assert.throws(() => sched.scheduleAt('not-a-date', () => {}), /runAt/);
    assert.throws(() => sched.scheduleAt(Date.now(), 'not-a-fn'), /task/);
    assert.throws(() => sched.scheduleAfter(Infinity, () => {}), /ms/);
});
