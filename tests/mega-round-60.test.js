// Tests for the 60+ round: banner v3, six new tool modules (emoji/array/
// validate/timing/task-queue/mask), ~30 upgrades across the toolkit, and
// the round's real fixes (throttle sentinel, kv spread-frozen getter,
// giveaway reroll immutability, referenced pairing/reminder timers).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as B from '../lib/index.js';

const seq = (v) => { let i = 0; return () => v[i++ % v.length]; };

test('emoji tools', () => {
	assert.deepEqual(B.extractEmojis('nice 🔥 bro 😂'), ['🔥', '😂']);
	assert.equal(B.countEmojis('🔥😂🔥'), 3);
	assert.equal(B.isEmojiOnly('🔥🔥 🔥'), true);
	assert.equal(B.isEmojiOnly('a🔥'), false);
	assert.equal(B.isEmojiOnly(''), false);
	assert.equal(B.stripEmojis('halo 😂 dunia'), 'halo  dunia');
	assert.equal(B.replaceEmojis('a🔥b', e => `[${e}]`), 'a[🔥]b');
	assert.ok(['🎉', '🥳', '🎊', '✨', '🏆'].includes(B.randomEmoji('celebrate', { random: () => 0.1 })));
});

test('array tools', () => {
	assert.deepEqual(B.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
	assert.throws(() => B.chunk([1], 0), /positive/);
	assert.equal(B.unique([{ id: 1 }, { id: 1 }, { id: 2 }], x => x.id).length, 2);
	assert.deepEqual(B.groupBy([1, 2, 3, 4], n => n % 2)['0'], [2, 4]);
	assert.equal(B.sortBy([{ x: 3 }, { x: 1 }], o => o.x)[0].x, 1);
	assert.equal(B.sample([1, 2, 3, 4, 5], 3).length, 3);
	assert.equal(new Set(B.sample([1, 2, 3], 3)).size, 3, 'distinct');
	assert.deepEqual(B.range(1, 5), [1, 2, 3, 4, 5]);
	assert.deepEqual(B.range(5, 1), [5, 4, 3, 2, 1]);
	assert.deepEqual(B.range(0, 10, 5), [0, 5, 10]);
});

test('validation tools', () => {
	assert.ok(B.isUrl('https://a.id') && !B.isUrl('ftp://x') && !B.isUrl('nope'));
	assert.ok(B.isEmail('a@b.co') && !B.isEmail('a@b'));
	assert.equal(B.parseBool('YA'), true);
	assert.equal(B.parseBool('nggak'), false);
	assert.equal(B.parseBool('mungkin'), null);
	assert.equal(B.clamp(150, 1, 100), 100);
	assert.deepEqual(B.ensureArray('x'), ['x']);
	assert.deepEqual(B.ensureArray(null), []);
	assert.deepEqual(B.pickFields({ a: 1, b: 2, c: 3 }, ['a', 'c', 'zz']), { a: 1, c: 3 });
});

test('timing tools incl. the throttle sentinel fix', async () => {
	let calls = 0;
	const d = B.debounce(() => calls++, 30);
	d(); d(); d();
	await new Promise(r => setTimeout(r, 60));
	assert.equal(calls, 1, 'trailing debounce');
	const d2 = B.debounce(() => calls++, 1000);
	d2();
	d2.flush();
	d2.cancel();
	assert.equal(calls, 2);

	let t = 0;
	let hits = 0;
	const thr = B.throttle(() => ++hits, 100, { now: () => t });
	thr(); // FIX: clock-at-0 must not swallow the first call
	thr();
	t = 150;
	thr();
	assert.equal(hits, 2);

	let st = 0;
	const sw = B.createStopwatch({ now: () => st });
	st = 1200; sw.lap('download');
	st = 2000; sw.lap('convert');
	assert.equal(sw.format(), 'download 1.2s · convert 0.8s · total 2.0s');
	const m = await B.measureTime(async () => 42);
	assert.equal(m.result, 42);
});

test('task queue: concurrency, retries, idle, stats', async () => {
	let concurrent = 0;
	let maxConcurrent = 0;
	let flaky = 0;
	const queue = B.createTaskQueue({ concurrency: 2, retries: 1, retryDelayMs: 5 });
	const jobs = [
		queue.push(async () => {
			concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
			await new Promise(r => setTimeout(r, 20));
			concurrent--;
		}, { id: 'a' }),
		queue.push(async () => {
			concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
			await new Promise(r => setTimeout(r, 5));
			concurrent--;
		}, { id: 'b' }),
		queue.push(async () => { if (++flaky < 2) throw new Error('flaky'); return 'C'; }, { id: 'c' }),
		queue.push(async () => { throw new Error('always'); }, { id: 'd' })
	];
	const results = await Promise.all(jobs);
	await queue.onIdle();
	assert.equal(maxConcurrent, 2, 'bounded concurrency');
	assert.equal(results[2].ok, true);
	assert.equal(results[2].attempts, 2, 'retried once then succeeded');
	assert.equal(results[3].ok, false);
	assert.deepEqual(queue.stats, { done: 3, failed: 1, pending: 0, running: 0 });
});

test('mask tools', () => {
	assert.equal(B.maskPhone('6281234567890'), '62812••••••90');
	assert.equal(B.maskEmail('budi.s@gmail.com'), 'bu••••@gmail.com');
	assert.equal(B.censorText('dasar anjing lu', ['anjing']), 'dasar a****g lu');
	assert.equal(B.censorText('xx', ['xx']), '**');
	assert.equal(B.censorText('anjingan aman', ['anjing']), 'anjingan aman', 'word boundaries');
});

test('router/serialize/economy/shop/levels/quota upgrades', async () => {
	let got = null;
	const router = B.createRouter({ prefix: '!', owners: ['boss@s.whatsapp.net'] });
	router.command('t', ctx => { got = { mentions: ctx.mentions, owner: ctx.isOwner }; });
	await router.handle({ sendMessage: async () => ({}) }, {
		key: { remoteJid: 'g@g.us', participant: 'boss:2@s.whatsapp.net', id: '1' },
		message: { extendedTextMessage: { text: '!t', contextInfo: { mentionedJid: ['a@s'] } } }
	});
	assert.deepEqual(got.mentions, ['a@s']);
	assert.equal(got.owner, true);

	const m = B.serializeMessage(null, {
		key: { remoteJid: 'u@s', id: '1' },
		message: { extendedTextMessage: { text: 're', contextInfo: { participant: 'q@s', stanzaId: 'z', quotedMessage: { conversation: 'asli' } } } }
	});
	assert.equal(m.quotedText, 'asli');

	const eco = B.createEconomy();
	eco.add('u', 500);
	eco.deposit('u', 200);
	const card = eco.getBalanceCard('u');
	assert.ok(card.includes('Dompet: 300') && card.includes('Bank: 200') && card.includes('Rank #1'));

	const shop = B.createShop(B.createEconomy());
	shop.addItem({ id: 'a', name: 'A', price: 1, category: 'food' });
	shop.addItem({ id: 'b', name: 'B', price: 2, category: 'vip' });
	assert.ok(shop.renderCatalog({ category: 'food' }).includes('*A*'));
	assert.ok(!shop.renderCatalog({ category: 'food' }).includes('*B*'));

	const levels = B.createLevelSystem();
	levels.addXp('a', 500);
	levels.addXp('b', 100);
	assert.ok(levels.renderLeaderboard(2).includes('🥇 @a'));

	let t = new Date('2026-09-28T05:00:00').getTime();
	const quota = B.createQuotaManager({ defaultLimit: 1, resetHour: 6, now: () => t });
	quota.consume('u');
	t = new Date('2026-09-28T05:59:00').getTime();
	assert.equal(quota.consume('u').allowed, false, 'still yesterday before 6 AM');
	t = new Date('2026-09-28T06:01:00').getTime();
	assert.equal(quota.consume('u').allowed, true, 'day rolled at the custom hour');
});

test('events & games upgrades incl. reroll immutability fix', () => {
	let t = 0;
	const tiers = B.createTierManager({ now: () => t });
	tiers.setTier('a', 'prem', { days: 3 });
	assert.ok(tiers.renderList().includes('@a — prem (3d)'));

	const giveaway = B.createGiveaway({ random: seq([0, 0.9]) });
	giveaway.start('c', { durationMs: 0, winners: 1 });
	giveaway.enter('c', 'a@s');
	giveaway.enter('c', 'b@s');
	giveaway.enter('c', 'x@s');
	const result = giveaway.end('c');
	const rerolled = giveaway.reroll('c');
	assert.equal(result.winners[0], 'a@s', 'FIX: reroll must not mutate the returned result');
	assert.notEqual(rerolled, 'a@s');
	assert.ok(['b@s', 'x@s'].includes(rerolled));
	assert.equal(giveaway.reroll('ghost'), null);

	let at = new Date('2026-09-28T07:00:00').getTime();
	const absen = B.createAttendance({ now: () => at });
	absen.open('g', { title: 'Absen' });
	absen.checkIn('g', 'a@s');
	at += 120_000;
	const summary = absen.renderSummary(absen.close('g'));
	assert.ok(summary.includes('REKAP') && summary.includes('1 hadir'));

	const auction = B.createAuction();
	auction.start('c', { item: 'X', startBid: 10, durationMs: 60_000 });
	auction.bid('c', 'a', 10);
	auction.end('c');
	assert.equal(auction.getHistory()[0].winner, 'a');

	let pt = 0;
	const polls = B.createTextPoll({ now: () => pt });
	polls.start('c', { question: 'q', options: ['a', 'b'], durationMs: 1000 });
	assert.equal(polls.extendDeadline('c', 5000), 6000);
	polls.end('c');

	const ttt = B.createTicTacToe();
	ttt.challenge('c', 'A', 'B');
	ttt.accept('c', 'B');
	for (const [u, sq] of [['A', 1], ['B', 4], ['A', 2], ['B', 5], ['A', 3]]) ttt.play('c', u, sq);
	assert.ok(ttt.renderStats('A').includes('1W 0L 0D (100% win)'));

	const rps = B.createRPS();
	rps.challenge('c', 'A', 'B');
	rps.accept('c', 'B');
	rps.pick('c', 'A', 'batu');
	rps.pick('c', 'B', 'gunting');
	assert.equal(rps.getStats('A').wins, 1);
	assert.equal(B.hintFor('bandung', 3), 'ban____');
});

test('social/guard/storage upgrades', async () => {
	const afk = B.createAfkManager();
	afk.setAfk('u@s', 'x');
	await new Promise(r => setTimeout(r, 30));
	afk.setBack('u@s');
	assert.ok(afk.getTotalAfkMs('u@s') >= 25);

	const menfess = B.createMenfessRelay();
	await menfess.start({ sendMessage: async () => ({}) }, 'a@s', 'b@s', 'hi');
	assert.equal(menfess.stats.totalStarted, 1);

	const flood = B.createFloodGuard({ maxMessages: 10, windowMs: 60_000 });
	flood.setChatLimit('strict@g.us', 2);
	const hits = [];
	flood.onFlood(f => hits.push(f.chat));
	const mk = (chat, id) => ({ key: { remoteJid: chat, id, participant: 'u@s' }, message: { conversation: 'x' } });
	flood.handler({ messages: [mk('strict@g.us', '1'), mk('strict@g.us', '2'), mk('lain@g.us', '3'), mk('lain@g.us', '4')] });
	assert.deepEqual(hits, ['strict@g.us'], 'per-chat override only');

	const filter = B.createWordFilter({ words: ['anjing', 'babi'] });
	assert.equal(filter.getCensored('dasar ANJING dan babi'), 'dasar A****G dan b**i');

	const gate = B.createGatekeeper();
	gate.banMany(['a', 'b', 'c'], 'x');
	assert.equal(gate.unbanAll(), 3);

	const warmup = B.createAccountWarmup({ ramp: [100] });
	warmup.pause();
	assert.equal(warmup.canSend(), false);
	warmup.resume();
	assert.equal(warmup.canSend(), true);

	const guard = B.createGroupOpGuard({ now: () => 0 });
	guard.configure('add', { max: 1 });
	guard.record('add');
	assert.equal(guard.check('add').allowed, false);

	const db = await B.createKVStore();
	db.set('a', 1);
	db.set('b', 2);
	assert.equal(db.size, 2, 'FIX: size getter must stay live after spread');
	assert.deepEqual(db.entries(), [['a', 1], ['b', 2]]);

	const notes = B.createNotes();
	notes.set('c', 'q1', 'isi1');
	assert.equal(notes.random('c').name, 'q1');
	assert.equal(notes.random('kosong'), null);
});

test('misc upgrades: todo/reminders/birthday/i18n/text/time/msg/group/health/watchdog/url/crash', async () => {
	let tt = 1000;
	const todos = B.createTodoList({ now: () => tt });
	todos.add('c', 'a');
	todos.add('c', 'b');
	todos.done('c', 1);
	todos.setDue('c', 2, 500);
	assert.equal(todos.renderCompact('c'), '1/2 selesai (1 telat ⏰)');

	let rt = 0;
	const reminders = B.createReminderManager({ now: () => rt });
	reminders.add({ chat: 'c', user: 'u', inMs: 1000 });
	reminders.add({ chat: 'c', user: 'u', inMs: 2000 });
	reminders.add({ chat: 'c', user: 'v', inMs: 3000 });
	assert.equal(reminders.cancelAllFor('u'), 2);
	reminders.clear();

	const fake = new Date('2026-09-28T08:00:00').getTime();
	const bdays = B.createBirthdayManager({ now: () => fake });
	bdays.set('u', { day: 30, month: 9 });
	assert.equal(bdays.nextBirthday('u'), 2);
	assert.equal(bdays.nextBirthday('x'), null);

	const i18n = B.createI18n();
	i18n.addLanguage('en', { hi: 'Hello' });
	assert.ok(i18n.has('hi') && !i18n.has('nope'));

	assert.equal(B.styleText('halo?', 'upsideDown'), '¿ol\u0250\u0265');
	assert.ok(B.listTextStyles().includes('upsideDown'));
	assert.ok(B.humanDate(new Date('2026-09-28').getTime(), 'id').includes('September'));
	assert.equal(B.getMediaCaption({ message: { viewOnceMessageV2: { message: { videoMessage: { caption: 'vo' } } } } }), 'vo');

	const meta = { participants: [{ id: 'adm@s', admin: 'admin' }, { id: 'a@s' }, { id: 'b@s' }] };
	assert.equal(B.pickRandomMember(meta, { excludeAdmins: true, random: () => 0 }), 'a@s');
	assert.equal(B.pickRandomMember(meta, { exclude: ['a@s', 'b@s', 'adm@s'] }), null);

	const monitor = B.createHealthMonitor({ thresholds: { jobs: 5 } });
	let probeValue = 9;
	monitor.addProbe('jobs', () => probeValue);
	const recovered = [];
	monitor.onRecover(r => recovered.push(r.metric));
	await monitor.snapshot();
	probeValue = 1;
	await monitor.snapshot();
	assert.deepEqual(recovered, ['jobs']);

	let wt = 0;
	const watchdog = B.createConnectionWatchdog({ staleMs: 1000, now: () => wt });
	watchdog.touch();
	wt = 500;
	assert.equal(watchdog.check().stale, false);
	watchdog.setStaleMs(300);
	assert.equal(watchdog.check().stale, true);

	const watcher = B.createUrlWatcher('http://a/x', { fetchImpl: async (u) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => u }) });
	await watcher.check();
	watcher.setUrl('http://b/y');
	const r = await watcher.check();
	assert.equal(r.changed, false, 'setUrl resets the baseline');
	assert.equal(watcher.lastBody, 'http://b/y');

	const silent = { error: () => { }, child: () => silent };
	const crash = B.installCrashGuard({ logger: silent });
	process.listeners('uncaughtException').at(-1)(new Error('boom-x'));
	assert.equal(crash.lastError.error.message, 'boom-x');
	crash.uninstall();
});

