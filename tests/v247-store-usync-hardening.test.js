/**
 * tests/v247-store-usync-hardening.test.js — batch U (v2.4.7)
 *
 * Covers BUGREPORT §2.53–§2.56: the store's delete/update handlers that disagreed with
 * their own bucket key, the entity repository that could not read its own snapshot, and
 * the USync device parse that lost an entire batch to one user's error node.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import P from 'pino';

import { makeInMemoryStore, ObjectRepository } from '../lib/Store/index.js';
import { USyncQuery } from '../lib/WAUSync/index.js';
import { USyncDeviceProtocol } from '../lib/WAUSync/Protocols/index.js';

const logger = P({ level: 'silent' });

/** Minimal stand-in for the socket's event emitter. */
const makeEv = () => {
	const handlers = {};
	return {
		on: (event, fn) => { (handlers[event] ||= []).push(fn); },
		emit: (event, data) => { (handlers[event] || []).forEach((fn) => fn(data)); }
	};
};
const boundStore = () => {
	const store = makeInMemoryStore({ logger });
	const ev = makeEv();
	store.bind(ev);
	return { store, ev };
};
const incoming = (id, remoteJid, extra = {}) => ({ key: { id, remoteJid, ...extra }, messageTimestamp: 1 });

describe('§2.53 messages.delete uses the canonical bucket jid', () => {
	it('clears a chat addressed by a device jid (it used to clear nothing)', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.upsert', { type: 'notify', messages: [incoming('M1', '628111:5@s.whatsapp.net')] });
		assert.deepEqual(Object.keys(store.messages), ['628111@s.whatsapp.net'], 'stored under the normalized jid');
		ev.emit('messages.delete', { jid: '628111:5@s.whatsapp.net', all: true });
		assert.equal(store.messages['628111@s.whatsapp.net'].array.length, 0);
	});

	it('still clears a chat addressed by its plain jid', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.upsert', { type: 'notify', messages: [incoming('M1', '628111@s.whatsapp.net')] });
		ev.emit('messages.delete', { jid: '628111@s.whatsapp.net', all: true });
		assert.equal(store.messages['628111@s.whatsapp.net'].array.length, 0);
	});

	it('an unknown chat is a no-op, not a crash', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.delete', { jid: 'nobody@s.whatsapp.net', all: true });
		assert.deepEqual(Object.keys(store.messages), [], 'and it does not create the bucket either');
	});

	it('a key batch spanning several chats deletes from all of them', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.upsert', { type: 'notify', messages: [
			incoming('A1', '628111@s.whatsapp.net'),
			incoming('A2', '628111@s.whatsapp.net'),
			incoming('B1', '628222@s.whatsapp.net')
		] });
		ev.emit('messages.delete', { keys: [
			{ id: 'A1', remoteJid: '628111@s.whatsapp.net' },
			{ id: 'B1', remoteJid: '628222@s.whatsapp.net' }
		] });
		assert.deepEqual(store.messages['628111@s.whatsapp.net'].array.map((m) => m.key.id), ['A2']);
		assert.deepEqual(store.messages['628222@s.whatsapp.net'].array.map((m) => m.key.id), [], 'the second chat is no longer skipped');
	});
});

