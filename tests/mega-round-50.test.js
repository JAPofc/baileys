// Tests for the 50+ item round: random-tools, jid-extras, time-tools,
// group-tools, msg-tools, kv-store (33 new features) plus 18 upgrades
// across text-extras, shop, notes, warns, stats, i18n, levels, quota,
// tiers, birthday, guess-game, flood, gatekeeper, health and watchdog.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	rollDice, flipCoin, randomInt, randomPick, shuffle, weightedPick, hashRating, matchScore,
	phoneToJid, jidToPhone, sameUser, deviceOf, prettyPhone,
	formatRelative, formatClock, parseClockTime, nextOccurrence, isWithinHours, getGreeting,
	getGroupAdmins, isGroupAdmin, getGroupOwner, getGroupStats, diffParticipants, formatGroupInfo,
	messageTypeOf, isMediaMessage, getQuotedInfo, getMessageTimestampMs, summarizeMessage,
	createKVStore, titleCase, slugify, generateId,
	createShop, createEconomy, createNotes, createWarnManager, createCommandStats,
	createI18n, createLevelSystem, createQuotaManager, createTierManager,
	createBirthdayManager, createGuessGame, createFloodGuard, createGatekeeper,
	createHealthMonitor, createConnectionWatchdog
} from '../lib/index.js';

const seq = (values) => {
	let i = 0;
	return () => values[i++ % values.length];
};

// ------------------------------------------------------------- random tools

test('random tools: dice, coins, picks — deterministic via injectable RNG', () => {
	const roll = rollDice('2d6+3', { random: seq([0.5, 0.99]) });
	assert.deepEqual(roll.rolls, [4, 6]);
	assert.equal(roll.total, 13);
	assert.equal(roll.notation, '2d6+3');
	assert.equal(rollDice('d20', { random: () => 0 }).total, 1);
	assert.equal(rollDice('1d4-1', { random: () => 0.99 }).total, 3);
	assert.throws(() => rollDice('abc'), /invalid dice/);
	assert.throws(() => rollDice('999d6'), /out of range/);

	assert.equal(flipCoin({ random: () => 0.2 }), 'heads');
	assert.equal(flipCoin({ random: () => 0.8 }), 'tails');
	assert.equal(randomInt(1, 10, { random: () => 0 }), 1);
	assert.equal(randomInt(1, 10, { random: () => 0.999 }), 10);
	assert.equal(randomPick(['a', 'b', 'c'], { random: () => 0.99 }), 'c');
	assert.equal(randomPick([]), undefined);
	const original = [1, 2, 3, 4];
	const shuffled = shuffle(original, { random: () => 0 });
	assert.equal(shuffled.length, 4);
	assert.deepEqual(original, [1, 2, 3, 4], 'input untouched');
	assert.equal(weightedPick([{ value: 'rare', weight: 1 }, { value: 'common', weight: 9 }], { random: () => 0.05 }), 'rare');
	assert.equal(weightedPick([{ value: 'rare', weight: 1 }, { value: 'common', weight: 9 }], { random: () => 0.5 }), 'common');
	assert.equal(weightedPick([]), undefined);
});

test('hashRating and matchScore are deterministic and normalized', () => {
	assert.equal(hashRating('nasi goreng'), hashRating('NASI GORENG '));
	assert.ok(hashRating('x') >= 0 && hashRating('x') <= 100);
	assert.equal(matchScore('budi', 'ani'), matchScore('Ani', 'BUDI'), 'order independent');
	assert.ok(matchScore('a', 'b') >= 0 && matchScore('a', 'b') <= 100);
	assert.notEqual(hashRating('a'), hashRating('completely different'), 'inputs differentiate (statistically)');
});

// --------------------------------------------------------------- jid extras

