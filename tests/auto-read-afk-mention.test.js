// Tests for the auto-read binder, AFK manager, mention-all/hidetag helpers
// and the serializeMessage upgrades (view-once, expiration, forward, delete).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createAutoRead,
	createAfkManager,
	buildMentionAll,
	sendMentionAll,
	sendHideTag,
	serializeMessage
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

const mkMsg = (id, jid, fromMe = false) => ({ key: { id, remoteJid: jid, fromMe } });

// ---------------------------------------------------------------- auto-read

test('auto-read reads notify upserts with filters, skips own/status/history', async () => {
	const read = [];
	const sock = { ev: makeEv(), readMessages: async (keys) => read.push(...keys) };
	const reader = createAutoRead({ denylist: ['boss@s.whatsapp.net'] });
	reader.bind(sock);
	const batches = [];
	reader.onRead(keys => batches.push(keys.length));

	await sock.ev.emit('messages.upsert', {
		type: 'notify',
		messages: [
			mkMsg('1', 'a@s.whatsapp.net'),
			mkMsg('2', 'g@g.us'),
			mkMsg('3', 'boss@s.whatsapp.net'), // denylisted
			mkMsg('4', 'b@s.whatsapp.net', true), // own message
			mkMsg('5', 'status@broadcast') // status off by default
		]
	});
	await sock.ev.emit('messages.upsert', { type: 'append', messages: [mkMsg('6', 'c@s.whatsapp.net')] });

	assert.deepEqual(read.map(k => k.id), ['1', '2']);
	assert.equal(reader.count, 2);
	assert.deepEqual(batches, [2]);
	reader.unbind();
	assert.equal(sock.ev.count('messages.upsert'), 0);
});

test('auto-read pause/resume, allowlist mode and error surfacing', async () => {
	const read = [];
	const sock = { ev: makeEv(), readMessages: async (keys) => read.push(...keys) };
	const reader = createAutoRead({});
	reader.bind(sock);
	reader.pause();
	await sock.ev.emit('messages.upsert', { type: 'notify', messages: [mkMsg('1', 'a@s.whatsapp.net')] });
	assert.equal(read.length, 0, 'paused reader reads nothing');
	assert.equal(reader.isPaused, true);
	reader.resume();
	await sock.ev.emit('messages.upsert', { type: 'notify', messages: [mkMsg('2', 'a@s.whatsapp.net')] });
	assert.equal(read.length, 1);

	const only = [];
	const allow = createAutoRead({ allowlist: ['vip@g.us'] });
	await allow.handler(
		{ type: 'notify', messages: [mkMsg('3', 'vip@g.us'), mkMsg('4', 'other@g.us'), mkMsg('5', 'dm@s.whatsapp.net')] },
		{ readMessages: async (keys) => only.push(...keys) }
	);
	assert.deepEqual(only.map(k => k.id), ['3'], 'allowlist overrides group/dm flags');

	const errors = [];
	const failing = createAutoRead({});
	failing.onError(e => errors.push(e));
	await failing.handler(
		{ type: 'notify', messages: [mkMsg('6', 'a@s.whatsapp.net')] },
		{ readMessages: async () => { throw new Error('boom'); } }
	);
	assert.equal(errors.length, 1, 'readMessages failure surfaces via onError, never throws');
});

test('auto-read statusBroadcast opt-in and dms/groups flags', async () => {
	const read = [];
	const reader = createAutoRead({ statusBroadcast: true, dms: false, groups: true });
	await reader.handler(
		{
			type: 'notify',
			messages: [mkMsg('1', 'status@broadcast'), mkMsg('2', 'dm@s.whatsapp.net'), mkMsg('3', 'g@g.us')]
		},
		{ readMessages: async (keys) => read.push(...keys) }
	);
	assert.deepEqual(read.map(k => k.id), ['1', '3'], 'status read, dm skipped, group read');
});

// ---------------------------------------------------------------------- afk

