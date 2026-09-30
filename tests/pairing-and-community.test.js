// Tests for the pairing upgrade (custom-code normalization, code lifecycle,
// completion waiting) and the community/moderation pack: flood guard,
// word filter, warn manager, gatekeeper and level system.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	normalizePairingCode,
	isValidPairingCode,
	isPairingCodeExpired,
	getPairingCodeInfo,
	waitForPairingSuccess,
	pairWithCode,
	DEFAULT_PAIRING_CODE_TTL_MS,
	createFloodGuard,
	createWordFilter,
	createWarnManager,
	createGatekeeper,
	createLevelSystem,
	DisconnectReason
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

// ------------------------------------------------------------ pairing tools

test('normalizePairingCode accepts human formats and rejects invalid codes', () => {
	assert.equal(normalizePairingCode('abcd-efgh'), 'ABCDEFGH');
	assert.equal(normalizePairingCode(' 1234 5678 '), '12345678');
	assert.equal(normalizePairingCode('AB-CD-EF-GH'), 'ABCDEFGH');
	assert.throws(() => normalizePairingCode('SHORT'), /8 characters/);
	// WhatsApp accepts any 8 alphanumeric chars — O, U, I and 0 are all valid.
	assert.equal(normalizePairingCode('ABCDEFG0'), 'ABCDEFG0', 'zero is allowed');
	assert.equal(normalizePairingCode('ABCDEFGO'), 'ABCDEFGO', 'O is allowed');
	assert.throws(() => normalizePairingCode('ABCDEF@1'), /alphanumeric/, 'symbols are rejected');
	assert.equal(isValidPairingCode('wxyz-2345'), true);
	assert.equal(isValidPairingCode('OOOOOOOO'), true); // all-O is a valid custom code
	assert.equal(isValidPairingCode('!!!!!!!!'), false);
	assert.equal(isValidPairingCode(''), false);
});

test('pairing code lifecycle: freshness and info', () => {
	const fresh = { pairingCode: 'ABCDEFGH', pairingCodeRequestedAt: Date.now() - 1_000 };
	assert.equal(isPairingCodeExpired(fresh), false);
	assert.equal(isPairingCodeExpired(fresh, 500), true, 'custom TTL respected');
	assert.equal(isPairingCodeExpired({ pairingCode: 'ABCDEFGH' }), null, 'unknown when no request time');
	assert.equal(isPairingCodeExpired(undefined), null);

	const info = getPairingCodeInfo(fresh);
	assert.equal(info.formatted, 'ABCD-EFGH');
	assert.equal(info.expired, false);
	assert.ok(info.remainingMs > 0 && info.remainingMs <= DEFAULT_PAIRING_CODE_TTL_MS);
	assert.equal(info.expiresAt, fresh.pairingCodeRequestedAt + DEFAULT_PAIRING_CODE_TTL_MS);
	assert.equal(getPairingCodeInfo({}), null);
	assert.equal(getPairingCodeInfo({ pairingCode: 'ABCDEFGH' }).expired, null);
});

test('waitForPairingSuccess resolves on new login, restart-required and open; rejects on logout', async () => {
	const viaNewLogin = { ev: makeEv() };
	const p1 = waitForPairingSuccess(viaNewLogin, { timeoutMs: 5000 });
	await viaNewLogin.ev.emit('connection.update', { isNewLogin: true });
	assert.deepEqual(await p1, { isNewLogin: true, restartRequired: true });
	assert.equal(viaNewLogin.ev.count('connection.update'), 0, 'listener cleaned up');

	const viaRestart = { ev: makeEv() };
	const p2 = waitForPairingSuccess(viaRestart, { timeoutMs: 5000 });
	await viaRestart.ev.emit('connection.update', {
		connection: 'close',
		lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } }
	});
	assert.equal((await p2).restartRequired, true, 'post-pairing 515 close counts as success');

	const viaOpen = { ev: makeEv() };
	const p3 = waitForPairingSuccess(viaOpen, { timeoutMs: 5000 });
	await viaOpen.ev.emit('connection.update', { connection: 'open' });
	assert.equal((await p3).open, true);

	const loggedOut = { ev: makeEv() };
	const p4 = waitForPairingSuccess(loggedOut, { timeoutMs: 5000 });
	await loggedOut.ev.emit('connection.update', {
		connection: 'close',
		lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } }
	});
	await assert.rejects(p4, /logged out/);
});

