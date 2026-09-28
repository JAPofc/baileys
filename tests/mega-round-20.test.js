// Tests for the 20+ item round: text extras, reminders (+parseDuration fix),
// quota, tiers, todo lists, url watcher, and upgrades to economy (bank/rank),
// level cards, router (unknown/remove), i18n plurals, fancy-text styles,
// birthday zodiac, guess-game close hints and health snapshot formatting.
import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import {
	readMore, READ_MORE, progressBar, formatDuration, formatBytes,
	truncate, chunkText, escapeMarkdown, stripMarkdown, levenshtein, similarity,
	parseDuration, createReminderManager,
	createQuotaManager, createTierManager, createTodoList, createUrlWatcher,
	createEconomy, createLevelSystem, createRouter, createI18n,
	styleText, listTextStyles, getZodiac, createBirthdayManager,
	createGuessGame, formatHealthSnapshot, createHealthMonitor
} from '../lib/index.js';

// -------------------------------------------------------------- text extras

test('text extras: readMore, progressBar, human formats', () => {
	const composed = readMore('promo', 'detail');
	assert.ok(composed.startsWith('promo') && composed.endsWith('detail') && composed.includes(READ_MORE));
	assert.ok(READ_MORE.length > 4000);

	assert.equal(progressBar(70, 100), '███████░░░ 70%');
	assert.equal(progressBar(0, 100, { showPercent: false }), '░░░░░░░░░░');
	assert.ok(progressBar(150, 100).startsWith('██████████'), 'clamped at 100%');
	assert.equal(progressBar(1, 0), '░░░░░░░░░░ 0%', 'zero max safe');

	assert.equal(formatDuration(93_784_000), '1d 2h 3m');
	assert.equal(formatDuration(61_000), '1m 1s');
	assert.equal(formatDuration(0), '0s');
	assert.equal(formatDuration(93_784_000, { parts: 2 }), '1d 2h');

	assert.equal(formatBytes(5_242_880), '5 MB');
	assert.equal(formatBytes(1536), '1.5 KB');
	assert.equal(formatBytes(10), '10 B');
	assert.equal(formatBytes(-5), '0 B');
});

test('text extras: truncate, chunking, markdown, edit distance', () => {
	assert.equal(truncate('abcdefgh', 5), 'abcd…');
	assert.equal(truncate('ab', 5), 'ab');
	assert.equal(chunkText('a'.repeat(9000), 4000).length, 3);
	assert.deepEqual(chunkText('baris1\nbaris2', 8), ['baris1', 'baris2'], 'prefers newline cuts');
	assert.deepEqual(chunkText('', 100), []);
	assert.ok(chunkText('kata '.repeat(100), 50).every(c => c.length <= 50));

	assert.equal(escapeMarkdown('a*b_c'), 'a\u200B*b\u200B_c');
	assert.equal(stripMarkdown('*bold* _it_ ~x~ `c`'), 'bold it x c');

	assert.equal(levenshtein('jakarta', 'jakrata'), 2);
	assert.equal(levenshtein('', 'abc'), 3);
	assert.equal(levenshtein('same', 'same'), 0);
	assert.equal(similarity('abcd', 'abcd'), 1);
	assert.equal(similarity('abcd', 'abce'), 0.75);
	assert.equal(similarity('', ''), 1);
});

// ---------------------------------------------------------------- reminders

test('parseDuration handles compound forms (regression: 1h30m)', () => {
	assert.equal(parseDuration('1h30m'), 5_400_000, 'compound without spaces — the \\b bug');
	assert.equal(parseDuration('90s'), 90_000);
	assert.equal(parseDuration('2d 4h'), 187_200_000);
	assert.equal(parseDuration('1d2h3m4s'), 93_784_000);
	assert.equal(parseDuration('0.5h'), 1_800_000);
	assert.equal(parseDuration('ngawur'), null);
	assert.equal(parseDuration('10ms'), null, 'ms is not a unit');
	assert.equal(parseDuration(''), null);
});

