// Tests for the bot toolkit round: call guard, group events tracker,
// message serializer, view-once toolkit and anti-link guard.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createCallGuard,
	createGroupEventsTracker,
	serializeMessage,
	isViewOnceMessage,
	unwrapViewOnce,
	createViewOnceCapture,
	extractLinks,
	containsGroupInvite,
	createAntiLinkGuard
} from '../lib/index.js';

const makeEv = () => {
	const handlers = {};
	return {
		on: (event, fn) => {
			(handlers[event] ||= []).push(fn);
		},
		off: (event, fn) => {
			handlers[event] = (handlers[event] || []).filter(f => f !== fn);
		},
		emit: (event, payload) => Promise.all((handlers[event] || []).map(fn => fn(payload))),
		count: (event) => (handlers[event] || []).length
	};
};

const INVITE = 'https://chat.whatsapp.com/AbCdEfGh1234567890';

// ---------------------------------------------------------------- call guard

test('call guard auto-rejects offers, honors allowlist, logs calls', async () => {
	const rejected = [];
	const sent = [];
	const sock = {
		ev: makeEv(),
		rejectCall: async (id, from) => rejected.push([id, from]),
		sendMessage: async (jid, content) => sent.push([jid, content])
	};
	const guard = createCallGuard({
		autoReject: true,
		rejectMessage: 'busy',
		allowlist: ['friend@s.whatsapp.net']
	});
	guard.bind(sock);
	const statuses = [];
	guard.onCall(call => statuses.push(call.status));
	const rejectedEvents = [];
	guard.onRejected(call => rejectedEvents.push(call.id));

	const offer = (id, from) => ({ id, chatId: from, from, status: 'offer', date: new Date() });
	await sock.ev.emit('call', [offer('c1', 'stranger@s.whatsapp.net')]);
	await sock.ev.emit('call', [offer('c2', 'friend@s.whatsapp.net')]);
	await sock.ev.emit('call', [{ id: 'c1', chatId: 'stranger@s.whatsapp.net', from: 'stranger@s.whatsapp.net', status: 'terminate', date: new Date() }]);

	assert.deepEqual(rejected, [['c1', 'stranger@s.whatsapp.net']], 'only non-allowlisted offer rejected');
	assert.equal(sent.length, 1);
	assert.equal(sent[0][1].text, 'busy');
	assert.deepEqual(rejectedEvents, ['c1']);
	assert.deepEqual(statuses, ['offer', 'offer', 'terminate'], 'every event still surfaces via onCall');
	assert.equal(guard.getCallCount('stranger@s.whatsapp.net'), 1, 'terminate does not bump the offer counter');
	assert.equal(guard.getCall('c1').status, 'terminate', 'log keeps latest state per call id');
	guard.unbind();
	assert.equal(sock.ev.count('call'), 0, 'unbind removes the listener');
});

test('call guard predicate autoReject and no-socket safety', async () => {
	const rejected = [];
	const sock = {
		ev: makeEv(),
		rejectCall: async (id) => rejected.push(id),
		sendMessage: async () => { }
	};
	const guard = createCallGuard({ autoReject: (call) => !!call.isVideo });
	guard.bind(sock);
	await sock.ev.emit('call', [{ id: 'a', chatId: 'x@s.whatsapp.net', from: 'x@s.whatsapp.net', status: 'offer', isVideo: false, date: new Date() }]);
	await sock.ev.emit('call', [{ id: 'b', chatId: 'x@s.whatsapp.net', from: 'x@s.whatsapp.net', status: 'offer', isVideo: true, date: new Date() }]);
	assert.deepEqual(rejected, ['b'], 'predicate decides per call');
	// handler without socket never throws
	const bare = createCallGuard({ autoReject: true });
	await bare.handler([{ id: 'c', chatId: 'y@s.whatsapp.net', from: 'y@s.whatsapp.net', status: 'offer', date: new Date() }]);
	assert.equal(bare.getCallCount('y@s.whatsapp.net'), 1);
});

test('call guard LRU cap', async () => {
	const guard = createCallGuard({ maxCalls: 2 });
	for (let i = 0; i < 4; i++) {
		await guard.handler([{ id: `c${i}`, chatId: 'z@s.whatsapp.net', from: 'z@s.whatsapp.net', status: 'offer', date: new Date() }]);
	}
	assert.equal(guard.size, 2);
	assert.equal(guard.getCall('c0'), undefined, 'oldest evicted');
	assert.ok(guard.getCall('c3'));
});

// ------------------------------------------------------------- group events