test('pairWithCode requests, normalizes custom code and waits for completion', async () => {
	const calls = [];
	const sock = {
		ev: makeEv(),
		requestPairingCode: async (phone, custom) => {
			calls.push([phone, custom]);
			return custom || 'WXYZ2345';
		}
	};
	const shown = [];
	const flow = pairWithCode(sock, '628123456789', {
		customCode: 'abcd-efgh',
		onCode: (code, formatted) => shown.push([code, formatted])
	});
	await new Promise(r => setTimeout(r, 10));
	await sock.ev.emit('connection.update', { isNewLogin: true });
	const result = await flow;

	assert.deepEqual(calls, [['628123456789', 'ABCDEFGH']], 'custom code normalized before request');
	assert.equal(result.code, 'ABCDEFGH');
	assert.equal(result.formatted, 'ABCD-EFGH');
	assert.equal(result.restartRequired, true);
	assert.deepEqual(shown, [['ABCDEFGH', 'ABCD-EFGH']]);

	const quick = await pairWithCode(
		{ ev: makeEv(), requestPairingCode: async () => 'WXYZ2345' },
		'628123456789',
		{ wait: false }
	);
	assert.equal(quick.formatted, 'WXYZ-2345');
	assert.equal('open' in quick, false, 'wait:false returns immediately');
});

test('socket.requestPairingCode source contract: separator stripping + requestedAt', () => {
	const src = readFileSync(new URL('../lib/Socket/socket.js', import.meta.url), 'utf8');
	const fnStart = src.indexOf('const requestPairingCode');
	assert.ok(fnStart > -1);
	const body = src.slice(fnStart, fnStart + 3500);
	assert.match(body, /replace\(\/\[\\s-\]\+\/g, ''\)\.toUpperCase\(\)/, 'custom code separators stripped before validation');
	assert.match(body, /pairingCodeRequestedAt = Date\.now\(\)/, 'request time recorded on creds');
	const authTypes = readFileSync(new URL('../lib/Types/Auth.d.ts', import.meta.url), 'utf8');
	assert.match(authTypes, /pairingCodeRequestedAt\?: number/, 'creds type declares the new field');
});

// -------------------------------------------------------------- flood guard

test('flood guard fires once per burst and tracks counts', () => {
	const guard = createFloodGuard({ maxMessages: 3, windowMs: 60_000 });
	const floods = [];
	guard.onFlood(e => floods.push(e));
	const mk = (id) => ({ key: { remoteJid: 'g@g.us', id, participant: 'u@s.whatsapp.net' }, message: { conversation: 'x' } });
	for (let i = 0; i < 5; i++) {
		guard.handler({ messages: [mk(`m${i}`)] });
	}
	assert.equal(floods.length, 1, 'one alert per burst, not per message');
	assert.equal(floods[0].count, 3);
	assert.equal(floods[0].chat, 'g@g.us');
	assert.equal(guard.getCount('g@g.us', 'u@s.whatsapp.net'), 5);
	guard.reset('g@g.us', 'u@s.whatsapp.net');
	assert.equal(guard.getCount('g@g.us', 'u@s.whatsapp.net'), 0);
});

test('flood guard scoping: per chat+user, groupsOnly, fromMe skipped', () => {
	const guard = createFloodGuard({ maxMessages: 2, windowMs: 60_000 });
	const floods = [];
	guard.onFlood(e => floods.push(`${e.chat}|${e.user}`));
	const mk = (id, chat, user, fromMe = false) => ({ key: { remoteJid: chat, id, participant: user, fromMe }, message: { conversation: 'x' } });
	// two different users in the same chat: no single user floods
	guard.handler({ messages: [mk('1', 'g@g.us', 'a@s.whatsapp.net'), mk('2', 'g@g.us', 'b@s.whatsapp.net')] });
	assert.equal(floods.length, 0);
	// DM ignored with groupsOnly default
	guard.handler({ messages: [mk('3', 'dm@s.whatsapp.net', undefined), mk('4', 'dm@s.whatsapp.net', undefined)] });
	assert.equal(floods.length, 0);
	// own messages ignored
	guard.handler({ messages: [mk('5', 'g@g.us', 'a@s.whatsapp.net', true), mk('6', 'g@g.us', 'a@s.whatsapp.net', true)] });
	assert.equal(floods.length, 0);
	// same user twice → flood
	guard.handler({ messages: [mk('7', 'g@g.us', 'a@s.whatsapp.net')] });
	assert.deepEqual(floods, ['g@g.us|a@s.whatsapp.net']);
});

// -------------------------------------------------------------- word filter