test('reminder manager: schedule, cancel, list, restore with late firing', async () => {
	let t = 1_000_000;
	const reminders = createReminderManager({ maxPerUser: 2, now: () => t });
	const id = reminders.add({ chat: 'c', user: 'u', text: 'gorengan', inMs: 60_000 });
	reminders.add({ chat: 'c', user: 'u', text: 'later', inMs: 999_999 });
	assert.throws(() => reminders.add({ chat: 'c', user: 'u', text: 'x', inMs: 5 }), /limit/);
	assert.throws(() => reminders.add({ chat: 'c', user: 'u', inMs: -5 }), /future/);
	assert.throws(() => reminders.add({ user: 'u', inMs: 50 }), /chat/);

	assert.equal(reminders.list({ chat: 'c' }).length, 2);
	assert.equal(reminders.list({ chat: 'c' })[0].text, 'gorengan', 'sorted by due time');
	assert.equal(reminders.cancel(id), true);
	assert.equal(reminders.cancel(id), false);
	assert.equal(reminders.size, 1);

	const snapshot = reminders.toJSON();
	t += 2_000_000; // restore far past due
	const restored = createReminderManager({ now: () => t });
	const fired = [];
	restored.onDue(r => fired.push([r.text, r.late]));
	restored.load(snapshot);
	await new Promise(r => setTimeout(r, 30));
	assert.deepEqual(fired, [['later', true]], 'overdue reminders fire immediately, flagged late');
	assert.equal(restored.size, 0);
	reminders.clear();
});

// -------------------------------------------------------------------- quota

test('quota manager: daily limits, tiers, bonus, midnight reset', () => {
	let t = new Date('2026-09-27T10:00:00').getTime();
	const quota = createQuotaManager({ defaultLimit: 2, limits: { premium: 5, vip: Infinity }, now: () => t });
	const exhausted = [];
	quota.onExhausted(e => exhausted.push(e.user));

	assert.equal(quota.consume('u').allowed, true);
	assert.equal(quota.consume('u').remaining, 0);
	const blocked = quota.consume('u');
	assert.equal(blocked.allowed, false);
	assert.ok(blocked.resetAt > t);
	assert.deepEqual(exhausted, ['u']);
	assert.equal(quota.remaining('u'), 0);
	assert.equal(quota.consume('p', 'premium').limit, 5);
	assert.equal(quota.consume('v', 'vip').remaining, Infinity);

	t = new Date('2026-09-28T00:01:00').getTime();
	assert.equal(quota.consume('u').allowed, true, 'fresh allowance after midnight');
	quota.grantBonus('u', 3);
	assert.equal(quota.remaining('u'), 4, 'bonus adds to today only');

	const restored = createQuotaManager({ defaultLimit: 2, now: () => t });
	restored.load(quota.toJSON());
	assert.equal(restored.getUsed('u'), 1);
});

// -------------------------------------------------------------------- tiers

test('tier manager: grant, extend, expiry sweep, lifetime, persistence', () => {
	let t = 1_000_000;
	const tiers = createTierManager({ now: () => t });
	const expired = [];
	const granted = [];
	tiers.onExpire(e => expired.push(e.user));
	tiers.onGrant(g => granted.push(g.name));

	tiers.setTier('a@s', 'premium', { days: 30 });
	tiers.setTier('b@s', 'vip'); // lifetime
	assert.deepEqual(granted, ['premium', 'vip']);
	assert.equal(tiers.isActive('a@s', 'premium'), true);
	assert.equal(tiers.isActive('a@s', 'vip'), false);
	assert.equal(tiers.getTier('a@s').remainingMs, 30 * 86_400_000);
	assert.equal(tiers.getTier('b@s').lifetime, true);
	assert.equal(tiers.list('premium').length, 1);
	assert.throws(() => tiers.extend('ghost', { days: 1 }), /no tier/);

	tiers.extend('a@s', { days: 7 });
	t += 36 * 86_400_000;
	assert.equal(tiers.isActive('a@s'), true, 'extension stacked (37d total)');
	t += 2 * 86_400_000;
	assert.equal(tiers.isActive('a@s'), false, 'expiry respected without sweeping');
	const swept = tiers.sweep();
	assert.equal(swept.length, 1);
	assert.deepEqual(expired, ['a@s']);
	assert.equal(tiers.isActive('b@s'), true, 'lifetime survives sweeps');

	const restored = createTierManager({ now: () => t });
	restored.load(tiers.toJSON());
	assert.equal(restored.isActive('b@s', 'vip'), true);
});

// --------------------------------------------------------------------- todo

