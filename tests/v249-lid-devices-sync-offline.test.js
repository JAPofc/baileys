// §2.100–§2.104 — LID device addressing/cache, session migration, VoIP port dispatcher,
// app-state sync actions, and the fork-parity wave-6 helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
	processSyncAction,
	makeOfflineNodeProcessor,
	hasInteractiveBinaryNode,
	shouldIncludeBizBinaryNode,
} from '../lib/index.js';
import { createPortDispatcher } from '../lib/VoIP/worker-listeners.js';
import { makeGetUSyncDevices, usyncReply } from './helpers/usync-devices.mjs';

const PN = '628111';
const LID = '99881';

// ---------------------------------------------------------------- §2.100
test('§2.100 a LID-addressed chat gets LID-addressed devices', async () => {
	const { getUSyncDevices } = makeGetUSyncDevices({ executeUSyncQuery: async () => usyncReply(PN, LID, 2) });
	const devices = await getUSyncDevices([`${LID}@lid`], true, false);
	assert.deepEqual(devices.map(d => d.jid), [`${LID}@lid`, `${LID}:1@lid`]);
});

test('§2.100 the device cache hits for LID chats instead of re-querying USync', async () => {
	const { getUSyncDevices, calls } = makeGetUSyncDevices({ executeUSyncQuery: async () => usyncReply(PN, LID, 2) });
	const first = await getUSyncDevices([`${LID}@lid`], true, false);
	const second = await getUSyncDevices([`${LID}@lid`], true, false);
	assert.equal(calls.usync, 1, 'the second send must not fire another USync IQ');
	assert.deepEqual(second.map(d => d.jid), first.map(d => d.jid));
});

test('§2.100 PN addressing is untouched, and useCache:false still refetches', async () => {
	const { getUSyncDevices, calls } = makeGetUSyncDevices({ executeUSyncQuery: async () => usyncReply(PN, LID, 2) });
	const pn = await getUSyncDevices([`${PN}@s.whatsapp.net`], true, false);
	assert.deepEqual(pn.map(d => d.jid), [`${PN}@s.whatsapp.net`, `${PN}:1@s.whatsapp.net`]);
	await getUSyncDevices([`${PN}@s.whatsapp.net`], false, false);
	assert.equal(calls.usync, 2);
});

test('§2.100 newly mapped LIDs get their sessions asserted once', async () => {
	const { getUSyncDevices, calls } = makeGetUSyncDevices({ executeUSyncQuery: async () => usyncReply(PN, LID, 1) });
	await getUSyncDevices([`${LID}@lid`], true, false);
	assert.equal(calls.assertSessions.length, 1);
	assert.deepEqual(calls.assertSessions[0], { jids: [`${LID}@lid`], force: true });
});

// ---------------------------------------------------------------- §2.101
const openSessionRecord = async () => {
	const libsignal = (await import('libsignal')).default;
	const kp = libsignal.curve.generateKeyPair();
	const b64 = n => Buffer.alloc(n, 7).toString('base64');
	return {
		version: 'v1',
		_sessions: {
			AAAA: {
				registrationId: 1,
				currentRatchet: {
					ephemeralKeyPair: { pubKey: kp.pubKey.toString('base64'), privKey: kp.privKey.toString('base64') },
					lastRemoteEphemeralKey: b64(33),
					previousCounter: 0,
					rootKey: b64(32),
				},
				indexInfo: { baseKey: b64(33), baseKeyType: 1, closed: -1, used: Date.now(), created: Date.now(), remoteIdentityKey: b64(33) },
				_chains: {},
			},
		},
	};
};

const makeRepo = async ({ deviceList }) => {
	const { makeLibSignalRepository } = await import('../lib/Signal/libsignal.js');
	const store = { session: { [`${PN}.0`]: await openSessionRecord() }, 'device-list': deviceList ? { [PN]: ['0'] } : {} };
	const keys = {
		get: async (type, ids) => Object.fromEntries(ids.map(id => [id, store[type]?.[id]])),
		set: async data => {
			for (const type of Object.keys(data)) {
				store[type] = store[type] || {};
				Object.assign(store[type], data[type]);
			}
		},
		transaction: async fn => fn(),
		isInTransaction: () => false,
	};
	const logger = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return logger; } };
	return { repo: makeLibSignalRepository({ creds: { me: { id: `${PN}@s.whatsapp.net` } }, keys }, logger), store };
};

