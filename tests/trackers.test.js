import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Reaction / receipt / presence trackers — pure state machines over socket
// events, proven with the exact event shapes the socket emits.

const GROUP = '123@g.us';
const target = { remoteJid: GROUP, id: 'MSG1' };
const react = (participant, text, extra = {}) => ({
    key: target,
    reaction: { text, key: { remoteJid: GROUP, participant }, ...extra }
});

describe('createReactionTracker', () => {
    it('tracks add, replace and removal per user', async () => {
        const { createReactionTracker } = await import('../lib/index.js');
        const rt = createReactionTracker();
        rt.handler([react('a@s.whatsapp.net', '👍', { senderTimestampMs: 111 })]);
        rt.handler([react('b@s.whatsapp.net', '❤️')]);
        // same user reacts again -> replaces, never duplicates
        rt.handler([react('a@s.whatsapp.net', '🔥')]);
        assert.deepEqual(rt.getSummary(target), { '🔥': ['a@s.whatsapp.net'], '❤️': ['b@s.whatsapp.net'] });
        // empty text = removal (exactly as WA sends it)
        rt.handler([react('b@s.whatsapp.net', '')]);
        assert.deepEqual(rt.getSummary(target), { '🔥': ['a@s.whatsapp.net'] });
        assert.equal(rt.getReactions(target).length, 1);
        assert.equal(typeof rt.getReactions(target)[0].at, 'number', 'timestamp recorded');
    });

    it('emits onReaction for adds and removals, flags removals', async () => {
        const { createReactionTracker } = await import('../lib/index.js');
        const rt = createReactionTracker();
        const seen = [];
        const off = rt.onReaction((i) => seen.push(i));
        rt.handler([react('a@s.whatsapp.net', '👍')]);
        rt.handler([react('a@s.whatsapp.net', '')]);
        assert.equal(seen.length, 2);
        assert.equal(seen[0].removed, false);
        assert.equal(seen[1].removed, true);
        off();
        rt.handler([react('a@s.whatsapp.net', '👍')]);
        assert.equal(seen.length, 2, 'unsubscribed');
    });

    it('caps stored messages and ignores junk', async () => {
        const { createReactionTracker } = await import('../lib/index.js');
        const rt = createReactionTracker({ maxMessages: 3 });
        for (let i = 0; i < 5; i++) {
            rt.handler([{ key: { remoteJid: GROUP, id: `M${i}` }, reaction: { text: '👍', key: { participant: 'a@s.whatsapp.net' } } }]);
        }
        assert.equal(rt.size, 3, 'oldest evicted');
        rt.handler([{ key: {}, reaction: { text: 'x' } }]); // no id -> ignored
        rt.handler(undefined); // no events -> ignored
        assert.equal(rt.size, 3);
    });
});

describe('createReceiptTracker', () => {
    it('group receipts: per-participant delivered/read, read implies delivered', async () => {
        const { createReceiptTracker } = await import('../lib/index.js');
        const rc = createReceiptTracker();
        const key = { remoteJid: GROUP, id: 'G1' };
        rc.receiptHandler([{ key, receipt: { userJid: 'a@s.whatsapp.net', receiptTimestamp: 100 } }]);
        rc.receiptHandler([{ key, receipt: { userJid: 'b@s.whatsapp.net', readTimestamp: 200 } }]);
        const r = rc.getReceipts(key);
        assert.deepEqual(r.delivered.sort(), ['a@s.whatsapp.net', 'b@s.whatsapp.net']);
        assert.deepEqual(r.read, ['b@s.whatsapp.net']);
        assert.equal(rc.isReadBy(key, 'b@s.whatsapp.net'), true);
        assert.equal(rc.isReadBy(key, 'a@s.whatsapp.net'), false);
        assert.equal(rc.isReadBy(key), true);
    });

    it('DM status path: DELIVERY_ACK -> delivered, READ -> read, PLAYED -> played', async () => {
        const { createReceiptTracker } = await import('../lib/index.js');
        const rc = createReceiptTracker();
        const dm = { remoteJid: 'c@s.whatsapp.net', id: 'D1' };
        rc.statusHandler([{ key: dm, update: { status: 3 } }]); // DELIVERY_ACK
        assert.deepEqual(rc.getReceipts(dm), { delivered: ['c@s.whatsapp.net'], read: [], played: [] });
        rc.statusHandler([{ key: dm, update: { status: 4 } }]); // READ
        assert.deepEqual(rc.getReceipts(dm).read, ['c@s.whatsapp.net']);
        rc.statusHandler([{ key: dm, update: { status: 5 } }]); // PLAYED
        assert.deepEqual(rc.getReceipts(dm).played, ['c@s.whatsapp.net']);
    });

    it('onRead fires exactly once per user per message', async () => {
        const { createReceiptTracker } = await import('../lib/index.js');
        const rc = createReceiptTracker();
        const key = { remoteJid: GROUP, id: 'G2' };
        const reads = [];
        rc.onRead((i) => reads.push(i.user));
        rc.receiptHandler([{ key, receipt: { userJid: 'a@s.whatsapp.net', readTimestamp: 1 } }]);
        rc.receiptHandler([{ key, receipt: { userJid: 'a@s.whatsapp.net', readTimestamp: 2 } }]); // repeat
        rc.receiptHandler([{ key, receipt: { userJid: 'a@s.whatsapp.net', playedTimestamp: 3 } }]); // played after read
        assert.deepEqual(reads, ['a@s.whatsapp.net']);
    });
});

