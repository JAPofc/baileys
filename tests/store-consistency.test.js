import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { makeInMemoryStore } from '../lib/Store/make-in-memory-store.js';

// Regression tests for the store-consistency fixes. Each case was a REAL
// reproduced bug: different event handlers resolved the message bucket with
// different jids (raw vs alt vs normalized), so receipts/reactions/deletes
// could never find messages stored under device- or LID-alt keys.

const silent = pino({ level: 'silent' });
const NORM = '628111@s.whatsapp.net';
// device-suffixed jid + PN alt — exactly what multi-device delivery produces
const DEVICE_KEY = {
    remoteJid: '628111:5@s.whatsapp.net',
    remoteJidAlt: '628111@s.whatsapp.net',
    id: 'MSG1',
    fromMe: false,
};

const setup = () => {
    const store = makeInMemoryStore({ logger: silent });
    const ev = new EventEmitter();
    store.bind(ev);
    return { store, ev };
};

const seed = (store, ev, key = DEVICE_KEY) => {
    ev.emit('messages.upsert', {
        type: 'notify',
        messages: [{ key, message: { conversation: 'hello' }, messageTimestamp: 1 }],
    });
    assert.ok(store.messages[NORM]?.get(key.id), 'seed message stored under the normalized jid');
};

describe('store consistency: one canonical message bucket', () => {
    it('upsert from a device jid lands in the normalized bucket only', () => {
        const { store, ev } = setup();
        seed(store, ev);
        assert.deepEqual(Object.keys(store.messages), [NORM], 'no duplicate device-jid bucket');
    });

    it('receipt update finds a message stored via device jid', () => {
        const { store, ev } = setup();
        seed(store, ev);
        ev.emit('message-receipt.update', [{
            key: { remoteJid: '628111:5@s.whatsapp.net', id: 'MSG1' },
            receipt: { userJid: '999@s.whatsapp.net', readTimestamp: 42 },
        }]);
        const msg = store.messages[NORM].get('MSG1');
        assert.ok(msg.userReceipt?.length >= 1, 'receipt applied (was silently lost pre-fix)');
    });

    it('reaction finds a message stored via device jid', () => {
        const { store, ev } = setup();
        seed(store, ev);
        ev.emit('messages.reaction', [{
            key: { remoteJid: '628111:5@s.whatsapp.net', id: 'MSG1' },
            reaction: { text: '🔥', key: { remoteJid: NORM, id: 'R1' } },
        }]);
        const msg = store.messages[NORM].get('MSG1');
        assert.ok(msg.reactions?.length >= 1, 'reaction applied (was silently lost pre-fix)');
    });

    it('delete removes a message addressed by device jid', () => {
        const { store, ev } = setup();
        seed(store, ev);
        ev.emit('messages.delete', { keys: [{ remoteJid: '628111:5@s.whatsapp.net', id: 'MSG1' }] });
        assert.equal(store.messages[NORM].get('MSG1'), undefined, 'deleted (survived pre-fix)');
    });

    it('status update via the same mixed key still lands', () => {
        const { store, ev } = setup();
        seed(store, ev);
        ev.emit('messages.update', [{ key: DEVICE_KEY, update: { status: 4 } }]);
        assert.equal(store.messages[NORM].get('MSG1').status, 4);
    });

    it('history sync (prepend) also normalizes the bucket', () => {
        const { store, ev } = setup();
        ev.emit('messaging-history.set', {
            chats: [], contacts: [], isLatest: false, syncType: undefined,
            messages: [{ key: DEVICE_KEY, message: { conversation: 'old' }, messageTimestamp: 1 }],
        });
        assert.ok(store.messages[NORM]?.get('MSG1'), 'history message in normalized bucket');
    });
});

describe('store consistency: contacts.update batch', () => {
    it('one unknown contact no longer drops the rest of the batch', async () => {
        const { store, ev } = setup();
        ev.emit('contacts.upsert', [{ id: 'b@s.whatsapp.net', name: 'B-old' }]);
        ev.emit('contacts.update', [
            { id: 'unknown@s.whatsapp.net', name: 'X' }, // unknown: must be skipped, not abort
            { id: 'b@s.whatsapp.net', name: 'B-new' },
        ]);
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(store.contacts['b@s.whatsapp.net'].name, 'B-new',
            'second update applied (whole batch was dropped pre-fix)');
    });

    it('update fields actually merge into the stored contact', async () => {
        const { store, ev } = setup();
        ev.emit('contacts.upsert', [{ id: 'c@s.whatsapp.net', name: 'old', notify: 'oldnotify' }]);
        ev.emit('contacts.update', [{ id: 'c@s.whatsapp.net', name: 'renamed' }]);
        await new Promise((r) => setTimeout(r, 30));
        const c = store.contacts['c@s.whatsapp.net'];
        assert.equal(c.name, 'renamed', 'incoming field merged (self-assign no-op pre-fix)');
        assert.equal(c.notify, 'oldnotify', 'untouched fields preserved');
    });
});

describe('store consistency: bind & groups', () => {
    it('double bind() on the same emitter never duplicates listeners', () => {
        const { store, ev } = setup();
        store.bind(ev); // the classic re-bind-after-reconnect mistake
        assert.equal(ev.listenerCount('messages.upsert'), 1, 'no duplicate listeners');
        seed(store, ev);
        assert.equal(store.messages[NORM].array.length, 1, 'message stored exactly once');
    });

    it('groups.upsert now seeds groupMetadata so groups.update works', () => {
        const { store, ev } = setup();
        ev.emit('groups.upsert', [{ id: '123@g.us', subject: 'Grup A', participants: [] }]);
        assert.equal(store.groupMetadata['123@g.us'].subject, 'Grup A');
        ev.emit('groups.update', [{ id: '123@g.us', subject: 'Grup A (baru)' }]);
        assert.equal(store.groupMetadata['123@g.us'].subject, 'Grup A (baru)',
            'update applied to seeded metadata (hit non-existant pre-fix)');
    });
});
