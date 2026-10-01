// v2.4.6 — group sender-key rotation on membership change
// (WhiskeySockets/Baileys #2704 / #2730). When a member leaves/is removed or
// switches phones, the bot must invalidate its stored `sender-key-memory` so the
// next send rotates + re-distributes the group sender key. Otherwise a departed
// member keeps decrypting future messages (forward-secrecy break) and a switched
// device never receives the key ("Waiting for this message").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGroupSenderKeyReset } from '../lib/Utils/index.js';

test('remove and leave trigger a reset (forward secrecy)', () => {
    assert.deepEqual(resolveGroupSenderKeyReset('remove'), { reset: true, reason: 'participant-left' });
    assert.deepEqual(resolveGroupSenderKeyReset('leave'), { reset: true, reason: 'participant-left' });
});

test('modify (phone/number switch) triggers a reset for re-distribution (#2704)', () => {
    assert.deepEqual(resolveGroupSenderKeyReset('modify'), { reset: true, reason: 'participant-number-changed' });
});

test('add/promote/demote do NOT reset (new device gets the key via the normal path)', () => {
    for (const tag of ['add', 'promote', 'demote']) {
        assert.deepEqual(resolveGroupSenderKeyReset(tag), { reset: false, reason: null }, `${tag} should not reset`);
    }
});

test('unrelated group actions do not reset', () => {
    for (const tag of ['subject', 'description', 'announcement', 'create', 'ephemeral', undefined]) {
        assert.equal(resolveGroupSenderKeyReset(tag).reset, false, `${tag} should not reset`);
    }
});

// Simulate the messages-recv wiring: on a reset action we write
// { 'sender-key-memory': { [group]: null } } so the next send rotates the key.
test('wiring simulation: a remove clears sender-key-memory for the group only', async () => {
    const writes = [];
    const keys = { set: async (data) => { writes.push(data); } };
    const groupJid = '12345-67890@g.us';

    const simulate = async (tag) => {
        const { reset } = resolveGroupSenderKeyReset(tag);
        if (reset) {
            await keys.set({ 'sender-key-memory': { [groupJid]: null } });
        }
    };

    await simulate('add');    // no write
    await simulate('remove'); // write
    await simulate('subject'); // no write

    assert.equal(writes.length, 1, 'only the remove produced a write');
    assert.deepEqual(writes[0], { 'sender-key-memory': { [groupJid]: null } });
});