test('group events tracker dispatches per-action callbacks and keeps a log', async () => {
	const sock = { ev: makeEv() };
	const tracker = createGroupEventsTracker();
	tracker.bind(sock);
	const joins = [];
	const leaves = [];
	const promos = [];
	const demos = [];
	const updates = [];
	const any = [];
	tracker.onJoin(e => joins.push(e));
	tracker.onLeave(e => leaves.push(e));
	tracker.onPromote(e => promos.push(e));
	tracker.onDemote(e => demos.push(e));
	tracker.onGroupUpdate(e => updates.push(e));
	tracker.onAny(e => any.push(e));

	await sock.ev.emit('group-participants.update', { id: 'g1@g.us', action: 'add', participants: ['a@s.whatsapp.net'], author: 'adm@s.whatsapp.net' });
	await sock.ev.emit('group-participants.update', { id: 'g1@g.us', action: 'remove', participants: ['b@s.whatsapp.net'] });
	await sock.ev.emit('group-participants.update', { id: 'g2@g.us', action: 'promote', participants: ['c@s.whatsapp.net'] });
	await sock.ev.emit('group-participants.update', { id: 'g2@g.us', action: 'demote', participants: ['c@s.whatsapp.net'] });
	await sock.ev.emit('groups.update', [{ id: 'g1@g.us', subject: 'Renamed' }]);

	assert.equal(joins.length, 1);
	assert.equal(joins[0].author, 'adm@s.whatsapp.net');
	assert.equal(leaves.length, 1);
	assert.equal(promos.length, 1);
	assert.equal(demos.length, 1);
	assert.equal(updates.length, 1);
	assert.equal(updates[0].update.subject, 'Renamed');
	assert.equal(any.length, 5, 'onAny sees everything');
	assert.equal(tracker.getEvents('g1@g.us').length, 3, 'per-group filter');
	assert.equal(tracker.getEvents().length, 5);
	tracker.unbind();
	assert.equal(sock.ev.count('group-participants.update'), 0);
	assert.equal(sock.ev.count('groups.update'), 0);
});

test('group events tracker LRU cap and malformed input safety', async () => {
	const tracker = createGroupEventsTracker({ maxEvents: 3 });
	for (let i = 0; i < 5; i++) {
		tracker.participantsHandler({ id: 'g@g.us', action: 'add', participants: [`u${i}@s.whatsapp.net`] });
	}
	assert.equal(tracker.size, 3, 'log capped');
	assert.equal(tracker.getEvents()[0].participants[0], 'u2@s.whatsapp.net', 'oldest evicted first');
	// malformed events must be ignored, not throw
	tracker.participantsHandler(undefined);
	tracker.participantsHandler({ id: 'g@g.us' });
	tracker.groupsHandler(undefined);
	tracker.groupsHandler([null, { noId: true }]);
	assert.equal(tracker.size, 3);
});

// ---------------------------------------------------------------- serialize

test('serializeMessage flattens a group text with quote and mentions', async () => {
	const sent = [];
	const sock = {
		user: { id: 'me:5@s.whatsapp.net' },
		sendMessage: async (jid, content, options) => {
			sent.push([jid, content, options]);
			return { status: 'ok' };
		}
	};
	const msg = {
		key: { remoteJid: 'g1@g.us', fromMe: false, id: 'M1', participant: 'u@s.whatsapp.net' },
		pushName: 'Udin',
		messageTimestamp: 1727400000,
		message: {
			extendedTextMessage: {
				text: 'hello world',
				contextInfo: {
					stanzaId: 'Q1',
					participant: 'me@s.whatsapp.net',
					mentionedJid: ['x@s.whatsapp.net'],
					quotedMessage: { conversation: 'original' }
				}
			}
		}
	};
	const m = serializeMessage(sock, msg);
	assert.equal(m.chat, 'g1@g.us');
	assert.equal(m.sender, 'u@s.whatsapp.net');
	assert.equal(m.isGroup, true);
	assert.equal(m.fromMe, false);
	assert.equal(m.type, 'extendedTextMessage');
	assert.equal(m.body, 'hello world');
	assert.equal(m.pushName, 'Udin');
	assert.equal(m.timestamp, 1727400000);
	assert.deepEqual(m.mentions, ['x@s.whatsapp.net']);
	assert.equal(m.quoted.body, 'original');
	assert.equal(m.quoted.key.id, 'Q1');
	assert.equal(m.quoted.key.fromMe, true, 'quoted sender matches sock.user → fromMe');
	assert.equal(m.quoted.key.participant, 'me@s.whatsapp.net');

	await m.reply('pong');
	assert.equal(sent[0][0], 'g1@g.us');
	assert.equal(sent[0][1].text, 'pong');
	assert.equal(sent[0][2].quoted, msg, 'reply quotes the original raw message');
	await m.react('👍');
	assert.equal(sent[1][1].react.text, '👍');
	assert.equal(sent[1][1].react.key.id, 'M1');
	await m.send({ text: 'plain' });
	assert.equal(sent[2][2].quoted, undefined, 'send() does not quote');
});