test('jid extras: conversions, device handling, pretty phones', () => {
	assert.equal(phoneToJid('+62 812-3456-7890'), '6281234567890@s.whatsapp.net');
	assert.equal(phoneToJid('00628123'), '628123@s.whatsapp.net');
	assert.equal(phoneToJid('628123:5@s.whatsapp.net'), '628123@s.whatsapp.net');
	assert.throws(() => phoneToJid('0812345'), /leading 0|international/);

	assert.equal(jidToPhone('628123:9@s.whatsapp.net'), '628123');
	assert.equal(jidToPhone('g@g.us'), null);
	assert.equal(sameUser('a:12@s.whatsapp.net', 'a@s.whatsapp.net'), true);
	assert.equal(sameUser('a@s.whatsapp.net', 'b@s.whatsapp.net'), false);
	assert.equal(deviceOf('a:12@s.whatsapp.net'), 12);
	assert.equal(deviceOf('a@s.whatsapp.net'), null);
	assert.equal(prettyPhone('6281234567890'), '+62 812-3456-7890');
	assert.equal(prettyPhone('6281234567890', { style: 'plain' }), '6281234567890');
	assert.equal(prettyPhone('junk'), null);
});

// --------------------------------------------------------------- time tools

test('time tools: relative, clocks, occurrences, windows, greetings', () => {
	const now = Date.now();
	assert.equal(formatRelative(now - 300_000, { now }), '5m ago');
	assert.equal(formatRelative(now + 7_200_000, { now }), 'in 2h');
	assert.equal(formatRelative(now, { now }), 'just now');
	assert.equal(formatClock(5_025_000), '01:23:45');
	assert.equal(formatClock(90_061_000), '1:01:01:01');
	assert.deepEqual(parseClockTime('22:05'), { hour: 22, minute: 5 });
	assert.throws(() => parseClockTime('25:00'), /invalid time/);

	const anchor = new Date('2026-09-27T10:00:00').getTime();
	assert.equal(nextOccurrence('11:00', { now: anchor }), new Date('2026-09-27T11:00:00').getTime());
	assert.equal(nextOccurrence('09:00', { now: anchor }), new Date('2026-09-28T09:00:00').getTime(), 'past time rolls to tomorrow');
	assert.equal(isWithinHours('23:30', '22:00', '06:00'), true, 'overnight window');
	assert.equal(isWithinHours('12:00', '22:00', '06:00'), false);
	assert.equal(isWithinHours('10:00', '09:00', '17:00'), true);
	assert.equal(getGreeting(9, 'id'), 'Selamat pagi');
	assert.equal(getGreeting(13, 'id'), 'Selamat siang');
	assert.equal(getGreeting(20, 'en'), 'Good evening');
});

// -------------------------------------------------------------- group tools

test('group tools: admins, owner, stats, participant diffs, info card', () => {
	const meta = {
		subject: 'Grup A',
		desc: 'deskripsi',
		restrict: false,
		announce: true,
		participants: [
			{ id: 'own@s.whatsapp.net', admin: 'superadmin' },
			{ id: 'adm@s.whatsapp.net', admin: 'admin' },
			{ id: 'u1@s.whatsapp.net', admin: null },
			{ id: 'u2@s.whatsapp.net', admin: null }
		]
	};
	assert.deepEqual(getGroupAdmins(meta), ['own@s.whatsapp.net', 'adm@s.whatsapp.net']);
	assert.equal(isGroupAdmin(meta, 'adm:7@s.whatsapp.net'), true, 'device suffix tolerated');
	assert.equal(isGroupAdmin(meta, 'u1@s.whatsapp.net'), false);
	assert.equal(getGroupOwner(meta), 'own@s.whatsapp.net');
	assert.deepEqual(getGroupStats(meta), { total: 4, superadmins: 1, admins: 1, members: 2 });

	const after = [
		{ id: 'own@s.whatsapp.net', admin: 'superadmin' },
		{ id: 'u1@s.whatsapp.net', admin: 'admin' },
		{ id: 'u3@s.whatsapp.net', admin: null },
		{ id: 'adm@s.whatsapp.net', admin: null }
	];
	const diff = diffParticipants(meta.participants, after);
	assert.deepEqual(diff.added, ['u3@s.whatsapp.net']);
	assert.deepEqual(diff.removed, ['u2@s.whatsapp.net']);
	assert.deepEqual(diff.promoted, ['u1@s.whatsapp.net']);
	assert.deepEqual(diff.demoted, ['adm@s.whatsapp.net']);

	const card = formatGroupInfo(meta);
	assert.ok(card.includes('Grup A') && card.includes('Members: 4 (2 admin)') && card.includes('deskripsi'));
});

