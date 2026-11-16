// Fix: check()'s retryInMs only freed ONE slot, so for count > 1 (or an
//   over-full history) it under-reported the wait and a caller that waited
//   exactly that long was still blocked.
// Upgrade: toJSON/load persist the rate-limit history across restarts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroupOpGuard } from '../lib/Utils/group-op-guard.js';

test('group-op-guard fix: retryInMs accounts for all slots a multi-count op needs', () => {
    let t = 0;
    const g = createGroupOpGuard({ now: () => t, limits: { add: { max: 3, windowMs: 1000 } } });
    t = 0; g.record('add');
    t = 100; g.record('add');
    t = 200; g.record('add');

    t = 200;
    const v = g.check('add', 2); // needs 2 of the 3 to expire
    assert.equal(v.allowed, false);
    assert.equal(v.retryInMs, 900); // second-oldest (100) + window(1000) - now(200)

    // waiting exactly retryInMs is now actually enough
    t = 200 + v.retryInMs;
    assert.equal(g.check('add', 2).allowed, true);
});

test('group-op-guard fix: count=1 at max is unchanged (no regression)', () => {
    let t = 0;
    const g = createGroupOpGuard({ now: () => t, limits: { add: { max: 3, windowMs: 1000 } } });
    t = 0; g.record('add');
    t = 100; g.record('add');
    t = 200; g.record('add');

    t = 200;
    const v = g.check('add', 1);
    assert.equal(v.allowed, false);
    assert.equal(v.retryInMs, 800); // oldest (0) + window - now
    t = 200 + v.retryInMs;
    assert.equal(g.check('add', 1).allowed, true);
});

test('group-op-guard upgrade: history persists across a restart', () => {
    let t = 0;
    const g = createGroupOpGuard({ now: () => t, limits: { add: { max: 3, windowMs: 1000 } } });
    t = 0; g.record('add');
    t = 100; g.record('add');
    t = 200; g.record('add');

    const snap = JSON.parse(JSON.stringify(g.toJSON()));

    // fresh instance (a restart) at t=300 restores the history
    t = 300;
    const g2 = createGroupOpGuard({ now: () => t, limits: { add: { max: 3, windowMs: 1000 } } });
    g2.load(snap);
    assert.equal(g2.getUsage().add.used, 3, 'restored 3 recent adds');
    assert.equal(g2.check('add', 1).allowed, false, 'still rate-limited right after restart');

    // once the window fully passes, the restored entries prune out
    t = 1300;
    assert.equal(g2.check('add', 1).allowed, true);
    assert.equal(g2.getUsage().add.used, 0);
});