test('todo list: add/done/assign/render/mentions/clearDone/persistence', () => {
	const todos = createTodoList({ maxPerChat: 3 });
	todos.add('g@g.us', 'beli galon', { by: 'x@s' });
	todos.add('g@g.us', 'bayar wifi', { assignee: 'budi@s.whatsapp.net' });
	assert.throws(() => todos.add('g@g.us', '   '), /empty/);

	assert.equal(todos.done('g@g.us', 1), true);
	assert.equal(todos.done('g@g.us', 1), false, 'already done');
	const rendered = todos.render('g@g.us');
	assert.ok(rendered.includes('☑ 1. beli galon'));
	assert.ok(rendered.includes('☐ 2. bayar wifi → @budi'));
	assert.deepEqual(todos.mentions('g@g.us'), ['budi@s.whatsapp.net']);
	assert.equal(todos.list('g@g.us', { openOnly: true }).length, 1);

	assert.equal(todos.undone('g@g.us', 1), true);
	assert.equal(todos.assign('g@g.us', 1, 'ani@s.whatsapp.net'), true);
	todos.done('g@g.us', 1);
	assert.equal(todos.clearDone('g@g.us'), 1);
	assert.equal(todos.countIn('g@g.us'), 1);

	const restored = createTodoList();
	restored.load(todos.toJSON());
	assert.equal(restored.list('g@g.us')[0].text, 'bayar wifi');
	assert.equal(restored.render('empty@g.us'), '📋 *To-do*\n(kosong)');
});

// -------------------------------------------------------------- url watcher