describe('§2.54 messages.update no longer fabricates empty buckets', () => {
	it('an update for an unknown message leaves the store untouched', () => {
		const { store, ev } = boundStore();
		for (let i = 0; i < 5; i++) {
			ev.emit('messages.update', [{ key: { id: `X${i}`, remoteJid: `spam${i}@s.whatsapp.net` }, update: { status: 3 } }]);
		}
		assert.equal(Object.keys(store.messages).length, 0, 'five remote-triggered updates used to leave five empty buckets');
	});

	it('an update for a stored message still applies', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.upsert', { type: 'notify', messages: [incoming('M1', '628111@s.whatsapp.net')] });
		ev.emit('messages.update', [{ key: { id: 'M1', remoteJid: '628111@s.whatsapp.net' }, update: { status: 3 } }]);
		assert.equal(store.messages['628111@s.whatsapp.net'].get('M1').status, 3);
	});

	it('the newer-status guard survives the rewrite', () => {
		const { store, ev } = boundStore();
		ev.emit('messages.upsert', { type: 'notify', messages: [incoming('M1', '628111@s.whatsapp.net')] });
		ev.emit('messages.update', [{ key: { id: 'M1', remoteJid: '628111@s.whatsapp.net' }, update: { status: 4 } }]);
		ev.emit('messages.update', [{ key: { id: 'M1', remoteJid: '628111@s.whatsapp.net' }, update: { status: 2 } }]);
		assert.equal(store.messages['628111@s.whatsapp.net'].get('M1').status, 4, 'an older status must not overwrite a newer one');
	});
});

describe('§2.55 ObjectRepository survives its own toJSON()', () => {
	it('round-trips through JSON (ids used to become array indices)', () => {
		const repo = new ObjectRepository({ L1: { id: 'L1', name: 'Work' }, L2: { id: 'L2', name: 'Family' } });
		const restored = new ObjectRepository(JSON.parse(JSON.stringify(repo)));
		assert.deepEqual([...restored.entityMap.keys()], ['L1', 'L2']);
		assert.deepEqual(restored.findById('L1'), { id: 'L1', name: 'Work' });
		assert.deepEqual(restored.toJSON(), repo.toJSON());
	});

	it('still accepts the original { id: entity } map', () => {
		const repo = new ObjectRepository({ L1: { id: 'L1', name: 'Work' } });
		assert.equal(repo.count(), 1);
		assert.deepEqual(repo.findById('L1'), { id: 'L1', name: 'Work' });
	});

	it('prefers the entity id over a mismatched map key', () => {
		const repo = new ObjectRepository({ wrongKey: { id: 'L1', name: 'Work' } });
		assert.deepEqual(repo.findById('L1'), { id: 'L1', name: 'Work' });
		assert.equal(repo.findById('wrongKey'), undefined);
	});

	it('skips array entries with no usable id', () => {
		const repo = new ObjectRepository([{ id: 'L1' }, { name: 'no id' }, null]);
		assert.equal(repo.count(), 1);
	});

	it('static fromJSON(), hasId() and clear() work (v2.4.7 upgrade)', () => {
		const repo = ObjectRepository.fromJSON([{ id: 'L1', name: 'Work' }]);
		assert.equal(repo.hasId('L1'), true);
		assert.equal(repo.hasId('L9'), false);
		assert.equal(repo.clear().count(), 0);
		assert.equal(ObjectRepository.fromJSON(null).count(), 0);
		assert.equal(new ObjectRepository().count(), 0);
	});

	it('copies entities instead of aliasing the input', () => {
		const source = { id: 'L1', name: 'Work' };
		const repo = new ObjectRepository([source]);
		source.name = 'mutated';
		assert.equal(repo.findById('L1').name, 'Work');
	});
});