test('banner v3 + timer-reference fixes are in the source', () => {
	const banner = readFileSync(new URL('../lib/Utils/banner.js', import.meta.url), 'utf8');
	assert.ok(banner.includes('THEMES'), 'gradient themes');
	assert.ok(banner.includes('JAP_BANNER_THEME'), 'theme env override');
	assert.ok(banner.includes('columns < 56'), 'adaptive compact mode');
	assert.ok(banner.includes('heap'), 'heap reading');

	const pairing = readFileSync(new URL('../lib/Utils/pairing-tools.js', import.meta.url), 'utf8');
	assert.ok(pairing.includes('must stay REFERENCED'), 'pairing timeout fix documented');
	assert.ok(!/timer\.unref/.test(pairing), 'pairing timeout no longer unref-able');

	const reminders = readFileSync(new URL('../lib/Utils/reminders.js', import.meta.url), 'utf8');
	assert.ok(reminders.includes('keep this 0ms timer referenced'), 'late-restore fix documented');
});

test('type definitions declare the round', () => {
	for (const mod of ['emoji-tools', 'array-tools', 'validate-tools', 'timing-tools', 'task-queue', 'mask-tools']) {
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts`);
	}
	const checks = [
		['router.d.ts', ['mentions', 'isOwner']],
		['economy.d.ts', ['getBalanceCard']],
		['giveaway.d.ts', ['reroll']],
		['kv-store.d.ts', ['entries()']],
		['fancy-text.d.ts', ['upsideDown']],
		['crash-guard.d.ts', ['lastError']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const n of needles) {
			assert.ok(src.includes(n), `${file}: ${n}`);
		}
	}
});
