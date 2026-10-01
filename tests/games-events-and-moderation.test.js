// Tests for the 36-upgrade sweep across the whole toolkit — every upgrade
// asserted, grouped by area. See the commit message for the full list.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as B from '../lib/index.js';

// ------------------------------------------------- storage & lists (1-6)

test('kv TTL/getOrSet, notes pinning, todo priorities', async () => {
	const db = await B.createKVStore();
	db.set('temp', 'x', { ttlMs: 1 });
	db.set('keep', 'y');
	await new Promise(r => setTimeout(r, 10));
	assert.equal(db.get('temp'), undefined, 'TTL expired lazily');
	assert.equal(db.get('temp', 'fb'), 'fb');
	assert.equal(db.has('temp'), false);
	assert.ok(!('temp' in db.all()));
	assert.equal(db.get('keep'), 'y');
	assert.equal(db.getOrSet('a', () => 42), 42);
	assert.equal(db.getOrSet('a', () => 99), 42, 'second call returns cached');

	const notes = B.createNotes();
	notes.set('g', 'zebra', 'z');
	notes.set('g', 'apel', 'a');
	assert.equal(notes.pin('g', 'zebra'), true);
	assert.equal(notes.list('g')[0].name, 'zebra', 'pinned sorts first');
	assert.ok(notes.exportText('g').includes('📌 *zebra*'));
	assert.equal(notes.pin('g', 'ghost'), false);

	const todos = B.createTodoList();
	todos.add('g', 'urgent', { priority: 'high' });
	todos.add('g', 'biasa');
	assert.equal(todos.setPriority('g', 2, 'medium'), true);
	assert.ok(todos.render('g').includes('🔴 urgent'));
	assert.ok(todos.render('g').includes('🟡 biasa'));
	assert.throws(() => todos.add('g', 'x', { priority: 'ultra' }), /priority/);
});

test('recurring reminders and warn list rendering', async () => {
	let t = 0;
	const reminders = B.createReminderManager({ now: () => t });
	const due = [];
	reminders.onDue(r => due.push([r.text, r.recurring || false]));
	reminders.add({ chat: 'c', user: 'u', text: 'tiap detik', inMs: 30, repeatMs: 1000 });
	assert.throws(() => reminders.add({ chat: 'c', user: 'u', inMs: 30, repeatMs: 10 }), /repeatMs/);
	await new Promise(r => setTimeout(r, 60));
	assert.deepEqual(due, [['tiap detik', true]]);
	assert.equal(reminders.size, 1, 'recurring reminder re-armed');
	assert.equal(reminders.list()[0].dueAt, 1000);
	reminders.clear();

	const warns = B.createWarnManager({ threshold: 3 });
	warns.warn('a@s', { chat: 'g' });
	warns.warn('a@s', { chat: 'g' });
	warns.warn('b@s', { chat: 'g' });
	assert.ok(warns.renderList('g').includes('1. @a — 2/3'));
	assert.ok(warns.renderList('kosong').includes('bersih'));
});

// ------------------------------------------------------- economy pack (7-11)