test('§2.101 migrateSession works without a cached device list', async () => {
	const { repo, store } = await makeRepo({ deviceList: false });
	const res = await repo.migrateSession(`${PN}@s.whatsapp.net`, `${LID}@lid`);
	repo.close();
	assert.equal(res.migrated, 1);
	assert.equal(store.session[`${PN}.0`], null, 'the PN session is handed over, not duplicated');
	assert.ok(Object.keys(store.session).some(k => k.startsWith(LID)));
});

test('§2.101 the stored device list is not mutated in place, and non-PN input is still refused', async () => {
	const { repo, store } = await makeRepo({ deviceList: true });
	store['device-list'][PN] = ['0'];
	const before = store['device-list'][PN];
	await repo.migrateSession(`${PN}:3@s.whatsapp.net`, `${LID}@lid`);
	assert.deepEqual(before, ['0'], 'the live array from the auth state must not grow');
	assert.deepEqual(await repo.migrateSession(`${LID}@lid`, `${LID}@lid`), { migrated: 0, skipped: 0, total: 1 });
	assert.deepEqual(await repo.migrateSession(`${PN}@s.whatsapp.net`, `${PN}@s.whatsapp.net`), { migrated: 0, skipped: 0, total: 0 });
	repo.close();
});

// ---------------------------------------------------------------- §2.102
test('§2.102 many listeners share one port subscription', () => {
	const port = new EventEmitter();
	const dispatcher = createPortDispatcher(port);
	const seen = [];
	const offs = Array.from({ length: 20 }, (_, i) => dispatcher.add(() => seen.push(i)));
	assert.equal(port.listenerCount('message'), 1);
	assert.equal(dispatcher.size, 20);

	port.emit('message', { type: 'x' });
	assert.equal(seen.length, 20);

	offs.forEach(off => off());
	assert.equal(dispatcher.size, 0);
	assert.equal(port.listenerCount('message'), 0, 'the subscription is dropped once nobody listens');
});

test('§2.102 a throwing listener cannot stop the others', () => {
	const port = new EventEmitter();
	const errors = [];
	const dispatcher = createPortDispatcher(port, { onError: err => errors.push(err) });
	const delivered = [];
	dispatcher.add(() => {
		throw new Error('boom');
	});
	dispatcher.add(data => delivered.push(data));
	port.emit('message', { ok: true });
	assert.deepEqual(delivered, [{ ok: true }]);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].message, 'boom');
});

test('§2.102 remove/dispose are honest, and a missing port is tolerated', () => {
	const port = new EventEmitter();
	const dispatcher = createPortDispatcher(port);
	const fn = () => {};
	dispatcher.add(fn);
	assert.equal(dispatcher.remove(fn), true);
	assert.equal(dispatcher.remove(fn), false);

	dispatcher.add(() => {});
	dispatcher.dispose();
	assert.equal(dispatcher.size, 0);
	assert.equal(dispatcher.attached, false);
	dispatcher.add(() => {});
	assert.equal(dispatcher.size, 0, 'a disposed dispatcher accepts nothing more');

	const headless = createPortDispatcher(null);
	const got = [];
	headless.add(d => got.push(d));
	headless.dispatch('hi');
	assert.deepEqual(got, ['hi']);
	assert.throws(() => headless.add('nope'), /must be a function/);
});

// ---------------------------------------------------------------- §2.103
const collect = syncAction => {
	const events = [];
	processSyncAction(syncAction, { emit: (name, data) => events.push({ name, data }) }, { id: '1@s.whatsapp.net' }, undefined, {
		trace() {},
		debug() {},
	});
	return events;
};

test('§2.103 clearing a chat on the phone clears it here too', () => {
	const events = collect({ syncAction: { value: { clearChatAction: { messageRange: {} } } }, index: ['clearChat', '62@s.whatsapp.net', '1', '0'] });
	assert.deepEqual(events, [{ name: 'messages.delete', data: { jid: '62@s.whatsapp.net', all: true } }]);

	// also reachable by index type alone (no action payload)
	const byType = collect({ syncAction: { value: {} }, index: ['clearChat', '62@s.whatsapp.net', '1', '0'] });
	assert.equal(byType[0]?.name, 'messages.delete');
});

test('§2.103 actions without a dedicated event surface as app-state.action', () => {
	const [event, ...rest] = collect({
		syncAction: { value: { quickReplyAction: { shortcut: 'hi', message: 'Hello!' }, timestamp: 1700000000000 } },
		index: ['quickReply', 'hi'],
	});
	assert.equal(rest.length, 0);
	assert.equal(event.name, 'app-state.action');
	assert.equal(event.data.name, 'quickReplyAction');
	assert.equal(event.data.type, 'quickReply');
	assert.equal(event.data.id, 'hi');
	assert.deepEqual(event.data.action, { shortcut: 'hi', message: 'Hello!' });
	assert.equal(event.data.timestamp, 1700000000000);
	assert.deepEqual(event.data.index, ['quickReply', 'hi']);
});

