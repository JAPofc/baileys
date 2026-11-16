// Regression: MessageScheduler.processQueue() is driven by setInterval, which
// fires again without awaiting the previous run. When a send is slower than the
// checkInterval, overlapping runs used to re-scan the queue and see the same due
// item still 'pending' — sending ONE scheduled message multiple times. The
// re-entrancy guard + in-flight status must collapse that back to a single send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageScheduler } from '../lib/Utils/scheduling.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('scheduling: a slow send is not delivered more than once (overlap guard)', async () => {
    let sends = 0;
    const sched = createMessageScheduler(async () => {
        sends++;
        await wait(120); // slower than checkInterval → runs would overlap
        return { key: { id: 'm' + sends } };
    }, { checkInterval: 20 });

    sched.scheduleDelay('jid@s.whatsapp.net', { text: 'hi' }, 30);
    await wait(320); // several interval ticks pass while the one send is in flight
    sched.stop();

    assert.equal(sends, 1, `expected exactly one send, got ${sends}`);
});

test('scheduling: processing flag resets so later messages still send', async () => {
    const delivered = [];
    const sched = createMessageScheduler(async (jid, content) => {
        await wait(30);
        delivered.push(content.text);
        return { key: { id: content.text } };
    }, { checkInterval: 20 });

    sched.scheduleDelay('jid@s.whatsapp.net', { text: 'a' }, 25);
    await wait(150);
    sched.scheduleDelay('jid@s.whatsapp.net', { text: 'b' }, 25);
    await wait(150);
    sched.stop();

    assert.deepEqual(delivered, ['a', 'b']);
});