// ------------------------------------------------------------ message tools

test('message tools: type detection, quotes, timestamps, previews', () => {
	const textMsg = { key: {}, message: { conversation: 'halo dunia' }, messageTimestamp: 1_760_000_000 };
	const imgMsg = { key: {}, message: { imageMessage: { caption: 'foto liburan' } } };
	assert.equal(messageTypeOf(textMsg), 'text');
	assert.equal(messageTypeOf(imgMsg), 'image');
	assert.equal(messageTypeOf({ message: { reactionMessage: {} } }), 'reaction');
	assert.equal(messageTypeOf({ message: { viewOnceMessageV2: { message: { videoMessage: {} } } } }), 'video');
	assert.equal(messageTypeOf(null), 'unknown');
	assert.equal(isMediaMessage(imgMsg), true);
	assert.equal(isMediaMessage(textMsg), false);

	const quoted = { message: { extendedTextMessage: { text: 're', contextInfo: { participant: 'q@s', stanzaId: 'Z1', quotedMessage: { conversation: 'asli' } } } } };
	assert.equal(getQuotedInfo(quoted).stanzaId, 'Z1');
	assert.equal(getQuotedInfo(quoted).message.conversation, 'asli');
	assert.equal(getQuotedInfo(textMsg), null);

	assert.equal(getMessageTimestampMs(textMsg), 1_760_000_000_000, 'seconds converted to ms');
	assert.equal(getMessageTimestampMs({ messageTimestamp: { toNumber: () => 5 } }), 5000, 'Long objects handled');
	assert.equal(getMessageTimestampMs({}), null);

	assert.equal(summarizeMessage(textMsg), '💬 text: halo dunia');
	assert.ok(summarizeMessage(imgMsg).startsWith('📷 image: foto liburan'));
	assert.ok(summarizeMessage({ message: { locationMessage: {} } }).startsWith('📍 location'));
	assert.ok(summarizeMessage(textMsg, { maxLength: 4 }).includes('halo…'));
});

// ----------------------------------------------------------------- kv store

test('kv store: namespaces, counters, atomic persistence roundtrip', async () => {
	const file = join(tmpdir(), `jap-kv-${Date.now()}.json`);
	const db = await createKVStore(file, { debounceMs: 10 });
	db.set('owner', '628@s.whatsapp.net');
	assert.equal(db.increment('hits'), 1);
	assert.equal(db.increment('hits', 4), 5);

	const settings = db.namespace('settings');
	settings.set('g@g.us', { welcome: true });
	assert.equal(settings.get('g@g.us').welcome, true);
	assert.equal(db.get('g@g.us'), undefined, 'namespaces are isolated');
	assert.deepEqual(Object.keys(db.all()), ['owner', 'hits'], 'root all() hides namespaces');
	assert.deepEqual(settings.keys(), ['g@g.us']);
	assert.throws(() => db.namespace('a:b'), /without ":"/);
	assert.equal(db.get('missing', 'fallback'), 'fallback');

	await db.flush();
	const reopened = await createKVStore(file);
	assert.equal(reopened.get('hits'), 5);
	assert.equal(reopened.namespace('settings').get('g@g.us').welcome, true);
	assert.equal(reopened.delete('owner'), true);
	assert.equal(reopened.has('owner'), false);
	settings.clear();
	assert.deepEqual(settings.all(), {});
	assert.deepEqual(db.all(), { owner: '628@s.whatsapp.net', hits: 5 }, 'clear() scoped to the namespace');

	const memory = await createKVStore(); // no file
	memory.set('x', 1);
	await memory.flush(); // no-op, must not throw
	assert.equal(memory.file, null);
});