test('economy stats + work, shop catalog, tier extendAll, quota status', () => {
	const eco = B.createEconomy({ random: () => 0.5 });
	eco.add('a', 1000);
	eco.deposit('a', 400);
	eco.add('b', 200);
	assert.deepEqual(eco.getEconomyStats(), {
		users: 2, totalWallet: 800, totalBank: 400, totalMoney: 1200, richest: 'a', average: 600
	});
	const w1 = eco.work('c', { pay: [100, 100], cooldownMs: 60_000 });
	assert.equal(w1.worked, true);
	assert.equal(w1.earned, 100);
	assert.equal(typeof w1.job, 'string');
	const w2 = eco.work('c');
	assert.equal(w2.worked, false);
	assert.ok(w2.remainingMs > 0);

	const shop = B.createShop(B.createEconomy());
	shop.addItem({ id: 'p', name: 'Potion', price: 250, stock: 3, description: 'heal 50' });
	assert.ok(shop.renderCatalog().includes('*Potion* — 250 · stok 3'));
	assert.ok(shop.renderCatalog().includes('_heal 50_'));
	assert.ok(B.createShop(B.createEconomy()).renderCatalog().includes('kosong'));

	let t = 0;
	const tiers = B.createTierManager({ now: () => t });
	tiers.setTier('a', 'prem', { days: 5 });
	tiers.setTier('b', 'prem', { days: 5 });
	tiers.setTier('c', 'vip', { days: 5 });
	assert.equal(tiers.extendAll('prem', { days: 5 }), 2);
	assert.equal(tiers.getTier('a').remainingMs, 10 * 86_400_000);
	assert.equal(tiers.getTier('c').remainingMs, 5 * 86_400_000, 'other tiers untouched');

	const quota = B.createQuotaManager({ defaultLimit: 10, limits: { vip: Infinity } });
	quota.consume('u');
	quota.consume('u');
	assert.ok(quota.renderStatus('u').includes('2/10'));
	assert.ok(quota.renderStatus('u').includes('sisa 8'));
	assert.ok(quota.renderStatus('v', 'vip').includes('♾️'));
});

// -------------------------------------------------------- games pack (12-19)

test('level prestige, guess hints, ttt records, rps best-of-3', () => {
	const levels = B.createLevelSystem();
	levels.addXp('u', 100 * 15 * 15); // level 15
	assert.equal(levels.prestige('u', { minLevel: 99 }), null, 'gate enforced');
	const p = levels.prestige('u');
	assert.equal(p.prestige, 1);
	assert.equal(p.xp, 0);
	levels.addXp('u', 500);
	assert.ok(levels.renderRankCard('u').includes('⭐'));
	const restored = B.createLevelSystem();
	restored.load(levels.toJSON());
	assert.equal(restored.getUser('u').prestige, 1, 'prestige persists');

	const game = B.createGuessGame({ timeoutMs: 0 });
	game.start('c', { answer: 'jakarta raya' });
	const h1 = game.revealHint('c');
	const h2 = game.revealHint('c');
	assert.equal(h1.length, 12);
	assert.equal(h1[7], ' ', 'spaces always shown');
	const count = (s) => (s.match(/[a-z]/g) || []).length;
	assert.ok(count(h2) > count(h1), 'progressively more letters');
	assert.ok(h2.includes('_'), 'never fully revealed');
	assert.equal(game.revealHint('ghost'), null);
	game.end('c');

	const ttt = B.createTicTacToe();
	ttt.challenge('c', 'A', 'B');
	ttt.accept('c', 'B');
	for (const [u, s] of [['A', 1], ['B', 4], ['A', 2], ['B', 5], ['A', 3]]) {
		ttt.play('c', u, s);
	}
	assert.equal(ttt.getStats('A').wins, 1);
	assert.equal(ttt.getStats('B').losses, 1);
	assert.equal(ttt.getLeaderboard(1)[0].user, 'A');
	assert.equal(ttt.getStats('ghost'), null);

	const rps = B.createRPS();
	assert.throws(() => rps.challenge('x', 'A', 'B', { rounds: 2 }), /odd/);
	rps.challenge('c', 'A', 'B', { rounds: 3 });
	rps.accept('c', 'B');
	rps.pick('c', 'A', 'batu');
	const r1 = rps.pick('c', 'B', 'gunting'); // A 1-0
	assert.equal(r1.series.over, false);
	assert.equal(r1.series.score.A, 1);
	assert.equal(rps.getDuel('c').round, 2);
	rps.pick('c', 'A', 'batu');
	const r2 = rps.pick('c', 'B', 'batu'); // draw → replay
	assert.equal(r2.draw, true);
	assert.equal(r2.series.over, false);
	rps.pick('c', 'A', 'kertas');
	const r3 = rps.pick('c', 'B', 'batu'); // A 2-0 → series over
	assert.equal(r3.series.over, true);
	assert.equal(r3.winner, 'A');
	assert.equal(rps.isActive('c'), false);
});