test('url watcher: baseline silent, change detected, errors surfaced', async () => {
	let version = 1;
	let fail = false;
	const server = createServer((_req, res) => {
		if (fail) {
			res.writeHead(500);
			res.end();
			return;
		}
		res.writeHead(200);
		res.end(JSON.stringify({ v: version, noise: Math.random() }));
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;

	const watcher = createUrlWatcher(`http://127.0.0.1:${port}/api`, {
		extract: (body) => JSON.parse(body).v // noise field ignored
	});
	const changes = [];
	const errors = [];
	watcher.onChange(c => changes.push(c.body));
	watcher.onError(e => errors.push(e.error.message));

	assert.equal((await watcher.check()).changed, false, 'first poll = baseline');
	assert.equal((await watcher.check()).changed, false, 'extract() hides noise');
	version = 2;
	assert.equal((await watcher.check()).changed, true);
	assert.deepEqual(changes, ['2']);
	fail = true;
	const errored = await watcher.check();
	assert.ok(errored.error);
	assert.match(errors[0], /HTTP 500/);
	assert.deepEqual(watcher.stats, { checks: 4, changes: 1, notModifiedHits: 0 }); // stats extended by the ETag upgrade
	server.close();
	assert.throws(() => createUrlWatcher(''), /requires a URL/);
});

// ------------------------------------------------------- economy bank + rank

test('economy upgrade: bank deposit/withdraw with capacity, leaderboard rank', () => {
	const eco = createEconomy({ bankCapacity: 1000 });
	eco.add('a@s', 500);
	eco.add('b@s', 300);
	const tx = [];
	eco.onTransaction(e => tx.push(e.type));

	assert.deepEqual(eco.deposit('a@s', 400), { balance: 100, bank: 400 });
	assert.equal(eco.getBankBalance('a@s'), 400);
	assert.deepEqual(eco.withdraw('a@s', 150), { balance: 250, bank: 250 });
	assert.throws(() => eco.deposit('a@s', 900), /insufficient balance/);
	assert.throws(() => eco.withdraw('a@s', 999), /insufficient bank/);
	assert.deepEqual(tx, ['deposit', 'withdraw']);

	const capped = createEconomy({ bankCapacity: 100 });
	capped.add('x', 500);
	assert.throws(() => capped.deposit('x', 200), /capacity/);

	assert.equal(eco.getRank('a@s'), 1, 'wallet+bank counted');
	assert.equal(eco.getRank('b@s'), 2);
	assert.equal(eco.getRank('ghost'), null);
	const [top] = eco.getLeaderboard(1);
	assert.equal(top.total, 500);
	assert.equal(top.bank, 250);

	const restored = createEconomy();
	restored.load(eco.toJSON());
	assert.equal(restored.getBankBalance('a@s'), 250, 'bank survives persistence');
});

// -------------------------------------------- level card, router, i18n, misc

test('level rank card renders progress; router unknown/remove; i18n plurals', async () => {
	const levels = createLevelSystem();
	levels.addXp('user@s.whatsapp.net', 150, 'g@g.us');
	const card = levels.renderRankCard('user@s.whatsapp.net');
	assert.ok(card.includes('@user'));
	assert.ok(card.includes('Level 1 — Newbie'));
	assert.ok(card.includes('XP 150 / 400'));
	assert.ok(card.includes('█'));
	assert.equal(levels.renderRankCard('ghost@s'), null);

	const unknown = [];
	const router = createRouter({ onUnknownCommand: ctx => unknown.push(ctx.command) });
	router.command(['ping', 'p'], () => { });
	const sock = { sendMessage: async () => ({}) };
	const mk = (text) => ({ key: { remoteJid: 'c@s.whatsapp.net', id: `${Math.random()}` }, message: { conversation: text } });
	assert.equal(await router.handle(sock, mk('!ngawur')), true, 'unknown prefixed command counts as handled');
	assert.deepEqual(unknown, ['ngawur']);
	assert.equal(router.remove('p'), true, 'removing an alias kills the whole command');
	await router.handle(sock, mk('!ping'));
	assert.deepEqual(unknown, ['ngawur', 'ping']);
	assert.equal(router.remove('ghost'), false);

	const i18n = createI18n({ defaultLang: 'en' });
	i18n.addLanguage('en', { items: { one: '{count} item', other: '{count} items' }, plain: 'just {count}' });
	i18n.addLanguage('id', { items: { other: '{count} barang' } });
	i18n.setChatLang('g@g.us', 'id');
	assert.equal(i18n.tn('items', 1), '1 item');
	assert.equal(i18n.tn('items', 5), '5 items');
	assert.equal(i18n.tnFor('g@g.us', 'items', 3), '3 barang');
	assert.equal(i18n.tnFor('g@g.us', 'items', 1), '1 item', 'missing id plural falls back to en');
	assert.equal(i18n.tn('plain', 2), 'just 2', 'non-plural keys still work');
});

test('fancy styles, zodiac, guess-game close hints, health formatting', async () => {
	assert.equal([...styleText('A', 'negativeSquared')][0].codePointAt(0), 0x1f170);
	const bf = [...styleText('Ab', 'boldFraktur')];
	assert.equal(bf[0].codePointAt(0), 0x1d56c);
	assert.equal(bf[1].codePointAt(0), 0x1d586 + 1);
	assert.equal(listTextStyles().length, 15); // upsideDown added

	assert.equal(getZodiac(17, 8), 'Leo');
	assert.equal(getZodiac(23, 8), 'Virgo');
	assert.equal(getZodiac(1, 1), 'Capricorn');
	assert.equal(getZodiac(25, 12), 'Capricorn');
	assert.equal(getZodiac(0, 5), null);
	const fake = new Date('2026-08-17T08:00:00').getTime();
	const bdays = createBirthdayManager({ now: () => fake });
	bdays.set('u@s', { day: 17, month: 8, year: 2000 });
	assert.equal(bdays.getToday()[0].zodiac, 'Leo');
	assert.equal(bdays.checkNow()[0].zodiac, 'Leo');

	const game = createGuessGame({ timeoutMs: 0, closeDistance: 2 });
	const wrongs = [];
	game.onWrong(w => wrongs.push([w.close, w.distance]));
	game.start('c', { answer: 'jakarta' });
	game.guess('c', 'u', 'jakrata');
	game.guess('c', 'u', 'bandung');
	assert.deepEqual(wrongs[0], [true, 2], 'near-miss flagged close');
	assert.equal(wrongs[1][0], false);

	const monitor = createHealthMonitor();
	monitor.addProbe('jobs', () => 3);
	const text = formatHealthSnapshot(await monitor.snapshot());
	assert.ok(text.includes('Bot Health'));
	assert.ok(text.includes('Heap:'));
	assert.ok(text.includes('jobs: 3'));
	assert.equal(formatHealthSnapshot(null), '(no snapshot)');
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the new modules and upgrades', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['text-extras', 'reminders', 'quota', 'tiers', 'todo', 'url-watcher']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const checks = [
		['economy.d.ts', ['deposit(', 'withdraw(', 'getRank(', 'bankCapacity']],
		['level-system.d.ts', ['renderRankCard(']],
		['router.d.ts', ['onUnknownCommand', 'remove(name']],
		['i18n.d.ts', ['tn(', 'tnFor(']],
		['fancy-text.d.ts', ['negativeSquared', 'boldFraktur']],
		['birthday.d.ts', ['getZodiac']],
		['guess-game.d.ts', ['closeDistance', 'close: boolean']],
		['health-monitor.d.ts', ['formatHealthSnapshot']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const needle of needles) {
			assert.ok(src.includes(needle), `${file} declares ${needle}`);
		}
	}
});