// ------------------------------------------------------------- 18 upgrades

test('text extras additions: titleCase, slugify, generateId', () => {
	assert.equal(titleCase('halo dunia bot'), 'Halo Dunia Bot');
	assert.equal(titleCase('SUDAH CAPS'), 'Sudah Caps');
	assert.equal(slugify('Halo Dunia! 2026'), 'halo-dunia-2026');
	assert.equal(slugify('Café Ünïcode'), 'cafe-unicode');
	assert.equal(slugify('a b', { separator: '_' }), 'a_b');
	assert.ok(generateId('ord').startsWith('ord_'));
	assert.notEqual(generateId(), generateId());
});

test('shop/notes/warns/stats/i18n upgrades', () => {
	const eco = createEconomy();
	const shop = createShop(eco);
	shop.addItem({ id: 'x', name: 'X', price: 100 });
	shop.updateItem('x', { price: 50, stock: 3 });
	assert.equal(shop.getItem('x').price, 50);
	assert.equal(shop.getItem('x').stock, 3);
	assert.throws(() => shop.updateItem('ghost', {}), /unknown item/);

	const notes = createNotes();
	notes.set('g', 'rules', 'no spam');
	assert.ok(notes.exportText('g').includes('1. *rules* — no spam'));
	assert.ok(notes.exportText('empty@g').includes('(kosong)'));

	const warns = createWarnManager();
	warns.warn('a', { chat: 'g' });
	warns.warn('a', { chat: 'g' });
	warns.warn('b', { chat: 'g' });
	assert.equal(warns.getTop(1, 'g')[0].user, 'a');
	assert.equal(warns.getTop(1, 'g')[0].count, 2);

	const stats = createCommandStats();
	stats.record('a', 'u1', 'g1');
	stats.record('b', 'u1', 'g1');
	stats.record('c', 'u2', 'g2');
	assert.deepEqual(stats.getTopChats(1), [{ chat: 'g1', count: 2 }]);

	const i18n = createI18n({ defaultLang: 'en' });
	i18n.addLanguage('id', { x: 'y' });
	i18n.setChatLang('g@g.us', 'id');
	assert.equal(i18n.formatNumber(1234567, 'id'), '1.234.567');
	assert.equal(i18n.formatNumber(1234567, 'en'), '1,234,567');
	assert.equal(i18n.formatNumber(5000, 'g@g.us'), '5.000', 'chat jid resolves to its language');
	assert.equal(i18n.formatDate(0, 'en', { year: 'numeric' }), '1970');
});

test('level/quota/tiers/birthday/guess upgrades', () => {
	const levels = createLevelSystem();
	levels.addXp('a', 500);
	levels.addXp('b', 100);
	levels.addXp('c', 300, 'g');
	assert.equal(levels.getRankPosition('a'), 1);
	assert.equal(levels.getRankPosition('b'), 3);
	assert.equal(levels.getRankPosition('c', 'g'), 1, 'per-chat ranking');
	assert.equal(levels.getRankPosition('ghost'), null);

	const quota = createQuotaManager();
	quota.consume('u1');
	quota.consume('u1');
	quota.consume('u2');
	const usage = quota.getAllUsage();
	assert.equal(usage[0].user, 'u1');
	assert.equal(usage[0].used, 2);
	assert.equal(usage.length, 2);

	let t = 0;
	const tiers = createTierManager({ now: () => t });
	tiers.setTier('p', 'premium', { days: 12, hours: 4 });
	tiers.setTier('l', 'vip');
	assert.equal(tiers.renderStatus('p'), '💎 premium — 12d 4h left');
	assert.equal(tiers.renderStatus('l'), '💎 vip — lifetime');
	assert.equal(tiers.renderStatus('free'), '🆓 Free user');

	const fake = new Date('2026-09-27T08:00:00').getTime();
	const bdays = createBirthdayManager({ now: () => fake });
	bdays.set('a@s', { day: 27, month: 9 });
	bdays.set('b@s', { day: 29, month: 9 });
	const rendered = bdays.renderUpcoming(7);
	assert.ok(rendered.includes('@a — 27/9 (TODAY 🎉)'));
	assert.ok(rendered.includes('@b — 29/9 (in 2 days)'));
	assert.ok(bdays.renderUpcoming(0, { title: 'T' }).startsWith('T'));

	const game = createGuessGame({ timeoutMs: 0 });
	const round = game.startNumberGame('c', { min: 1, max: 100, random: () => 0.5 });
	assert.equal(round.hint, 'a number between 1 and 100');
	assert.equal(game.guess('c', 'u', '51'), 'correct', 'deterministic RNG → 51');
});

