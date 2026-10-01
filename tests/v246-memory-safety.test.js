// v2.4.6 memory-safety regression locks.
//
// Audit outcome for the upstream mutex/event-buffer memory leaks
// (WhiskeySockets/Baileys #2137, #2151, #2160): our fork is NOT affected —
// `makeMutex` uses the `async-mutex` library, `makeKeyedMutex` reclaims each key
// once its lock count hits zero, and the event buffer replaces its data object on
// every flush and bounds its history cache. These tests LOCK that behaviour so it
// can't silently regress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMutex, makeKeyedMutex } from '../lib/Utils/make-mutex.js';

const tick = () => new Promise(r => setImmediate(r));

test('makeKeyedMutex reclaims a key after its lock releases (no unbounded growth)', async () => {
    const km = makeKeyedMutex();
    assert.equal(km.size, 0);
    await km.mutex('A', async () => { assert.equal(km.size, 1); });
    assert.equal(km.size, 0, 'entry deleted once the lock released');
});

test('makeKeyedMutex reclaims ALL keys after many distinct keys are used', async () => {
    const km = makeKeyedMutex();
    await Promise.all(
        Array.from({ length: 500 }, (_, i) => km.mutex(`key-${i}`, async () => i))
    );
    assert.equal(km.size, 0, 'no leaked entries after 500 distinct keys');
});

test('makeKeyedMutex serializes tasks for the same key and still cleans up', async () => {
    const km = makeKeyedMutex();
    const order = [];
    let running = 0;
    const task = (label) => km.mutex('shared', async () => {
        running++;
        assert.equal(running, 1, 'only one task runs at a time for a key');
        order.push(label);
        await tick();
        running--;
    });
    await Promise.all([task('a'), task('b'), task('c')]);
    assert.deepEqual(order, ['a', 'b', 'c'], 'FIFO execution');
    assert.equal(km.size, 0, 'shared key reclaimed after contention resolved');
});

test('makeKeyedMutex reclaims a key even if the task throws', async () => {
    const km = makeKeyedMutex();
    await assert.rejects(km.mutex('boom', async () => { throw new Error('x'); }));
    assert.equal(km.size, 0, 'entry reclaimed in the finally block on error');
});

test('makeMutex provides real mutual exclusion (no interleaving)', async () => {
    const m = makeMutex();
    let concurrent = 0;
    let maxConcurrent = 0;
    const job = () => m.mutex(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await tick();
        concurrent--;
    });
    await Promise.all([job(), job(), job(), job()]);
    assert.equal(maxConcurrent, 1, 'critical section never runs concurrently');
});
