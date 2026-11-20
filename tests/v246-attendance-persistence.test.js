// Fix + upgrade: attendance advertises multi-day consecutive streaks but had no
// toJSON/load, so every restart reset streaks to 1 (feature non-functional for
// the daily-restart bots it targets). Persistence now round-trips streaks and
// any in-progress session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttendance } from '../lib/Utils/attendance.js';

const DAY = 86_400_000;

test('attendance fix: streaks survive a restart via toJSON/load', () => {
    let t = Date.UTC(2026, 0, 1, 8, 0, 0);
    const mk = () => createAttendance({ now: () => t });

    // Day 1
    let a = mk();
    a.open('g@g.us');
    a.checkIn('g@g.us', 'u@s');
    assert.equal(a.getStreak('g@g.us', 'u@s'), 1);
    const snap = JSON.parse(JSON.stringify(a.toJSON()));

    // Day 2 — restart: fresh instance restores from snapshot
    t += DAY;
    let b = mk();
    b.load(snap);
    b.open('g@g.us');
    b.checkIn('g@g.us', 'u@s');
    assert.equal(b.getStreak('g@g.us', 'u@s'), 2, 'streak continued across restart');

    // Day 3
    t += DAY;
    const snap2 = JSON.parse(JSON.stringify(b.toJSON()));
    let c = mk();
    c.load(snap2);
    c.open('g@g.us');
    c.checkIn('g@g.us', 'u@s');
    assert.equal(c.getStreak('g@g.us', 'u@s'), 3);
});

test('attendance persistence: an in-progress session round-trips', () => {
    let t = Date.UTC(2026, 5, 10, 7, 0, 0);
    const a = createAttendance({ now: () => t });
    a.open('g@g.us', { title: 'Absen Pagi', openedBy: 'admin@s' });
    a.checkIn('g@g.us', 'x@s');
    a.checkIn('g@g.us', 'y@s');

    const b = createAttendance({ now: () => t });
    b.load(JSON.parse(JSON.stringify(a.toJSON())));
    assert.equal(b.isOpen('g@g.us'), true);
    const att = b.getAttendees('g@g.us');
    assert.equal(att.length, 2);
    assert.deepEqual(att.map(x => x.user), ['x@s', 'y@s']);
    // a restored session still rejects a duplicate check-in
    assert.equal(b.checkIn('g@g.us', 'x@s'), null);
    // and accepts a new one at the next position
    assert.equal(b.checkIn('g@g.us', 'z@s'), 3);
});

test('attendance persistence: missing a day resets the streak after reload', () => {
    let t = Date.UTC(2026, 2, 1, 8, 0, 0);
    const a = createAttendance({ now: () => t });
    a.open('g@g.us');
    a.checkIn('g@g.us', 'u@s'); // streak 1
    const snap = JSON.parse(JSON.stringify(a.toJSON()));

    // skip TWO days → gap breaks the streak
    t += 2 * DAY;
    const b = createAttendance({ now: () => t });
    b.load(snap);
    b.open('g@g.us');
    b.checkIn('g@g.us', 'u@s');
    assert.equal(b.getStreak('g@g.us', 'u@s'), 1, 'broken streak restarts at 1');
});