test('§2.103 handled actions keep their own events, empty ones emit nothing', () => {
	assert.equal(collect({ syncAction: { value: { archiveChatAction: { archived: true } } }, index: ['archive', '62@s.whatsapp.net'] })[0].name, 'chats.update');
	assert.equal(collect({ syncAction: { value: { starAction: { starred: true } } }, index: ['star', '62@s.whatsapp.net', 'MSG', '1'] })[0].name, 'messages.update');
	assert.equal(collect({ syncAction: { value: {} }, index: ['somethingElse', 'x'] }).length, 0);
	assert.equal(collect({ syncAction: { value: { timestamp: 5 } }, index: ['somethingElse', 'x'] }).length, 0);
});

// ---------------------------------------------------------------- §2.104
test('§2.104 the offline backlog drains in order and yields between batches', async () => {
	const handled = [];
	let yields = 0;
	const map = new Map([['message', async node => void handled.push(node)]]);
	const processor = makeOfflineNodeProcessor(map, { yieldToEventLoop: async () => void yields++ }, 3);

	for (let i = 0; i < 7; i++) {
		processor.enqueue('message', i);
	}
	assert.ok(processor.draining);
	await processor.waitUntilIdle();

	assert.deepEqual(handled, [0, 1, 2, 3, 4, 5, 6]);
	assert.equal(yields, 2, '7 nodes in batches of 3 = 2 yields');
	assert.equal(processor.pending, 0);
});

test('§2.104 a throwing handler and an unknown type are reported, not fatal', async () => {
	const errors = [];
	const handled = [];
	const map = new Map([
		['bad', async () => {
			throw new Error('nope');
		}],
		['good', async node => void handled.push(node)],
	]);
	const processor = makeOfflineNodeProcessor(map, { onUnexpectedError: (err, ctx) => errors.push(ctx) });
	processor.enqueue('bad', 1);
	processor.enqueue('mystery', 2);
	processor.enqueue('good', 3);
	await processor.waitUntilIdle();

	assert.deepEqual(handled, [3]);
	assert.deepEqual(errors, ['processing offline bad', 'processing offline node']);
});

test('§2.104 draining stops when the socket closes, and clear() drops the rest', async () => {
	let open = true;
	const handled = [];
	const map = new Map([['message', async node => {
		handled.push(node);
		open = false;
	}]]);
	const processor = makeOfflineNodeProcessor(map, { isOpen: () => open });
	processor.enqueue('message', 'a');
	processor.enqueue('message', 'b');
	await processor.waitUntilIdle();
	assert.deepEqual(handled, ['a']);
	assert.equal(processor.pending, 1);
	assert.equal(processor.clear(), 1);
	assert.equal(processor.pending, 0);
	assert.throws(() => makeOfflineNodeProcessor({}), /must be a Map/);
});

test('§2.104 caller-supplied interactive nodes suppress our business node', () => {
	assert.equal(hasInteractiveBinaryNode([{ tag: 'biz', attrs: {} }]), true);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'hsm', attrs: {} }]), true);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'bot', attrs: { biz_bot: '1' } }]), true);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'bot', attrs: {} }]), false);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'x', content: [{ tag: 'interactive', attrs: {} }] }]), true);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'x', content: [{ tag: 'y', content: [{ tag: 'native_flow' }] }] }]), true);
	assert.equal(hasInteractiveBinaryNode([{ tag: 'plain' }]), false);
	assert.equal(hasInteractiveBinaryNode(undefined), false);
	assert.equal(hasInteractiveBinaryNode([null, 'nope']), false);
});

test('§2.104 a carousel with nativeFlow cards needs the business node', () => {
	assert.equal(shouldIncludeBizBinaryNode({ interactiveMessage: { carouselMessage: { cards: [{ nativeFlowMessage: { buttons: [] } }] } } }), true);
	assert.equal(shouldIncludeBizBinaryNode({ interactiveMessage: { carouselMessage: { cards: [{ body: { text: 'x' } }] } } }), false);
	assert.equal(shouldIncludeBizBinaryNode({ interactiveMessage: { nativeFlowMessage: {} } }), true);
	assert.equal(shouldIncludeBizBinaryNode({ conversation: 'hi' }), false);
});