test('giveaway requirements, attendance streaks, auction buy-now, live polls', () => {
	const giveaway = B.createGiveaway({ keyword: 'ikut', canJoin: (u) => (u === 'vip@s' ? true : 'level kurang') });
	const denied = [];
	const joined = [];
	giveaway.onDenied(d => denied.push([d.user, d.reason]));
	giveaway.onJoin(j => joined.push(j.user));
	giveaway.start('c', { durationMs: 0 });
	const mk = (u) => ({ key: { remoteJid: 'c', id: `${Math.random()}`, participant: u }, message: { conversation: 'ikut' } });
	giveaway.handler({ messages: [mk('vip@s'), mk('noob@s')] });
	assert.deepEqual(joined, ['vip@s']);
	assert.deepEqual(denied, [['noob@s', 'level kurang']]);
	giveaway.cancel('c');

	let t = new Date('2026-09-28T07:00:00').getTime();
	const absen = B.createAttendance({ now: () => t });
	absen.open('g');
	absen.checkIn('g', 'u@s');
	assert.equal(absen.getStreak('g', 'u@s'), 1);
	absen.close('g');
	t += 86_400_000;
	absen.open('g');
	absen.checkIn('g', 'u@s');
	assert.equal(absen.getStreak('g', 'u@s'), 2, 'consecutive day extends');
	absen.close('g');
	t += 3 * 86_400_000;
	absen.open('g');
	absen.checkIn('g', 'u@s');
	assert.equal(absen.getStreak('g', 'u@s'), 1, 'gap resets the streak');

	const auction = B.createAuction();
	const ends = [];
	auction.onEnd(e => ends.push(e.reason));
	auction.start('c', { item: 'X', startBid: 100, buyNow: 500, durationMs: 600_000 });
	auction.bid('c', 'a@s', 100);
	const bn = auction.bid('c', 'b@s', 500);
	assert.equal(bn.buyNow, true);
	assert.equal(bn.result.winner, 'b@s');
	assert.deepEqual(ends, ['buy-now']);
	assert.equal(auction.isActive('c'), false);

	const polls = B.createTextPoll();
	polls.start('c', { question: 'Q?', options: ['a', 'b'] });
	polls.vote('c', 'u1', 1);
	polls.vote('c', 'u2', 1);
	assert.ok(polls.renderLive('c').includes('2 suara'));
	assert.ok(polls.renderLive('c').includes('█'));
	assert.equal(polls.renderLive('ghost'), null);
	polls.end('c');
});

// ------------------------------------------------- social & guards (20-26)

test('menfess admin list, afk list, shield reasons, bulk bans, warmup skip', async () => {
	const menfess = B.createMenfessRelay();
	await menfess.start({ sendMessage: async () => ({}) }, 'a@s', 'b@s', 'halo');
	const sessions = menfess.listActiveSessions();
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0].aliasA, 'Anon-1');
	assert.ok(sessions[0].ageMs >= 0);

	const afk = B.createAfkManager();
	afk.setAfk('u@s', 'makan');
	assert.ok(afk.renderAfkList().includes('@u — makan'));
	assert.ok(B.createAfkManager().renderAfkList().includes('tidak ada'));

	const shield = B.createBugShield();
	await shield.handler({
		messages: [{
			key: { remoteJid: 'g@g.us', id: '1', participant: 'x@s' },
			message: { extendedTextMessage: { text: 'a'.repeat(60_000), contextInfo: { mentionedJid: Array(600).fill('x') } } }
		}]
	});
	const reasons = shield.getReasonStats();
	assert.equal(reasons.hugeText, 1);
	assert.equal(reasons.mentionBomb, 1);

	const gate = B.createGatekeeper();
	assert.equal(gate.banMany(['a@s', 'b@s', 'a@s'], 'raid'), 2, 'dupes not double-counted');
	assert.equal(gate.isBannedUser('b@s'), true);

	const warmup = B.createAccountWarmup({ ramp: [1] });
	warmup.recordSend();
	assert.equal(warmup.canSend(), false);
	warmup.skipWarmup();
	assert.equal(warmup.canSend(), true);
	assert.equal(warmup.getStatus().graduated, true);
});