test('flood/gatekeeper/health/watchdog upgrades', async () => {
	const flood = createFloodGuard({ maxMessages: 99, windowMs: 60_000 });
	const mk = (id, user) => ({ key: { remoteJid: 'g@g.us', id, participant: user }, message: { conversation: 'x' } });
	flood.handler({ messages: [mk('1', 'a@s'), mk('2', 'a@s'), mk('3', 'b@s')] });
	const top = flood.getTopFlooders(2);
	assert.equal(top[0].user, 'a@s');
	assert.equal(top[0].count, 2);
	assert.equal(top[0].chat, 'g@g.us');

	const gate = createGatekeeper();
	gate.banUser('u@s', 'spam', { expiresInMs: 60_000 });
	gate.banChat('c@g.us', 'toxic');
	const bans = gate.listBans();
	assert.equal(bans.length, 2);
	assert.ok(bans.find(b => b.type === 'user').remainingMs > 0);
	assert.equal(bans.find(b => b.type === 'chat').expiresAt, null);

	const monitor = createHealthMonitor();
	monitor.setThreshold('heapUsedMb', 0.001);
	const alerts = [];
	monitor.onAlert(a => alerts.push(a.metric));
	await monitor.snapshot();
	assert.deepEqual(alerts, ['heapUsedMb']);
	monitor.setThreshold('heapUsedMb', null);
	assert.ok(!('heapUsedMb' in monitor.getThresholds()));

	let wt = 1_000_000;
	const watchdog = createConnectionWatchdog({ staleMs: 60_000, now: () => wt });
	watchdog.touch();
	wt += 70_000;
	watchdog.check();
	assert.ok(watchdog.getReport().startsWith('🔴 STALE'));
	watchdog.touch();
	assert.ok(watchdog.getReport().startsWith('🟢 alive'));
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['random-tools', 'jid-extras', 'time-tools', 'group-tools', 'msg-tools', 'kv-store']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const checks = [
		['text-extras.d.ts', ['titleCase', 'slugify', 'generateId']],
		['shop.d.ts', ['updateItem']],
		['notes.d.ts', ['exportText']],
		['warn-manager.d.ts', ['getTop(']],
		['command-stats.d.ts', ['getTopChats']],
		['i18n.d.ts', ['formatNumber', 'formatDate']],
		['level-system.d.ts', ['getRankPosition']],
		['quota.d.ts', ['getAllUsage']],
		['tiers.d.ts', ['renderStatus']],
		['birthday.d.ts', ['renderUpcoming']],
		['guess-game.d.ts', ['startNumberGame']],
		['flood-guard.d.ts', ['getTopFlooders']],
		['gatekeeper.d.ts', ['listBans']],
		['health-monitor.d.ts', ['setThreshold']],
		['connection-watchdog.d.ts', ['getReport']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const needle of needles) {
			assert.ok(src.includes(needle), `${file} declares ${needle}`);
		}
	}
});
