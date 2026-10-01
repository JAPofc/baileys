/**
 * tests/v247-group-notification-lid.test.js — batch Q (v2.4.7)
 *
 * Covers BUGREPORT §2.42–§2.44: the acting/affected participant cross-contamination in
 * `w:gp2` notifications, the LID↔PN pairs those notifications asserted but never stored,
 * and the LID mapping store silently writing a reversed pair backwards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	resolveNotificationActors,
	parseNotificationParticipants,
	extractNotificationLIDPNPairs
} from '../lib/Utils/index.js';
import { LIDMappingStore } from '../lib/Signal/lid-mapping.js';

const ADMIN_LID = 'ADMIN111@lid';
const ADMIN_PN = '628110000001@s.whatsapp.net';
const USER_LID = '99887766@lid';
const USER_PN = '628110000002@s.whatsapp.net';

const notification = (attrs = {}) => ({
	tag: 'notification',
	attrs: { from: '12345@g.us', type: 'w:gp2', participant: ADMIN_LID, participant_pn: ADMIN_PN, ...attrs }
});
const action = (tag, participants = [], attrs = {}) => ({
	tag,
	attrs,
	content: participants.map((p) => ({ tag: 'participant', attrs: p }))
});

// --- the in-memory SignalKeyStore surface the mapping store needs ---------------------
const makeKeys = () => {
	const db = { 'lid-mapping': {} };
	return {
		db,
		async get(type, ids) {
			const out = {};
			for (const id of ids) {
				if (db[type]?.[id] !== undefined && db[type][id] !== null) {
					out[id] = db[type][id];
				}
			}
			return out;
		},
		async set(data) {
			for (const [type, entries] of Object.entries(data)) {
				db[type] = db[type] || {};
				for (const [id, value] of Object.entries(entries)) {
					if (value === null) delete db[type][id];
					else db[type][id] = value;
				}
			}
		},
		async transaction(fn) {
			return fn();
		}
	};
};
const silentLogger = () => {
	const noop = () => {};
	return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
};

describe('§2.42 the affected participant is resolved as a unit, never half-borrowed from the actor', () => {
	it('does not pair the target LID with the actor phone number', () => {
		// a join-request notification: the <participant> child is the requester and carries
		// only a lid, while the notification node carries the ADMIN's participant_pn
		const actors = resolveNotificationActors(notification(), action('created_membership_requests', [{ jid: USER_LID }]));
		assert.equal(actors.affectedLid, USER_LID);
		assert.equal(actors.affectedPn, undefined, 'regression: used to be the actor phone number');
		assert.notEqual(actors.affectedPn, ADMIN_PN);
		assert.equal(actors.affectedIsActor, false);
	});

	it('keeps the actor fields intact', () => {
		const actors = resolveNotificationActors(notification({ participant_username: 'admin' }), action('add', [{ jid: USER_LID }]));
		assert.equal(actors.actingLid, ADMIN_LID);
		assert.equal(actors.actingPn, ADMIN_PN);
		assert.equal(actors.actingUsername, 'admin');
	});

	it('takes both halves from the participant node when the server sends both', () => {
		const actors = resolveNotificationActors(notification(), action('remove', [{ jid: USER_LID, phone_number: USER_PN }]));
		assert.deepEqual(
			{ lid: actors.affectedLid, pn: actors.affectedPn },
			{ lid: USER_LID, pn: USER_PN }
		);
	});

	it('handles a pn-addressed target (lid attribute instead of phone_number)', () => {
		const actors = resolveNotificationActors(notification(), action('add', [{ jid: USER_PN, lid: USER_LID }]));
		assert.equal(actors.affectedPn, USER_PN);
		assert.equal(actors.affectedLid, USER_LID);

		const noLid = resolveNotificationActors(notification(), action('add', [{ jid: USER_PN }]));
		assert.equal(noLid.affectedPn, USER_PN);
		assert.equal(noLid.affectedLid, undefined, 'must not fall back to the actor LID');
	});

	it('falls back to the actor only when there is no participant child at all', () => {
		for (const child of [undefined, null, action('leave'), { tag: 'subject', attrs: { subject: 'x' } }]) {
			const actors = resolveNotificationActors(notification(), child);
			assert.equal(actors.affectedIsActor, true);
			assert.equal(actors.affectedLid, ADMIN_LID);
			assert.equal(actors.affectedPn, ADMIN_PN);
		}
	});

	it('ignores mismatched address kinds in the counterpart attributes', () => {
		const bogusPn = resolveNotificationActors(notification(), action('add', [{ jid: USER_LID, phone_number: 'another@lid' }]));
		assert.equal(bogusPn.affectedPn, undefined);
		const bogusLid = resolveNotificationActors(notification(), action('add', [{ jid: USER_PN, lid: 'another@s.whatsapp.net' }]));
		assert.equal(bogusLid.affectedLid, undefined);
	});

	it('survives malformed input', () => {
		assert.equal(resolveNotificationActors(undefined, undefined).affectedIsActor, true);
		assert.equal(resolveNotificationActors(null, null).actingLid, undefined);
		assert.equal(resolveNotificationActors({}, {}).affectedIsActor, true);
	});
});

describe('§2.43 group notifications feed the LID mapping store', () => {
	it('harvests the actor pair carried on every notification', () => {
		assert.deepEqual(extractNotificationLIDPNPairs(notification(), action('subject')), [
			{ lid: ADMIN_LID, pn: ADMIN_PN }
		]);
	});

	it('harvests the participants of an add/remove/promote action, both orientations', () => {
		const pairs = extractNotificationLIDPNPairs(notification(), action('add', [
			{ jid: USER_PN, lid: USER_LID },
			{ jid: 'OTHER@lid', phone_number: '628110000003@s.whatsapp.net' }
		]));
		assert.deepEqual(pairs, [
			{ lid: ADMIN_LID, pn: ADMIN_PN },
			{ lid: USER_LID, pn: USER_PN },
			{ lid: 'OTHER@lid', pn: '628110000003@s.whatsapp.net' }
		]);
	});

	it('normalizes device suffixes and deduplicates', () => {
		const pairs = extractNotificationLIDPNPairs(
			notification({ participant: `${USER_LID.replace('@lid', ':3@lid')}`, participant_pn: USER_PN.replace('@s.whatsapp.net', ':3@s.whatsapp.net') }),
			action('add', [{ jid: USER_PN, lid: USER_LID }])
		);
		assert.deepEqual(pairs, [{ lid: USER_LID, pn: USER_PN }]);
	});

	it('never emits an inconsistent pair built from two different people (§2.42 knock-on)', () => {
		const pairs = extractNotificationLIDPNPairs(notification(), action('created_membership_requests', [{ jid: USER_LID }]));
		assert.deepEqual(pairs, [{ lid: ADMIN_LID, pn: ADMIN_PN }]);
		assert.equal(pairs.some((p) => p.lid === USER_LID && p.pn === ADMIN_PN), false);
	});

	it('skips the stale numbers listed by a change-number notification', () => {
		const pairs = extractNotificationLIDPNPairs(notification(), action('modify', [{ jid: '628119999999@s.whatsapp.net', lid: USER_LID }]));
		assert.deepEqual(pairs, [{ lid: ADMIN_LID, pn: ADMIN_PN }], 'the old number must not be re-stored');
	});

	it('returns an empty list when nothing pairs up, and survives malformed input', () => {
		assert.deepEqual(extractNotificationLIDPNPairs({ attrs: {} }, action('add', [{ jid: USER_PN }])), []);
		assert.deepEqual(extractNotificationLIDPNPairs(undefined, undefined), []);
		assert.deepEqual(extractNotificationLIDPNPairs(null, null), []);
	});

	it('parseNotificationParticipants keeps the stub-parameter shape', () => {
		assert.deepEqual(parseNotificationParticipants(action('promote', [{ jid: USER_PN, lid: USER_LID, type: 'admin', username: 'u' }])), [
			{ id: USER_PN, phoneNumber: undefined, lid: USER_LID, username: 'u', admin: 'admin' }
		]);
		assert.deepEqual(parseNotificationParticipants(action('add', [{ jid: USER_LID, phone_number: USER_PN }])), [
			{ id: USER_LID, phoneNumber: USER_PN, lid: undefined, username: undefined, admin: null }
		]);
		assert.deepEqual(parseNotificationParticipants(undefined), []);
		assert.deepEqual(parseNotificationParticipants(action('leave')), []);
	});

	it('messages-recv wires the harvest into handleGroupNotification', async () => {
		const fs = await import('node:fs');
		const source = await fs.promises.readFile(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8');
		assert.match(source, /storeMappingsFromNotification/);
		assert.match(source, /extractNotificationLIDPNPairs/);
		assert.match(source, /resolveNotificationActors\(fullNode, child\)/);
		const handler = source.slice(source.indexOf('const storeMappingsFromNotification'), source.indexOf('const handleGroupNotification'));
		assert.match(handler, /catch \(error\)/, 'a mapping failure must not break notification handling');
		assert.doesNotMatch(source, /^\s*\/\/ TODO: Store LID MAPPINGS\s*$/m);
		assert.doesNotMatch(source, /^\s*\/\/ TODO: HANDLE PARTICIPANT_PN\s*$/m);
		assert.doesNotMatch(source, /^\s*\/\/ TODO: LIDMAPPING SUPPORT\s*$/m);
	});
});

describe('§2.44 LIDMappingStore normalizes a reversed pair instead of storing it backwards', () => {
	const store = () => {
		const keys = makeKeys();
		return { keys, mapping: new LIDMappingStore(keys, silentLogger()) };
	};

	it('a reversed pair produces the same rows as a correct one', async () => {
		const correct = store();
		await correct.mapping.storeLIDPNMappings([{ lid: USER_LID, pn: USER_PN }]);

		const reversed = store();
		await reversed.mapping.storeLIDPNMappings([{ lid: USER_PN, pn: USER_LID }]);

		assert.deepEqual(reversed.keys.db['lid-mapping'], correct.keys.db['lid-mapping']);
	});

	it('both lookup directions resolve after a reversed insert (regression: both returned null)', async () => {
		const { mapping } = store();
		await mapping.storeLIDPNMappings([{ lid: USER_PN, pn: USER_LID }]);
		assert.equal(await mapping.getLIDForPN(USER_PN), USER_LID);
		assert.match(String(await mapping.getPNForLID(USER_LID)), /^628110000002/);
	});

	it('does not pollute the store with a row keyed by the LID user', async () => {
		const { keys, mapping } = store();
		await mapping.storeLIDPNMappings([{ lid: USER_PN, pn: USER_LID }]);
		assert.equal(keys.db['lid-mapping']['99887766'], undefined, 'regression: the LID user became a pn key');
		assert.equal(keys.db['lid-mapping']['628110000002'], '99887766');
	});

	it('still rejects genuinely invalid pairs', async () => {
		const { keys, mapping } = store();
		await mapping.storeLIDPNMappings([
			{ lid: USER_PN, pn: '628110000003@s.whatsapp.net' },
			{ lid: USER_LID, pn: 'OTHER@lid' },
			{ lid: '12345@g.us', pn: USER_PN }
		]);
		assert.deepEqual(keys.db['lid-mapping'], {});
	});

	it('the correct orientation is untouched', async () => {
		const { keys, mapping } = store();
		await mapping.storeLIDPNMappings([{ lid: USER_LID, pn: USER_PN }]);
		assert.equal(keys.db['lid-mapping']['628110000002'], '99887766');
		assert.equal(keys.db['lid-mapping']['99887766_reverse'], '628110000002');
	});
});

describe('upgrade — LIDMappingStore.removeMapping()', () => {
	const seeded = async () => {
		const keys = makeKeys();
		const mapping = new LIDMappingStore(keys, silentLogger());
		await mapping.storeLIDPNMappings([{ lid: USER_LID, pn: USER_PN }]);
		return { keys, mapping };
	};

	it('removes both directions when given the phone number', async () => {
		const { keys, mapping } = await seeded();
		assert.equal(await mapping.removeMapping(USER_PN), true);
		assert.deepEqual(keys.db['lid-mapping'], {});
		assert.equal(await mapping.getLIDForPN(USER_PN), null);
	});

	it('removes both directions when given the LID', async () => {
		const { keys, mapping } = await seeded();
		assert.equal(await mapping.removeMapping(USER_LID), true);
		assert.deepEqual(keys.db['lid-mapping'], {});
	});

	it('clears the in-memory cache too, so a stale pair cannot be served after removal', async () => {
		const { mapping } = await seeded();
		await mapping.getLIDForPN(USER_PN); // warm the cache
		await mapping.removeMapping(USER_PN);
		assert.equal(await mapping.getLIDForPN(USER_PN), null);
	});

	it('reports false for unknown or malformed input', async () => {
		const { mapping } = await seeded();
		assert.equal(await mapping.removeMapping('628119999999@s.whatsapp.net'), false);
		assert.equal(await mapping.removeMapping('00000@lid'), false);
		assert.equal(await mapping.removeMapping(''), false);
		assert.equal(await mapping.removeMapping(undefined), false);
	});

	it('a re-store after removal works normally', async () => {
		const { keys, mapping } = await seeded();
		await mapping.removeMapping(USER_PN);
		await mapping.storeLIDPNMappings([{ lid: USER_LID, pn: USER_PN }]);
		assert.equal(keys.db['lid-mapping']['628110000002'], '99887766');
	});
});
