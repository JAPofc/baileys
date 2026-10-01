/**
 * tests/v247-stub-participants.test.js — batch W (v2.4.7)
 *
 * Covers BUGREPORT §2.59–§2.60: the join request that never reached `group.join-request`,
 * and the membership test that only ever looked at a participant's phone number.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import P from 'pino';

import { proto } from '../WAProto/index.js';
import processMessage from '../lib/Utils/process-message.js';
import { parseStubParticipant, stubParticipantIdentities, stubParticipantsInclude } from '../lib/Utils/index.js';

const T = proto.WebMessageInfo.StubType;
const ME = '628111@s.whatsapp.net';
const ME_LID = '77665544@lid';

/** Drive the real processMessage() and collect what it emits. */
const run = async (message, { meLid = ME_LID } = {}) => {
	const events = [];
	const ev = { emit: (event, data) => events.push([event, data]), on() {}, off() {} };
	await processMessage(message, {
		ev,
		creds: { me: { id: ME, lid: meLid }, accountSettings: {} },
		keyStore: { get: async () => ({}), set: async () => {} },
		logger: P({ level: 'silent' }),
		options: {},
		signalRepository: {},
		shouldProcessHistoryMsg: false,
		placeholderResendCache: undefined,
		getMessage: async () => undefined
	});
	return events;
};
const stub = (messageStubType, messageStubParameters) => ({
	key: { remoteJid: 'g@g.us', id: `S${messageStubType}`, fromMe: false, participant: '99@lid' },
	messageStubType,
	messageStubParameters,
	messageTimestamp: 1
});
const pick = (events, name) => events.filter(([event]) => event === name).map(([, data]) => data);

describe('§2.59 an invite-link join request reaches group.join-request', () => {
	const params = [JSON.stringify({ lid: '12345@lid', pn: '628222@s.whatsapp.net' }), 'created', 'invite_link'];

	it('the plain approval-request stub now emits (it used to emit nothing)', async () => {
		const events = await run(stub(T.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST, params));
		const [request] = pick(events, 'group.join-request');
		assert.ok(request, 'group.join-request must be emitted');
		assert.equal(request.id, 'g@g.us');
		assert.equal(request.participant, '12345@lid');
		assert.equal(request.participantPn, '628222@s.whatsapp.net');
		assert.equal(request.action, 'created');
		assert.equal(request.method, 'invite_link');
	});

	it('the non-admin-add variant still emits exactly as before', async () => {
		const events = await run(stub(T.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD, params));
		assert.equal(pick(events, 'group.join-request').length, 1);
	});

	it('both variants produce the same payload', async () => {
		const [a] = pick(await run(stub(T.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST, params)), 'group.join-request');
		const [b] = pick(await run(stub(T.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD, params)), 'group.join-request');
		assert.deepEqual(a, b);
	});

	it('a plain-jid parameter is still understood', async () => {
		const events = await run(stub(T.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST, ['628222@s.whatsapp.net', 'created', 'invite_link']));
		const [request] = pick(events, 'group.join-request');
		assert.equal(request.participantPn, undefined);
		assert.ok(request, 'and it does not throw');
	});

	it('an unrelated group stub still emits no join request', async () => {
		const events = await run(stub(T.GROUP_CHANGE_SUBJECT, ['New name']));
		assert.equal(pick(events, 'group.join-request').length, 0);
	});
});

describe('§2.60 membership is tested against every identity', () => {
	it('leaving a LID-addressed group marks the chat read-only', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_LEAVE, [ME_LID]));
		assert.deepEqual(pick(events, 'chats.update')[0], [{ id: 'g@g.us', readOnly: true }]);
	});

	it('leaving by phone number still works', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_LEAVE, [ME]));
		assert.deepEqual(pick(events, 'chats.update')[0], [{ id: 'g@g.us', readOnly: true }]);
	});

	it('the JSON form is matched through its lid half', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_REMOVE, [JSON.stringify({ lid: ME_LID, pn: ME })]));
		assert.deepEqual(pick(events, 'chats.update')[0], [{ id: 'g@g.us', readOnly: true }]);
	});

	it('being added back clears read-only', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_ADD, [ME_LID]));
		assert.deepEqual(pick(events, 'chats.update')[0], [{ id: 'g@g.us', readOnly: false }]);
	});

	it('somebody else leaving does not touch our chat', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_LEAVE, ['99999@lid']));
		assert.equal(pick(events, 'chats.update').length, 0);
	});

	it('a participants update is still emitted in every case', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_LEAVE, [ME_LID]));
		const [update] = pick(events, 'group-participants.update');
		assert.equal(update.action, 'remove');
		assert.equal(update.id, 'g@g.us');
	});

	it('an account with no LID is unaffected', async () => {
		const events = await run(stub(T.GROUP_PARTICIPANT_LEAVE, [ME]), { meLid: undefined });
		assert.deepEqual(pick(events, 'chats.update')[0], [{ id: 'g@g.us', readOnly: true }]);
	});
});

describe('stub-participant helpers (v2.4.7 upgrade)', () => {
	it('parses every shape a stub parameter can take', () => {
		assert.deepEqual(parseStubParticipant('628111@s.whatsapp.net'), { phoneNumber: '628111@s.whatsapp.net' });
		assert.deepEqual(parseStubParticipant('{"lid":"1@lid","pn":"2@s.whatsapp.net"}'), { lid: '1@lid', pn: '2@s.whatsapp.net' });
		assert.deepEqual(parseStubParticipant('12345'), { phoneNumber: '12345' }, 'a bare number is not an object');
		assert.deepEqual(parseStubParticipant({ lid: '1@lid' }), { lid: '1@lid' });
		assert.equal(parseStubParticipant(null), null);
		assert.equal(parseStubParticipant(undefined), undefined);
	});

	it('lists every identity, skipping empty ones', () => {
		assert.deepEqual(stubParticipantIdentities({ lid: '1@lid', pn: '2@s.whatsapp.net' }), ['1@lid', '2@s.whatsapp.net']);
		assert.deepEqual(stubParticipantIdentities('3@s.whatsapp.net'), ['3@s.whatsapp.net']);
		assert.deepEqual(stubParticipantIdentities({ id: '4@lid', jid: '5@s.whatsapp.net' }), ['4@lid', '5@s.whatsapp.net']);
		assert.deepEqual(stubParticipantIdentities({ lid: '', pn: null }), []);
		assert.deepEqual(stubParticipantIdentities(null), []);
	});

	it('matches on any identity and ignores device suffixes', () => {
		const participants = [{ lid: ME_LID, pn: ME }];
		assert.equal(stubParticipantsInclude(participants, ME), true);
		assert.equal(stubParticipantsInclude(participants, ME_LID), true);
		assert.equal(stubParticipantsInclude(participants, '628111:7@s.whatsapp.net'), true, 'same user, other device');
		assert.equal(stubParticipantsInclude(participants, '628999@s.whatsapp.net'), false);
		assert.equal(stubParticipantsInclude(participants, undefined, ME_LID), true, 'a missing identity is skipped');
	});

	it('is safe on empty and junk input', () => {
		assert.equal(stubParticipantsInclude([], ME), false);
		assert.equal(stubParticipantsInclude(null, ME), false);
		assert.equal(stubParticipantsInclude([{ lid: ME_LID }]), false, 'no jids to look for');
		assert.equal(stubParticipantsInclude([null, '', {}], ME), false);
	});
});