test('afk manager records pings from mentions and quoted replies', async () => {
	const sock = { ev: makeEv() };
	const afk = createAfkManager();
	afk.bind(sock);
	const pings = [];
	afk.onAfkMention(e => pings.push(e));

	afk.setAfk('udin@s.whatsapp.net', 'lunch');
	assert.equal(afk.isAfk('udin@s.whatsapp.net'), true);
	assert.equal(afk.getAfk('udin@s.whatsapp.net').reason, 'lunch');
	assert.deepEqual(afk.getAfkUsers(), ['udin@s.whatsapp.net']);

	await sock.ev.emit('messages.upsert', {
		messages: [{
			key: { remoteJid: 'g@g.us', id: 'm1', participant: 'x@s.whatsapp.net' },
			message: { extendedTextMessage: { text: 'oi', contextInfo: { mentionedJid: ['udin@s.whatsapp.net'] } } }
		}]
	});
	await sock.ev.emit('messages.upsert', {
		messages: [{
			key: { remoteJid: 'g@g.us', id: 'm2', participant: 'y@s.whatsapp.net' },
			message: { extendedTextMessage: { text: 're', contextInfo: { participant: 'udin@s.whatsapp.net', stanzaId: 'q', quotedMessage: { conversation: 'old' } } } }
		}]
	});
	assert.equal(pings.length, 2, 'mention + quoted reply both ping');
	assert.equal(pings[0].afkUser, 'udin@s.whatsapp.net');
	assert.equal(pings[0].reason, 'lunch');
	assert.equal(pings[1].from, 'y@s.whatsapp.net');
	assert.equal(afk.getAfk('udin@s.whatsapp.net').missed.length, 2);
	afk.unbind();
	assert.equal(sock.ev.count('messages.upsert'), 0);
});

test('afk manager auto-return, manual setBack and self-ping exclusion', async () => {
	const afk = createAfkManager();
	const returns = [];
	afk.onReturn(s => returns.push(s));
	afk.setAfk('a@s.whatsapp.net', 'away');
	afk.setAfk('b@s.whatsapp.net');

	// AFK user mentioning THEMSELVES must not ping
	afk.handler({
		messages: [{
			key: { remoteJid: 'g@g.us', id: 'm0', participant: 'x@s.whatsapp.net' },
			message: { extendedTextMessage: { text: 'hm', contextInfo: { mentionedJid: [] } } }
		}]
	});
	// AFK user speaks → auto return with summary
	afk.handler({
		messages: [{
			key: { remoteJid: 'g@g.us', id: 'm1', participant: 'a@s.whatsapp.net' },
			message: { conversation: 'back!' }
		}]
	});
	assert.equal(afk.isAfk('a@s.whatsapp.net'), false);
	assert.equal(returns.length, 1);
	assert.equal(returns[0].user, 'a@s.whatsapp.net');
	assert.ok(returns[0].awayMs >= 0);

	const summary = afk.setBack('b@s.whatsapp.net');
	assert.equal(summary.user, 'b@s.whatsapp.net');
	assert.equal(afk.size, 0);
	assert.equal(afk.setBack('b@s.whatsapp.net'), null, 'double setBack returns null');

	// autoReturn: false keeps the user AFK when they speak
	const manual = createAfkManager({ autoReturn: false });
	manual.setAfk('c@s.whatsapp.net');
	manual.handler({ messages: [{ key: { remoteJid: 'dm@s.whatsapp.net', id: 'm2' }, message: { conversation: 'hi' } }] });
	assert.equal(manual.isAfk('c@s.whatsapp.net'), true);
});

test('afk manager caps missed pings per user', () => {
	const afk = createAfkManager({ maxMissedPerUser: 2 });
	afk.setAfk('u@s.whatsapp.net');
	for (let i = 0; i < 4; i++) {
		afk.handler({
			messages: [{
				key: { remoteJid: 'g@g.us', id: `m${i}`, participant: 'x@s.whatsapp.net' },
				message: { extendedTextMessage: { text: 'hi', contextInfo: { mentionedJid: ['u@s.whatsapp.net'] } } }
			}]
		});
	}
	const entry = afk.getAfk('u@s.whatsapp.net');
	assert.equal(entry.missed.length, 2, 'oldest pings dropped');
	assert.equal(entry.missed[0].keyId, 'm2');
});

// -------------------------------------------------------------- mention-all

