// Utils bug-fix batch (R31):
//  - bug 72: level-system dropped the per-user XP cooldown (`lastXpAt`) on
//    save/reload, re-opening XP farming after a restart.
//  - bug 73: compactNumber printed '1000K'/'1000M' when rounding carried a value
//    up to the next unit, instead of promoting to '1M'/'1B'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLevelSystem } from '../lib/Utils/level-system.js';
import { compactNumber } from '../lib/Utils/number-format.js';

const upsert = (user, chat = 'g@g.us') => ({
    messages: [{ key: { remoteJid: chat, participant: user }, message: { conversation: 'hi' } }],
    type: 'notify'
});

test('level-system: XP cooldown (lastXpAt) survives a save + reload', () => {
    const U = 'u@s.whatsapp.net';
    const mk = () => createLevelSystem({ xpPerMessage: [10, 10], cooldownMs: 30_000 });

    const a = mk();
    a.handler(upsert(U));                 // earns 10 XP, stamps lastXpAt = now
    assert.equal(a.getUser(U).xp, 10);

    const snap = a.toJSON();
    // the cooldown timestamp must be present in the snapshot
    const savedEntry = snap.entries.find(([u]) => u === U)[1];
    assert.ok(savedEntry.lastXpAt > 0, 'lastXpAt must be persisted');

    const b = mk();
    b.load(snap);
    b.handler(upsert(U));                 // same user, immediately → still in cooldown
    assert.equal(b.getUser(U).xp, 10, 'reload must NOT grant XP again during the cooldown');
    assert.equal(b.getUser(U).messages, 2, 'the message is still counted');
});

test('level-system: reload preserves xp/messages/prestige too (no regression)', () => {
    const U = 'v@s.whatsapp.net';
    const a = createLevelSystem({ xpPerMessage: [10, 10] });
    a.addXp(U, 500);
    const before = a.getUser(U);
    const b = createLevelSystem({ xpPerMessage: [10, 10] });
    b.load(a.toJSON());
    const after = b.getUser(U);
    assert.equal(after.xp, before.xp);
    assert.equal(after.level, before.level);
});

test('compactNumber: rounding carry promotes to the next unit', () => {
    assert.equal(compactNumber(999_999), '1M');       // was '1000K'
    assert.equal(compactNumber(999_999_999), '1B');   // was '1000M'
    assert.equal(compactNumber(1_049_999), '1M');
});

test('compactNumber: values that already worked are unchanged', () => {
    assert.equal(compactNumber(1000), '1K');
    assert.equal(compactNumber(1234), '1.2K');
    assert.equal(compactNumber(2000), '2K');
    assert.equal(compactNumber(9999), '10K');
    assert.equal(compactNumber(950_000), '950K');
    assert.equal(compactNumber(999_499), '999.5K');
    assert.equal(compactNumber(1_050_000), '1.1M');
    assert.equal(compactNumber(-1500), '-1.5K');
    assert.equal(compactNumber(1_500_000_000_000), '1.5T');
    assert.equal(compactNumber(500), '500');
});