test('word filter matches words on boundaries, phrases and regex patterns', () => {
	const filter = createWordFilter({
		words: ['judol', 'slot gacor'],
		patterns: [/p\s*i\s*n\s*j\s*o\s*l/i]
	});
	assert.equal(filter.test('main JUDOL yuk'), 'JUDOL', 'case-insensitive');
	assert.equal(filter.test('info slot gacor malam ini'), 'slot gacor', 'phrase match');
	assert.ok(filter.test('p i n j o l aman'), 'regex catches spaced evasion');
	assert.equal(filter.test('judolan'), null, 'word boundary respected');
	assert.equal(filter.test('bersih'), null);
	assert.equal(filter.test(''), null);

	filter.addWords('scam', ['penipu']);
	assert.equal(filter.test('awas SCAM'), 'SCAM');
	assert.equal(filter.test('dasar penipu!'), 'penipu', 'boundary works next to punctuation');
	filter.removeWords('judol');
	assert.equal(filter.test('main judol'), null);
	assert.ok(filter.getWords().includes('scam'));
});

test('word filter handler: captions inspected, auto-delete, allowlist', async () => {
	const deletions = [];
	const sock = { ev: makeEv(), sendMessage: async (jid, content) => deletions.push(content) };
	const filter = createWordFilter({ words: ['spam'], autoDelete: true, allowlist: ['free@g.us'] });
	filter.bind(sock);
	const hits = [];
	filter.onMatch(h => hits.push(h));

	await sock.ev.emit('messages.upsert', {
		messages: [
			{ key: { remoteJid: 'g@g.us', id: '1', participant: 'u@s.whatsapp.net' }, message: { imageMessage: { caption: 'ini SPAM banget' } } },
			{ key: { remoteJid: 'free@g.us', id: '2', participant: 'u@s.whatsapp.net' }, message: { conversation: 'spam bebas di sini' } },
			{ key: { remoteJid: 'g@g.us', id: '3', participant: 'u@s.whatsapp.net' }, message: { conversation: 'bersih' } }
		]
	});
	assert.equal(hits.length, 1, 'allowlisted chat exempt');
	assert.equal(hits[0].matched, 'SPAM');
	assert.equal(hits[0].deleted, true);
	assert.equal(deletions.length, 1);
	assert.equal(deletions[0].delete.id, '1');
	filter.unbind();
	assert.equal(sock.ev.count('messages.upsert'), 0);
});

// ------------------------------------------------------------- warn manager

test('warn manager: strikes, threshold event, pardon, per-chat isolation, persistence', () => {
	const warns = createWarnManager({ threshold: 3 });
	const thresholds = [];
	warns.onThreshold(t => thresholds.push(t));
	const all = [];
	warns.onWarn(w => all.push(w.count));

	warns.warn('u@s.whatsapp.net', { chat: 'g@g.us', reason: 'link', by: 'admin@s.whatsapp.net' });
	warns.warn('u@s.whatsapp.net', { chat: 'g@g.us', reason: 'toxic' });
	const third = warns.warn('u@s.whatsapp.net', { chat: 'g@g.us', reason: 'again' });
	assert.equal(third.count, 3);
	assert.equal(third.reachedThreshold, true);
	assert.equal(thresholds.length, 1);
	assert.equal(thresholds[0].warns.length, 3);
	assert.deepEqual(all, [1, 2, 3]);
	assert.equal(warns.getCount('u@s.whatsapp.net', 'other@g.us'), 0, 'per-chat isolation');
	assert.equal(warns.getWarns('u@s.whatsapp.net', 'g@g.us')[0].by, 'admin@s.whatsapp.net');

	assert.equal(warns.pardon('u@s.whatsapp.net', 'g@g.us'), 2);
	assert.equal(warns.pardon('nobody@s.whatsapp.net', 'g@g.us'), 0);
	assert.deepEqual(warns.list('g@g.us'), [{ user: 'u@s.whatsapp.net', chat: 'g@g.us', count: 2 }]);

	const restored = createWarnManager();
	restored.load(warns.toJSON());
	assert.equal(restored.getCount('u@s.whatsapp.net', 'g@g.us'), 2);

	warns.reset('u@s.whatsapp.net', 'g@g.us');
	assert.equal(warns.getCount('u@s.whatsapp.net', 'g@g.us'), 0);

	const global = createWarnManager({ perChat: false, threshold: 2 });
	global.warn('x@s.whatsapp.net', { chat: 'a@g.us' });
	global.warn('x@s.whatsapp.net', { chat: 'b@g.us' });
	assert.equal(global.getCount('x@s.whatsapp.net'), 2, 'global mode sums across chats');
});

// --------------------------------------------------------------- gatekeeper