test('serializeMessage handles media, DMs, view-once wrappers and null socket', () => {
	const media = serializeMessage(null, {
		key: { remoteJid: 'u@s.whatsapp.net', id: 'M2' },
		message: { imageMessage: { caption: 'pic', url: 'x' } }
	});
	assert.equal(media.isGroup, false);
	assert.equal(media.sender, 'u@s.whatsapp.net');
	assert.equal(media.isMedia, true);
	assert.equal(media.type, 'imageMessage');
	assert.equal(media.body, 'pic');
	assert.equal(media.quoted, null);
	assert.throws(() => media.reply('x'), /no socket/);

	const wrapped = serializeMessage(null, {
		key: { remoteJid: 'u@s.whatsapp.net', id: 'M3' },
		message: { viewOnceMessageV2: { message: { videoMessage: { caption: 'once' } } } }
	});
	assert.equal(wrapped.type, 'videoMessage', 'normalizeMessageContent unwraps view-once');
	assert.equal(wrapped.isMedia, true);

	assert.equal(serializeMessage(null, null), null);
	assert.equal(serializeMessage(null, {}), null);
	const stub = serializeMessage(null, { key: { remoteJid: 'u@s.whatsapp.net', id: 'S1' } });
	assert.equal(stub.body, '', 'stub message serializes with empty body');
	assert.equal(stub.type, undefined);
});

// ---------------------------------------------------------------- view-once

test('view-once detection and unwrapping (wrapper + flag forms)', () => {
	const wrapped = { key: { remoteJid: 'u@s.whatsapp.net', id: 'V1' }, message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'secret' } } } } };
	const flagged = { key: { remoteJid: 'u@s.whatsapp.net', id: 'V2' }, message: { videoMessage: { viewOnce: true, seconds: 5 } } };
	const ephemeralWrapped = { key: { remoteJid: 'u@s.whatsapp.net', id: 'V3' }, message: { ephemeralMessage: { message: { viewOnceMessage: { message: { audioMessage: { seconds: 3 } } } } } } };
	const normal = { key: { remoteJid: 'u@s.whatsapp.net', id: 'N1' }, message: { conversation: 'hi' } };

	assert.equal(isViewOnceMessage(wrapped), true);
	assert.equal(isViewOnceMessage(flagged), true);
	assert.equal(isViewOnceMessage(ephemeralWrapped), true, 'view-once inside ephemeral detected');
	assert.equal(isViewOnceMessage(normal), false);
	assert.equal(isViewOnceMessage(null), false);

	const u1 = unwrapViewOnce(wrapped);
	assert.equal(u1.type, 'imageMessage');
	assert.equal(u1.mediaType, 'image');
	assert.equal(u1.media.caption, 'secret');
	const u2 = unwrapViewOnce(flagged);
	assert.equal(u2.mediaType, 'video');
	assert.equal(u2.media.seconds, 5);
	const u3 = unwrapViewOnce(ephemeralWrapped);
	assert.equal(u3.mediaType, 'audio');
	assert.equal(unwrapViewOnce(normal), null);
});

test('view-once capture stores only view-once messages, LRU-capped', async () => {
	const sock = { ev: makeEv() };
	const capture = createViewOnceCapture({ maxMessages: 2 });
	capture.bind(sock);
	const seen = [];
	capture.onViewOnce(({ unwrapped }) => seen.push(unwrapped.mediaType));

	const vo = (id, field) => ({ key: { remoteJid: 'u@s.whatsapp.net', id }, message: { viewOnceMessageV2: { message: { [field]: {} } } } });
	await sock.ev.emit('messages.upsert', {
		messages: [
			vo('V1', 'imageMessage'),
			{ key: { remoteJid: 'u@s.whatsapp.net', id: 'N1' }, message: { conversation: 'hi' } },
			vo('V2', 'videoMessage')
		]
	});
	assert.deepEqual(seen, ['image', 'video']);
	assert.equal(capture.size, 2);
	assert.equal(capture.get({ remoteJid: 'u@s.whatsapp.net', id: 'N1' }), undefined, 'normal messages not stored');
	await sock.ev.emit('messages.upsert', { messages: [vo('V3', 'audioMessage')] });
	assert.equal(capture.size, 2, 'LRU cap enforced');
	assert.equal(capture.get({ remoteJid: 'u@s.whatsapp.net', id: 'V1' }), undefined, 'oldest evicted');
	assert.ok(capture.get({ remoteJid: 'u@s.whatsapp.net', id: 'V3' }));
	capture.unbind();
	assert.equal(sock.ev.count('messages.upsert'), 0);
});