test('buildMentionAll builds text + mentions from mixed participant shapes', () => {
	const parts = [{ id: 'a@s.whatsapp.net' }, { id: 'b@s.whatsapp.net', admin: 'admin' }, 'c@s.whatsapp.net', { noId: true }];
	const content = buildMentionAll(parts, 'Meeting!');
	assert.deepEqual(content.mentions, ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']);
	assert.ok(content.text.startsWith('Meeting!'));
	assert.ok(content.text.includes('@a'));
	assert.ok(content.text.includes('@c'));

	const bare = buildMentionAll(parts);
	assert.ok(bare.text.includes('@a'), 'no base text → tag line only');
	const silent = buildMentionAll(parts, 'Just this', { listMentions: false });
	assert.equal(silent.text, 'Just this', 'listMentions:false keeps text clean');
	assert.equal(silent.mentions.length, 3);
});

test('sendMentionAll and sendHideTag fetch metadata and send correctly', async () => {
	const parts = [{ id: 'a@s.whatsapp.net' }, { id: 'b@s.whatsapp.net' }];
	const sent = [];
	let metaCalls = 0;
	const sock = {
		groupMetadata: async (jid) => {
			metaCalls++;
			assert.equal(jid, 'g@g.us');
			return { participants: parts };
		},
		sendMessage: async (jid, content, options) => {
			sent.push([jid, content, options]);
			return { ok: 1 };
		}
	};
	await sendMentionAll(sock, 'g@g.us', 'Everyone!');
	await sendHideTag(sock, 'g@g.us', 'silent ping');
	await sendHideTag(sock, 'g@g.us', { text: 'obj form' }, { participants: parts });

	assert.equal(metaCalls, 2, 'participants option skips metadata fetch');
	assert.equal(sent[0][1].mentions.length, 2);
	assert.ok(sent[0][1].text.includes('@a'));
	assert.equal(sent[1][1].text, 'silent ping');
	assert.ok(!sent[1][1].text.includes('@a'), 'hidetag text stays clean');
	assert.equal(sent[1][1].mentions.length, 2);
	assert.equal(sent[2][1].text, 'obj form');
});

// ------------------------------------------------------- serialize upgrades

test('serializeMessage exposes view-once info, expiration, forward and delete', async () => {
	const sent = [];
	const sock = {
		user: { id: 'me:1@s.whatsapp.net' },
		sendMessage: async (jid, content, options) => {
			sent.push([jid, content, options]);
			return { ok: 1 };
		}
	};
	const vo = {
		key: { remoteJid: 'u@s.whatsapp.net', id: 'V1' },
		message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'secret' } } } }
	};
	const m = serializeMessage(sock, vo);
	assert.equal(m.isViewOnce, true);
	assert.equal(m.viewOnce.mediaType, 'image');
	assert.equal(m.viewOnce.media.caption, 'secret');

	await m.forward('other@s.whatsapp.net');
	assert.equal(sent[0][0], 'other@s.whatsapp.net');
	assert.equal(sent[0][1].forward, vo, 'forward wraps the raw message');
	await m.delete();
	assert.equal(sent[1][1].delete.id, 'V1');

	const eph = serializeMessage(null, {
		key: { remoteJid: 'u@s.whatsapp.net', id: 'E1' },
		message: { extendedTextMessage: { text: 'x', contextInfo: { expiration: 86400 } } }
	});
	assert.equal(eph.expiration, 86400);
	assert.equal(eph.isViewOnce, false);
	assert.equal(eph.viewOnce, null);
	assert.throws(() => eph.forward('x@s.whatsapp.net'), /no socket/);
	assert.throws(() => eph.delete(), /no socket/);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the new modules', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['auto-read', 'afk']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
	}
	for (const dts of ['auto-read.d.ts', 'afk.d.ts']) {
		const src = readFileSync(new URL(`../lib/Utils/${dts}`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${dts} declares its API`);
	}
	const textToolsDts = readFileSync(new URL('../lib/Utils/text-tools.d.ts', import.meta.url), 'utf8');
	for (const name of ['buildMentionAll', 'sendMentionAll', 'sendHideTag']) {
		assert.ok(textToolsDts.includes(name), `text-tools.d.ts declares ${name}`);
	}
	const serializeDts = readFileSync(new URL('../lib/Utils/serialize.d.ts', import.meta.url), 'utf8');
	for (const field of ['isViewOnce', 'viewOnce', 'expiration', 'forward(', 'delete()']) {
		assert.ok(serializeDts.includes(field), `serialize.d.ts declares ${field}`);
	}
});
