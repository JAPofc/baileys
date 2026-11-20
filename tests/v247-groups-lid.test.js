/**
 * tests/v247-groups-lid.test.js — batch P (v2.4.7)
 *
 * Covers BUGREPORT §2.38–§2.41: group metadata NaN timestamps, the community
 * addressing-mode/size parse divergence from groups.js, and the LID↔PN pairs that group
 * and community metadata carried but never stored.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractGroupMetadata, extractLIDPNPairs, GROUP_PARTICIPANTS_CHUNK_SIZE } from '../lib/Socket/groups.js';
import { extractCommunityMetadata } from '../lib/Socket/communities.js';
import { WAMessageAddressingMode } from '../lib/Types/index.js';

const node = (tag, attrs = {}, content = undefined) => ({ tag, attrs, content });
const wrap = (child) => node('result', {}, [child]);

const participant = (attrs) => node('participant', attrs);

const groupNode = (attrs = {}, participants = []) => wrap(node('group', { id: '12345-678', subject: 'Test', ...attrs }, participants));
const communityNode = (attrs = {}, participants = []) => wrap(node('community', { id: '12345-678', subject: 'Test', ...attrs }, participants));

describe('§2.38 group metadata never emits NaN timestamps', () => {
	it('omits subjectTime/creation/descTime when the server does not send them', () => {
		const meta = extractGroupMetadata(groupNode());
		for (const field of ['subjectTime', 'creation', 'descTime']) {
			assert.equal(meta[field], undefined, `${field} must be undefined, not NaN`);
			assert.equal(Number.isNaN(meta[field]), false);
		}
	});

	it('survives a JSON round-trip into a store without turning into null', () => {
		const meta = extractGroupMetadata(groupNode());
		const revived = JSON.parse(JSON.stringify({ subjectTime: meta.subjectTime, creation: meta.creation }));
		assert.deepEqual(revived, {}, 'absent timestamps must not persist as null');
	});

	it('still parses the values when they are present', () => {
		const meta = extractGroupMetadata(wrap(node('group', { id: '1@g.us', s_t: '100', creation: '200' }, [
			node('description', { id: 'd', t: '300' }, [node('body', {}, Buffer.from('hello'))])
		])));
		assert.equal(meta.subjectTime, 100);
		assert.equal(meta.creation, 200);
		assert.equal(meta.descTime, 300);
		assert.equal(meta.desc, 'hello');
	});

	it('ignores unparseable numerics instead of propagating NaN', () => {
		const meta = extractGroupMetadata(groupNode({ s_t: 'abc', creation: '', size: 'xyz' }, [participant({ jid: '1@s.whatsapp.net' })]));
		assert.equal(meta.subjectTime, undefined);
		assert.equal(meta.creation, undefined);
		assert.equal(meta.size, 1, 'an unparseable size falls back to the participant count');
	});

	it('honours the server size attribute and falls back to the participant count', () => {
		assert.equal(extractGroupMetadata(groupNode({ size: '250' })).size, 250);
		assert.equal(extractGroupMetadata(groupNode({}, [participant({ jid: '1@s.whatsapp.net' }), participant({ jid: '2@s.whatsapp.net' })])).size, 2);
	});

	it('ephemeralDuration stays undefined rather than NaN', () => {
		assert.equal(extractGroupMetadata(groupNode()).ephemeralDuration, undefined);
		assert.equal(extractGroupMetadata(groupNode({}, [node('ephemeral', { expiration: '86400' })])).ephemeralDuration, 86400);
	});
});

describe('§2.39 community addressingMode is read from the attribute, like groups', () => {
	const participants = [participant({ jid: '111@s.whatsapp.net', lid: '999@lid' })];

	it('reports LID for a lid-addressed community (regression: was always undefined)', () => {
		const meta = extractCommunityMetadata(communityNode({ addressing_mode: 'lid' }, participants));
		assert.equal(meta.addressingMode, WAMessageAddressingMode.LID);
	});

	it('matches what groups.js returns for the identical payload', () => {
		for (const mode of ['lid', 'pn', undefined]) {
			const attrs = mode ? { addressing_mode: mode } : {};
			assert.equal(
				extractCommunityMetadata(communityNode(attrs, participants)).addressingMode,
				extractGroupMetadata(groupNode(attrs, participants)).addressingMode,
				`addressingMode diverged for addressing_mode=${mode}`
			);
		}
	});

	it('defaults to PN and still accepts the legacy child-element form', () => {
		assert.equal(extractCommunityMetadata(communityNode({}, participants)).addressingMode, WAMessageAddressingMode.PN);
		const legacy = communityNode({}, [...participants, node('addressing_mode', {}, Buffer.from('lid'))]);
		assert.equal(extractCommunityMetadata(legacy).addressingMode, WAMessageAddressingMode.LID);
	});
});

describe('§2.40 community size honours the server attribute', () => {
	it('uses the size attribute instead of counting inlined participant nodes', () => {
		const meta = extractCommunityMetadata(communityNode({ size: '250' }, [
			participant({ jid: '111@s.whatsapp.net' }),
			participant({ jid: '222@s.whatsapp.net' })
		]));
		assert.equal(meta.size, 250, 'regression: reported the truncated inline count (2)');
	});

	it('falls back to the participant count when the attribute is absent or junk', () => {
		const participants = [participant({ jid: '1@s.whatsapp.net' }), participant({ jid: '2@s.whatsapp.net' })];
		assert.equal(extractCommunityMetadata(communityNode({}, participants)).size, 2);
		assert.equal(extractCommunityMetadata(communityNode({ size: 'abc' }, participants)).size, 2);
	});

	it('agrees with groups.js on the same payload', () => {
		const participants = [participant({ jid: '1@s.whatsapp.net' })];
		for (const attrs of [{ size: '250' }, {}]) {
			assert.equal(
				extractCommunityMetadata(communityNode(attrs, participants)).size,
				extractGroupMetadata(groupNode(attrs, participants)).size
			);
		}
	});
});

describe('§2.41 LID↔PN pairs are extracted from group/community metadata', () => {
	it('reads both participant orientations (pn-addressed and lid-addressed)', () => {
		const meta = extractGroupMetadata(groupNode({}, [
			participant({ jid: '111@s.whatsapp.net', lid: '999@lid' }),
			participant({ jid: '222@lid', phone_number: '333@s.whatsapp.net' })
		]));
		assert.deepEqual(extractLIDPNPairs(meta), [
			{ lid: '999@lid', pn: '111@s.whatsapp.net' },
			{ lid: '222@lid', pn: '333@s.whatsapp.net' }
		]);
	});

	it('normalizes device suffixes so the mapping store is keyed by base user', () => {
		const pairs = extractLIDPNPairs({
			participants: [{ id: '111:3@s.whatsapp.net', lid: '999:3@lid' }]
		});
		assert.deepEqual(pairs, [{ lid: '999@lid', pn: '111@s.whatsapp.net' }]);
	});

	it('deduplicates repeated pairs', () => {
		const pairs = extractLIDPNPairs({
			participants: [
				{ id: '111@s.whatsapp.net', lid: '999@lid' },
				{ id: '111:2@s.whatsapp.net', lid: '999:2@lid' },
				{ id: '111@s.whatsapp.net', lid: '999@lid' }
			]
		});
		assert.equal(pairs.length, 1);
	});

	it('skips participants that only carry one address, and malformed input', () => {
		assert.deepEqual(extractLIDPNPairs({ participants: [{ id: '111@s.whatsapp.net' }, { id: '222@lid' }] }), []);
		assert.deepEqual(extractLIDPNPairs({ participants: [{}, { id: '' }, null] }), []);
		assert.deepEqual(extractLIDPNPairs({ participants: [] }), []);
		assert.deepEqual(extractLIDPNPairs({}), []);
		assert.deepEqual(extractLIDPNPairs(null), []);
		assert.deepEqual(extractLIDPNPairs(undefined), []);
	});

	it('ignores mismatched address kinds (pn in the lid slot and vice versa)', () => {
		assert.deepEqual(extractLIDPNPairs({ participants: [{ id: '111@s.whatsapp.net', lid: '222@s.whatsapp.net' }] }), []);
		assert.deepEqual(extractLIDPNPairs({ participants: [{ id: '111@lid', phoneNumber: '222@lid' }] }), []);
	});

	it('works on community metadata too', () => {
		const meta = extractCommunityMetadata(communityNode({}, [
			participant({ jid: '111@s.whatsapp.net', lid: '999@lid' })
		]));
		assert.deepEqual(extractLIDPNPairs(meta), [{ lid: '999@lid', pn: '111@s.whatsapp.net' }]);
	});

	it('works on plain cached metadata objects, not just freshly parsed nodes', () => {
		const cached = JSON.parse(JSON.stringify(extractGroupMetadata(groupNode({}, [
			participant({ jid: '111@s.whatsapp.net', lid: '999@lid' })
		]))));
		assert.deepEqual(extractLIDPNPairs(cached), [{ lid: '999@lid', pn: '111@s.whatsapp.net' }]);
	});
});

describe('§2.41 the socket actually persists the pairs it extracts', () => {
	// makeGroupsSocket() builds a real WebSocket-backed stack, so the wiring is asserted
	// against the source rather than by standing up a live socket.
	const read = async (file) => (await import('node:fs')).promises.readFile(new URL(`../lib/Socket/${file}`, import.meta.url), 'utf8');

	it('groupMetadata() and groupFetchAllParticipating() feed the LID mapping store', async () => {
		const source = await read('groups.js');
		assert.match(source, /storeMappingsFromMetadata/);
		assert.match(source, /signalRepository\?\.lidMapping\?\.storeLIDPNMappings\(pairs\)/);
		const metadataFn = source.slice(source.indexOf('const groupMetadata ='), source.indexOf('const groupFetchAllParticipating'));
		assert.match(metadataFn, /await storeMappingsFromMetadata\(\[metadata\]\)/);
		const fetchAll = source.slice(source.indexOf('const groupFetchAllParticipating'), source.indexOf("sock.ws.on('CB:ib,,dirty'"));
		assert.match(fetchAll, /await storeMappingsFromMetadata\(Object\.values\(data\)\)/);
		// the two TODOs this batch closed are now only referenced from the fix comments
		assert.doesNotMatch(source, /^\s*\/\/ TODO: properly parse LID \/ PN DATA\s*$/m);
		assert.doesNotMatch(source, /^\s*\/\/ TODO: Store LID MAPPINGS\s*$/m);
	});

	it('communityMetadata() does the same', async () => {
		const source = await read('communities.js');
		assert.match(source, /storeCommunityMappings/);
		assert.match(source, /extractLIDPNPairs/);
		assert.match(source.slice(source.indexOf('const communityMetadata =')).slice(0, 400), /await storeCommunityMappings\(metadata\)/);
	});

	it('a mapping-store failure never breaks a metadata fetch', async () => {
		const source = await read('groups.js');
		const fn = source.slice(source.indexOf('const storeMappingsFromMetadata'), source.indexOf('const groupMetadata ='));
		assert.match(fn, /try \{/);
		assert.match(fn, /catch \(error\)/);
		assert.match(fn, /logger\?\.warn\?\./);
	});
});

describe('upgrade — w:g2 participant chunk size is shared', () => {
	it('exports the chunk size used by the participant-mutating queries', () => {
		assert.equal(GROUP_PARTICIPANTS_CHUNK_SIZE, 25);
	});

	it('groupRequestParticipantsUpdate chunks its stanzas like groupParticipantsUpdate', async () => {
		const source = await import('node:fs').then((fs) => fs.promises.readFile(new URL('../lib/Socket/groups.js', import.meta.url), 'utf8'));
		const body = source.slice(source.indexOf('groupRequestParticipantsUpdate:'), source.indexOf('groupUpdateDescription:'));
		assert.match(body, /GROUP_PARTICIPANTS_CHUNK_SIZE/, 'the approval path must be chunked too');
		assert.match(body, /participants\.slice\(/);
	});
});