// ---------------------------------------------------------------- anti-link

test('extractLinks and containsGroupInvite', () => {
	assert.deepEqual(
		extractLinks('go to https://example.com/x?a=1, then www.foo.id now'),
		['https://example.com/x?a=1', 'www.foo.id']
	);
	assert.deepEqual(extractLinks('no links here'), []);
	assert.deepEqual(extractLinks(''), []);
	assert.deepEqual(extractLinks(null), []);
	assert.equal(containsGroupInvite(`join ${INVITE}`), true);
	assert.equal(containsGroupInvite('https://example.com'), false);
});

test('anti-link guard: invite-only mode, group-only, auto-delete', async () => {
	const deletions = [];
	const sock = { ev: makeEv(), sendMessage: async (jid, content) => deletions.push([jid, content]) };
	const guard = createAntiLinkGuard({ autoDelete: true });
	guard.bind(sock);
	const hits = [];
	guard.onDetected(d => hits.push(d));

	const mk = (id, chat, text, fromMe = false) => ({
		key: { remoteJid: chat, id, fromMe, participant: chat.endsWith('@g.us') ? 'u@s.whatsapp.net' : undefined },
		message: { conversation: text }
	});
	await sock.ev.emit('messages.upsert', {
		messages: [
			mk('1', 'g1@g.us', `join ${INVITE} now`),
			mk('2', 'g1@g.us', 'https://example.com plain link'), // not an invite → ignored
			mk('3', 'dm@s.whatsapp.net', INVITE), // DM → ignored (groupsOnly)
			mk('4', 'g1@g.us', `psst ${INVITE}`, true), // fromMe → ignored
			mk('5', 'g1@g.us', 'clean message')
		]
	});
	assert.equal(hits.length, 1);
	assert.equal(hits[0].key.id, '1');
	assert.equal(hits[0].inviteCode, 'AbCdEfGh1234567890');
	assert.equal(hits[0].sender, 'u@s.whatsapp.net');
	assert.equal(hits[0].deleted, true);
	assert.equal(deletions.length, 1);
	assert.equal(deletions[0][1].delete.id, '1', 'auto-delete targets the offending key');
	guard.unbind();
	assert.equal(sock.ev.count('messages.upsert'), 0);
});

test('anti-link guard: any-link mode with domain allowlist, chat allowlist, caption coverage', async () => {
	const guard = createAntiLinkGuard({
		inviteLinksOnly: false,
		allowedDomains: ['example.com'],
		allowlist: ['ok@g.us']
	});
	const hits = [];
	guard.onDetected(d => hits.push(d));

	await guard.handler({
		messages: [
			{ key: { remoteJid: 'g2@g.us', id: 'A', participant: 'u@s.whatsapp.net' }, message: { conversation: 'see https://sub.example.com/fine and https://evil.io/x' } },
			{ key: { remoteJid: 'ok@g.us', id: 'B', participant: 'u@s.whatsapp.net' }, message: { conversation: 'https://evil.io/y' } },
			{ key: { remoteJid: 'g2@g.us', id: 'C', participant: 'u@s.whatsapp.net' }, message: { imageMessage: { caption: 'buy https://spam.biz' } } }
		]
	});
	assert.equal(hits.length, 2, 'allowlisted chat skipped');
	assert.deepEqual(hits[0].links, ['https://evil.io/x'], 'allowed domain (incl. subdomain) filtered out');
	assert.equal(hits[1].key.id, 'C', 'caption text inspected too');
	assert.deepEqual(hits[1].links, ['https://spam.biz']);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the bot toolkit', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['call-guard', 'group-events', 'serialize', 'view-once', 'anti-link']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
	}
	for (const dts of ['call-guard.d.ts', 'group-events.d.ts', 'serialize.d.ts', 'view-once.d.ts', 'anti-link.d.ts']) {
		const src = readFileSync(new URL(`../lib/Utils/${dts}`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${dts} declares its API`);
	}
});