test('op-guard waiting, watchdog auto-restart', async () => {
	const guard = B.createGroupOpGuard({ limits: { add: { max: 1, windowMs: 40 } } });
	guard.record('add');
	const start = Date.now();
	await guard.waitAndAssert('add');
	assert.ok(Date.now() - start >= 30, 'waited for the window to slide');

	const capped = B.createGroupOpGuard({ limits: { add: { max: 1, windowMs: 10 * 60_000 } } });
	capped.record('add');
	await assert.rejects(() => capped.waitAndAssert('add', 1, { maxWaitMs: 10 }), B.GroupOpLimitError);

	let t = 1_000_000;
	const ended = [];
	const watchdog = B.createConnectionWatchdog({ staleMs: 60_000, now: () => t, autoRestart: true });
	watchdog.bind({ ev: { on: () => { }, off: () => { } }, end: (e) => ended.push(e.message) });
	watchdog.touch();
	t += 70_000;
	watchdog.check();
	assert.equal(ended.length, 1);
	assert.ok(ended[0].includes('stale'));
});

// -------------------------------------------- text, router, misc (27-36)

test('sparklines, router hidden/quotedText, i18n bulk, stats render', async () => {
	assert.equal(B.sparkline([1, 5, 3, 8]), '▁▅▃█');
	assert.equal(B.sparkline([]), '');
	assert.equal(B.sparkline([5, 5]), '▁▁');
	const history = B.renderHealthHistory([{ heapUsedMb: 50, eventLoopLagMs: 2 }, { heapUsedMb: 80, eventLoopLagMs: 9 }]);
	assert.ok(history.includes('Heap') && history.includes('80 MB') && history.includes('9 ms'));
	assert.equal(B.renderHealthHistory([]), '(no history)');

	const sent = [];
	const sock = { sendMessage: async (_j, c) => sent.push(c.text) };
	const router = B.createRouter({ prefix: '!' });
	router.command('secret', () => { }, { hidden: true });
	router.command('public', () => { }, { desc: 'ok' });
	await router.handle(sock, { key: { remoteJid: 'd@s', id: '1' }, message: { conversation: '!help' } });
	assert.ok(!sent[0].includes('secret'), 'hidden commands stay out of the menu');
	assert.ok(sent[0].includes('public'));
	assert.equal(router.list().find(c => c.names[0] === 'secret').hidden, true);

	let quoted = null;
	router.command('quote', ctx => {
		quoted = ctx.quotedText;
	});
	await router.handle(sock, {
		key: { remoteJid: 'd@s', id: '2' },
		message: { extendedTextMessage: { text: '!quote', contextInfo: { quotedMessage: { conversation: 'pesan asli' } } } }
	});
	assert.equal(quoted, 'pesan asli');

	const i18n = B.createI18n();
	i18n.addLanguages({ en: { hi: 'Hello' }, id: { hi: 'Halo' } });
	assert.equal(i18n.t('hi'), 'Hello');
	assert.equal(i18n.t('hi', {}, 'id'), 'Halo');

	const stats = B.createCommandStats();
	stats.record('menu', 'u');
	stats.record('menu', 'u');
	stats.record('play', 'u');
	assert.ok(stats.renderTop().includes('1. !menu — 2x'));
	assert.ok(stats.renderTop().includes('Total: 3 commands'));
});