test('gatekeeper bans users/chats and filters handler traffic', () => {
	const gate = createGatekeeper();
	gate.banUser('bad@s.whatsapp.net', 'spam');
	gate.banChat('toxic@g.us');
	const blocked = [];
	gate.onBlocked(b => blocked.push(b.user));
	const seen = [];
	const wrapped = gate.filter(({ messages }) => seen.push(...messages.map(m => m.key.id)));
	wrapped({
		messages: [
			{ key: { remoteJid: 'g@g.us', id: '1', participant: 'bad@s.whatsapp.net' } },
			{ key: { remoteJid: 'g@g.us', id: '2', participant: 'ok@s.whatsapp.net' } },
			{ key: { remoteJid: 'toxic@g.us', id: '3', participant: 'ok@s.whatsapp.net' } }
		]
	});
	assert.deepEqual(seen, ['2']);
	assert.equal(gate.blockedCount, 2);
	assert.equal(gate.getBanInfo('bad@s.whatsapp.net').reason, 'spam');
	assert.deepEqual(gate.getBannedChats(), ['toxic@g.us']);

	// all-banned batch: inner handler must not run at all
	const calls = [];
	const wrapped2 = gate.filter(() => calls.push(1));
	wrapped2({ messages: [{ key: { remoteJid: 'toxic@g.us', id: '4' } }] });
	assert.equal(calls.length, 0);

	gate.unbanUser('bad@s.whatsapp.net');
	assert.equal(gate.allows({ key: { remoteJid: 'g@g.us', participant: 'bad@s.whatsapp.net' } }), true);

	const restored = createGatekeeper();
	restored.load(gate.toJSON());
	assert.equal(restored.isBannedChat('toxic@g.us'), true);

	const priv = createGatekeeper({ mode: 'allowlist', allowedChats: ['vip@g.us'] });
	assert.equal(priv.allowsJid('any@s.whatsapp.net', 'vip@g.us'), true);
	assert.equal(priv.allowsJid('any@s.whatsapp.net', 'other@g.us'), false);
});

// ------------------------------------------------------------- level system

test('level system awards XP, levels up, ranks and persists', () => {
	const levels = createLevelSystem({ xpPerMessage: [10, 10], cooldownMs: 0, baseXp: 100 });
	const ups = [];
	levels.onLevelUp(e => ups.push(e));
	const mk = (id, user) => ({ key: { remoteJid: 'g@g.us', id, participant: user }, message: { conversation: 'x' } });

	for (let i = 0; i < 12; i++) {
		levels.handler({ type: 'notify', messages: [mk(`a${i}`, 'a@s.whatsapp.net')] });
	}
	for (let i = 0; i < 3; i++) {
		levels.handler({ type: 'notify', messages: [mk(`b${i}`, 'b@s.whatsapp.net')] });
	}
	const a = levels.getUser('a@s.whatsapp.net');
	assert.equal(a.xp, 120);
	assert.equal(a.level, 1, '100 XP curve: level 1 at 100');
	assert.equal(a.messages, 12);
	assert.equal(a.nextLevelXp, 400);
	assert.equal(ups.length, 1);
	assert.equal(ups[0].previousLevel, 0);

	const board = levels.getLeaderboard(5);
	assert.equal(board[0].user, 'a@s.whatsapp.net');
	assert.equal(board[0].rank, 1);
	assert.equal(board[1].xp, 30);
	assert.equal(levels.getLeaderboard(5, 'g@g.us').length, 2, 'per-chat leaderboard');

	assert.equal(levels.levelOf(399), 1);
	assert.equal(levels.levelOf(400), 2);
	assert.equal(levels.xpForLevel(3), 900);

	const restored = createLevelSystem();
	restored.load(levels.toJSON());
	assert.equal(restored.getUser('a@s.whatsapp.net').xp, 120);
});

test('level system: cooldown limits XP, history sync and own messages skipped', () => {
	const levels = createLevelSystem({ xpPerMessage: 10, cooldownMs: 60_000 });
	const mk = (id, extra = {}) => ({ key: { remoteJid: 'g@g.us', id, participant: 'u@s.whatsapp.net', ...extra }, message: { conversation: 'x' } });
	levels.handler({ type: 'notify', messages: [mk('1'), mk('2'), mk('3')] });
	const u = levels.getUser('u@s.whatsapp.net');
	assert.equal(u.xp, 10, 'only first message inside cooldown earns XP');
	assert.equal(u.messages, 3, 'all messages still counted');

	levels.handler({ type: 'append', messages: [mk('4')] });
	assert.equal(levels.getUser('u@s.whatsapp.net').messages, 3, 'history sync ignored');
	levels.handler({ type: 'notify', messages: [mk('5', { fromMe: true })] });
	assert.equal(levels.getUser('u@s.whatsapp.net').messages, 3, 'own messages ignored');

	const manual = levels.addXp('u@s.whatsapp.net', 90, 'g@g.us');
	assert.equal(manual.xp, 100);
	assert.equal(manual.level, 1, 'manual XP can level up too');
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the pairing tools and community pack', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['pairing-tools', 'flood-guard', 'word-filter', 'warn-manager', 'gatekeeper', 'level-system']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
});