describe('createPresenceTracker', () => {
    const upd = (user, lastKnownPresence, lastSeen) => ({ id: user, presences: { [user]: { lastKnownPresence, ...(lastSeen ? { lastSeen } : {}) } } });

    it('tracks online/typing/lastSeen and only emits real changes', async () => {
        const { createPresenceTracker } = await import('../lib/index.js');
        const pt = createPresenceTracker();
        const changes = [];
        pt.onChange((i) => changes.push(i.presence));
        const U = 'x@s.whatsapp.net';
        pt.handler(upd(U, 'available'));
        pt.handler(upd(U, 'available')); // repeat — must not emit
        assert.equal(pt.isOnline(U), true);
        pt.handler(upd(U, 'composing'));
        assert.equal(pt.isTyping(U), true);
        assert.equal(pt.isOnline(U), true, 'typing counts as online');
        pt.handler(upd(U, 'unavailable', 999));
        assert.equal(pt.isOnline(U), false);
        assert.equal(pt.get(U).lastSeen, 999);
        assert.deepEqual(changes, ['available', 'composing', 'unavailable']);
    });

    it('getOnlineUsers lists only currently-online jids; cap evicts oldest', async () => {
        const { createPresenceTracker } = await import('../lib/index.js');
        const pt = createPresenceTracker({ maxUsers: 2 });
        pt.handler(upd('a@s.whatsapp.net', 'available'));
        pt.handler(upd('b@s.whatsapp.net', 'unavailable'));
        assert.deepEqual(pt.getOnlineUsers(), ['a@s.whatsapp.net']);
        pt.handler(upd('c@s.whatsapp.net', 'available'));
        assert.equal(pt.size, 2, 'oldest evicted at cap');
    });

    it('lastSeen survives updates that do not carry one', async () => {
        const { createPresenceTracker } = await import('../lib/index.js');
        const pt = createPresenceTracker();
        const U = 'x@s.whatsapp.net';
        pt.handler(upd(U, 'unavailable', 123));
        pt.handler(upd(U, 'available')); // no lastSeen here
        assert.equal(pt.get(U).lastSeen, 123, 'kept from the earlier update');
    });
});

describe('bind() wiring + exports', () => {
    it('bind attaches to the right events and unsubscribes cleanly', async () => {
        const { createReactionTracker, createReceiptTracker, createPresenceTracker } = await import('../lib/index.js');
        const bound = new Map();
        const fakeSock = {
            ev: {
                on: (evt, fn) => bound.set(evt, fn),
                off: (evt) => bound.delete(evt)
            }
        };
        const offs = [
            createReactionTracker().bind(fakeSock),
            createReceiptTracker().bind(fakeSock),
            createPresenceTracker().bind(fakeSock)
        ];
        assert.deepEqual(Array.from(bound.keys()).sort(), ['message-receipt.update', 'messages.reaction', 'messages.update', 'presence.update']);
        offs.forEach((off) => off());
        assert.equal(bound.size, 0, 'all handlers detached');
    });

    it('is exported from the barrel with types', async () => {
        const m = await import('../lib/index.js');
        for (const fn of ['createReactionTracker', 'createReceiptTracker', 'createPresenceTracker']) {
            assert.equal(typeof m[fn], 'function', fn);
        }
        const { readFile } = await import('node:fs/promises');
        const dts = await readFile(new URL('../lib/Utils/trackers.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /export function createReactionTracker/);
        assert.match(dts, /export function createReceiptTracker/);
        assert.match(dts, /export function createPresenceTracker/);
    });
});
