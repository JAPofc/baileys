/**
 * tests/v247-store-participants.test.js — batch T (v2.4.7)
 *
 * Covers BUGREPORT §2.50–§2.52: the ordered dictionary whose id index survived neither a
 * snapshot restore nor an honest return value, and the group participant list that grew
 * duplicates and stored boolean `false` as an admin rank.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { makeOrderedDictionary } from '../lib/Store/index.js';
import { upsertParticipants, removeParticipants, setParticipantsAdmin } from '../lib/Utils/index.js';

const waMessageID = (m) => m.key.id || '';
const msg = (id, extra = {}) => ({ key: { id }, status: 2, ...extra });

describe('§2.50 fromJSON() rebuilds the id index', () => {
	it('restored items are findable again (they used to be invisible)', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.fromJSON([msg('AAA'), msg('BBB')]);
		assert.equal(dict.array.length, 2);
		assert.deepEqual(dict.get('AAA'), msg('AAA'));
		assert.deepEqual(dict.get('BBB'), msg('BBB'));
		assert.equal(dict.get('nope'), undefined);
	});

	it('updateAssign() works after a restore — receipts and status updates land', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.fromJSON([msg('AAA')]);
		assert.equal(dict.updateAssign('AAA', { status: 4 }), true);
		assert.equal(dict.get('AAA').status, 4);
		assert.equal(dict.array[0].status, 4, 'array and index point at the same object');
	});

	it('upserting a restored id updates it instead of appending a duplicate', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.fromJSON([msg('AAA'), msg('BBB')]);
		dict.upsert(msg('AAA', { status: 4 }), 'append');
		assert.deepEqual(dict.array.map((m) => m.key.id), ['AAA', 'BBB'], 'no duplicate row');
		assert.equal(dict.get('AAA').status, 4);
	});

	it('a second fromJSON() drops the previous index rather than merging it', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.fromJSON([msg('AAA')]);
		dict.fromJSON([msg('BBB')]);
		assert.deepEqual(dict.array.map((m) => m.key.id), ['BBB']);
		assert.equal(dict.get('AAA'), undefined, 'the stale index entry is gone');
		assert.deepEqual(dict.get('BBB'), msg('BBB'));
	});

	it('remove() and filter() keep working on restored items', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.fromJSON([msg('AAA'), msg('BBB'), msg('CCC')]);
		assert.equal(dict.remove(msg('BBB')), true);
		assert.equal(dict.get('BBB'), undefined);
		dict.filter((m) => m.key.id !== 'CCC');
		assert.deepEqual(dict.array.map((m) => m.key.id), ['AAA']);
		assert.equal(dict.get('CCC'), undefined);
	});

	it('survives null/undefined/empty input', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.upsert(msg('AAA'), 'append');
		dict.fromJSON(null);
		assert.deepEqual(dict.array, []);
		assert.equal(dict.get('AAA'), undefined);
		dict.fromJSON(undefined);
		dict.fromJSON([]);
		assert.deepEqual(dict.toJSON(), []);
	});

	it('round-trips through JSON, which is the whole point', () => {
		const source = makeOrderedDictionary(waMessageID);
		source.upsert(msg('AAA'), 'append');
		source.upsert(msg('BBB'), 'append');
		const restored = makeOrderedDictionary(waMessageID);
		restored.fromJSON(JSON.parse(JSON.stringify(source.toJSON())));
		assert.deepEqual(restored.toJSON(), source.toJSON());
		assert.equal(restored.get('BBB').key.id, 'BBB');
	});
});

describe('§2.51 update() reports whether it updated', () => {
	it('returns true on a hit and false on a miss', () => {
		const dict = makeOrderedDictionary(waMessageID);
		dict.upsert(msg('AAA'), 'append');
		assert.equal(dict.update(msg('AAA', { status: 5 })), true);
		assert.equal(dict.get('AAA').status, 5);
		assert.equal(dict.array[0].status, 5);
		assert.equal(dict.update(msg('ZZZ')), false);
		assert.equal(dict.array.length, 1, 'a miss does not insert');
	});

	it('the unconditional `return false` is gone from the source', async () => {
		const source = await readFile(new URL('../lib/Store/make-ordered-dictionary.js', import.meta.url), 'utf8');
		const update = source.slice(source.indexOf('const update ='), source.indexOf('const upsert ='));
		assert.match(update, /return true;/);
		assert.equal((update.match(/return false;/g) || []).length, 1, 'exactly one, on the miss path');
	});
});

describe('has() / size() (v2.4.7 upgrade)', () => {
	it('track the contents through every mutation', () => {
		const dict = makeOrderedDictionary(waMessageID);
		assert.equal(dict.size(), 0);
		assert.equal(dict.has('AAA'), false);
		dict.upsert(msg('AAA'), 'append');
		assert.equal(dict.has('AAA'), true);
		assert.equal(dict.size(), 1);
		dict.fromJSON([msg('BBB'), msg('CCC')]);
		assert.equal(dict.size(), 2);
		assert.equal(dict.has('AAA'), false);
		assert.equal(dict.has('CCC'), true);
		dict.clear();
		assert.equal(dict.size(), 0);
		assert.equal(dict.has('CCC'), false);
	});
});

describe('§2.52 the participant list cannot duplicate or store `false`', () => {
	const base = () => [
		{ id: '1@lid', phoneNumber: '628111@s.whatsapp.net', admin: 'superadmin' },
		{ id: '2@lid', phoneNumber: '628222@s.whatsapp.net', admin: null }
	];

	it('re-adding an existing member merges instead of appending (the regression)', () => {
		const out = upsertParticipants(base(), [{ id: '2@lid' }, { id: '3@lid' }]);
		assert.deepEqual(out.map((p) => p.id), ['1@lid', '2@lid', '3@lid']);
		assert.equal(out[1].phoneNumber, '628222@s.whatsapp.net', 'the known PN half is kept');
		assert.equal(out[2].admin, null, 'a brand-new member defaults to null, not undefined');
	});

	it('matches the same person across their LID and PN halves', () => {
		const out = upsertParticipants(base(), [{ phoneNumber: '628111@s.whatsapp.net', admin: 'superadmin' }]);
		assert.equal(out.length, 2, 'the PN of an already-listed LID is not a new member');
	});

	it('does not mutate the input list', () => {
		const original = base();
		upsertParticipants(original, [{ id: '9@lid' }]);
		assert.equal(original.length, 2);
	});

	it('demote writes null, never boolean false', () => {
		const out = setParticipantsAdmin(base(), [{ id: '1@lid' }], null);
		assert.equal(out[0].admin, null);
		assert.notEqual(out[0].admin, false);
		assert.equal(out[0].admin === null, true, 'an `admin === null` check must work');
		assert.equal(out[1].admin, null, 'untouched members keep their rank');
	});

	it('promote sets admin, and leaves the owner a superadmin', () => {
		const out = setParticipantsAdmin(base(), [{ id: '1@lid' }, { id: '2@lid' }], 'admin');
		assert.equal(out[0].admin, 'superadmin', 'the group owner is not demoted by a promote');
		assert.equal(out[1].admin, 'admin');
	});

	it('remove matches either identity and keeps the rest in order', () => {
		assert.deepEqual(removeParticipants(base(), [{ phoneNumber: '628111@s.whatsapp.net' }]).map((p) => p.id), ['2@lid']);
		assert.deepEqual(removeParticipants(base(), [{ id: '2@lid' }]).map((p) => p.id), ['1@lid']);
		assert.equal(removeParticipants(base(), []).length, 2);
	});

	it('every helper tolerates missing participants and junk entries', () => {
		assert.deepEqual(upsertParticipants(undefined, [{ id: '1@lid' }]), [{ id: '1@lid', phoneNumber: undefined, admin: null }]);
		assert.deepEqual(upsertParticipants(null, null), []);
		assert.deepEqual(upsertParticipants(base(), [null, {}]).length, 2, 'identity-less entries are ignored');
		assert.deepEqual(removeParticipants(null, [{ id: 'x' }]), []);
		assert.deepEqual(setParticipantsAdmin(null, [{ id: 'x' }], 'admin'), []);
		assert.deepEqual(setParticipantsAdmin(base(), null, 'admin').map((p) => p.admin), ['superadmin', null]);
	});

	it('the store handler uses the helpers rather than push/&&', async () => {
		const source = await readFile(new URL('../lib/Store/make-in-memory-store.js', import.meta.url), 'utf8');
		const handler = source.slice(source.indexOf("ev.on('group-participants.update'"), source.indexOf("ev.on('message-receipt.update'"));
		assert.match(handler, /upsertParticipants\(metadata\.participants, participants\)/);
		assert.match(handler, /setParticipantsAdmin\(metadata\.participants, participants, action === 'promote' \? 'admin' : null\)/);
		assert.match(handler, /removeParticipants\(metadata\.participants, participants\)/);
		// non-comment lines only: the old code is quoted in the fix comment on purpose
		assert.doesNotMatch(handler, /^(?!\s*\/\/).*metadata\.participants\.push/m);
		assert.doesNotMatch(handler, /^(?!\s*\/\/).*action === 'promote' && 'admin'/m);
	});
});