test('serialize timestampMs, mention chunking, forward info, rental list', async () => {
	const m = B.serializeMessage(null, { key: { remoteJid: 'u@s', id: '1' }, message: { conversation: 'x' }, messageTimestamp: 1_760_000_000 });
	assert.equal(m.timestampMs, 1_760_000_000_000);
	const noTs = B.serializeMessage(null, { key: { remoteJid: 'u@s', id: '2' }, message: { conversation: 'x' } });
	assert.equal(noTs.timestampMs, null);

	const sends = [];
	const sock = {
		groupMetadata: async () => ({ participants: Array.from({ length: 5 }, (_, i) => ({ id: `u${i}@s` })) }),
		sendMessage: async (_j, c) => {
			sends.push(c.mentions.length);
			return {};
		}
	};
	const results = await B.sendMentionAll(sock, 'g@g.us', 'Woi', { maxMentionsPerMessage: 2 });
	assert.ok(Array.isArray(results));
	assert.deepEqual(sends, [2, 2, 1], 'mentions chunked across messages');

	const fwd = { message: { extendedTextMessage: { text: 'x', contextInfo: { isForwarded: true, forwardingScore: 7 } } } };
	assert.equal(B.isForwarded(fwd), true);
	assert.equal(B.getForwardInfo(fwd).frequentlyForwarded, true);
	assert.equal(B.isForwarded({ message: { conversation: 'x' } }), false);

	const rental = B.createRentalManager();
	rental.add('123@g.us', { days: 5 });
	rental.startTrial('456@g.us', { days: 1 });
	const list = rental.renderList();
	assert.ok(list.includes('123 — 5d'));
	assert.ok(list.includes('🎁 trial'));
	assert.ok(B.createRentalManager().renderList().includes('tidak ada'));
});

// ------------------------------------------------------------------ types

test('type definitions declare every upgrade', () => {
	const checks = [
		['kv-store.d.ts', ['ttlMs', 'getOrSet']],
		['notes.d.ts', ['pin(']],
		['todo.d.ts', ['setPriority']],
		['reminders.d.ts', ['repeatMs']],
		['warn-manager.d.ts', ['renderList']],
		['economy.d.ts', ['getEconomyStats', 'work(']],
		['shop.d.ts', ['renderCatalog']],
		['tiers.d.ts', ['extendAll']],
		['quota.d.ts', ['renderStatus']],
		['level-system.d.ts', ['prestige(']],
		['guess-game.d.ts', ['revealHint']],
		['tictactoe.d.ts', ['getStats(']],
		['rps.d.ts', ['series?:']],
		['giveaway.d.ts', ['onDenied', 'canJoin']],
		['attendance.d.ts', ['getStreak']],
		['auction.d.ts', ['buyNow?:']],
		['text-poll.d.ts', ['renderLive']],
		['menfess.d.ts', ['listActiveSessions']],
		['afk.d.ts', ['renderAfkList']],
		['bug-shield.d.ts', ['getReasonStats']],
		['gatekeeper.d.ts', ['banMany']],
		['warmup.d.ts', ['skipWarmup']],
		['group-op-guard.d.ts', ['waitAndAssert']],
		['connection-watchdog.d.ts', ['autoRestart']],
		['health-monitor.d.ts', ['renderHealthHistory']],
		['text-extras.d.ts', ['sparkline']],
		['router.d.ts', ['hidden?:', 'quotedText']],
		['i18n.d.ts', ['addLanguages']],
		['command-stats.d.ts', ['renderTop']],
		['serialize.d.ts', ['timestampMs']],
		['text-tools.d.ts', ['maxMentionsPerMessage']],
		['msg-tools.d.ts', ['getForwardInfo']],
		['rental.d.ts', ['renderList']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const needle of needles) {
			assert.ok(src.includes(needle), `${file} declares ${needle}`);
		}
	}
});