describe('§2.56 one bad user no longer sinks the whole USync batch', () => {
	const deviceUser = (jid) => ({ tag: 'user', attrs: { jid }, content: [
		{ tag: 'devices', attrs: {}, content: [{ tag: 'device-list', attrs: {}, content: [{ tag: 'device', attrs: { id: '0' } }] }] }
	] });
	const iq = (...users) => ({ tag: 'iq', attrs: { type: 'result' }, content: [
		{ tag: 'usync', attrs: {}, content: [{ tag: 'list', attrs: {}, content: users }] }
	] });

	it('the surrounding users survive an error node that used to throw', () => {
		const errorUser = { tag: 'user', attrs: { jid: '2@s.whatsapp.net' }, content: [
			{ tag: 'devices', attrs: {}, content: [{ tag: 'error', attrs: { code: '403' } }] }
		] };
		const parsed = new USyncQuery().withDeviceProtocol()
			.parseUSyncQueryResult(iq(deviceUser('1@s.whatsapp.net'), errorUser, deviceUser('3@s.whatsapp.net')));
		assert.deepEqual(parsed.list.map((entry) => entry.id), ['1@s.whatsapp.net', '2@s.whatsapp.net', '3@s.whatsapp.net']);
		assert.equal(parsed.list[0].devices.deviceList.length, 1);
		assert.equal(parsed.list[1].devices, undefined, 'the failed user simply has no devices entry');
		assert.equal(parsed.list[2].devices.deviceList.length, 1, 'users after the failure are no longer lost');
	});

	it('the failure is still reported, via the §2.49 errors channel', () => {
		const errorUser = { tag: 'user', attrs: { jid: '2@s.whatsapp.net' }, content: [
			{ tag: 'devices', attrs: {}, content: [{ tag: 'error', attrs: { code: '403', text: 'forbidden' } }] }
		] };
		const parsed = new USyncQuery().withDeviceProtocol().parseUSyncQueryResult(iq(errorUser));
		assert.deepEqual(parsed.errors, [{ jid: '2@s.whatsapp.net', protocol: 'devices', code: 403, text: 'forbidden' }]);
	});

	it('the same protection applies to the side list', () => {
		const errorUser = { tag: 'user', attrs: { jid: '2@s.whatsapp.net' }, content: [
			{ tag: 'devices', attrs: {}, content: [{ tag: 'error', attrs: { code: '403' } }] }
		] };
		const node = { tag: 'iq', attrs: { type: 'result' }, content: [{ tag: 'usync', attrs: {}, content: [
			{ tag: 'list', attrs: {}, content: [] },
			{ tag: 'side_list', attrs: {}, content: [errorUser, deviceUser('3@s.whatsapp.net')] }
		] }] };
		const parsed = new USyncQuery().withDeviceProtocol().parseUSyncQueryResult(node);
		assert.deepEqual(parsed.sideList.map((entry) => entry.id), ['2@s.whatsapp.net', '3@s.whatsapp.net']);
	});

	it('device ids are never NaN', () => {
		const parsed = new USyncDeviceProtocol().parser({ tag: 'devices', attrs: {}, content: [
			{ tag: 'device-list', attrs: {}, content: [
				{ tag: 'device', attrs: { id: '0' } },
				{ tag: 'device', attrs: { id: '2', 'key-index': '7' } },
				{ tag: 'device', attrs: {} },
				{ tag: 'device', attrs: { id: 'abc' } },
				{ tag: 'device', attrs: { id: '-1' } },
				{ tag: 'not-a-device', attrs: { id: '9' } }
			] }
		] });
		assert.deepEqual(parsed.deviceList, [
			{ id: 0, keyIndex: undefined, isHosted: false },
			{ id: 2, keyIndex: 7, isHosted: false }
		]);
		assert.equal(parsed.deviceList.some((d) => Number.isNaN(d.id) || Number.isNaN(d.keyIndex)), false);
	});

	it('an unparsable key-index timestamp is undefined rather than NaN', () => {
		const parsed = new USyncDeviceProtocol().parser({ tag: 'devices', attrs: {}, content: [
			{ tag: 'key-index-list', attrs: { ts: 'later' }, content: Buffer.from('x') }
		] });
		assert.equal(parsed.keyIndex.timestamp, undefined);
		assert.equal(parsed.keyIndex.expectedTimestamp, undefined);
	});

	it('is_hosted is only true for the literal string', () => {
		const devices = (attrs) => new USyncDeviceProtocol().parser({ tag: 'devices', attrs: {}, content: [
			{ tag: 'device-list', attrs: {}, content: [{ tag: 'device', attrs: { id: '1', ...attrs } }] }
		] }).deviceList[0];
		assert.equal(devices({ is_hosted: 'true' }).isHosted, true);
		assert.equal(devices({ is_hosted: 'false' }).isHosted, false);
		assert.equal(devices({}).isHosted, false);
	});
});
