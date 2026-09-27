// Tests for the builders/VoIP round: AIRich markdown/checklist/key-value/
// progress upgrades, button extras, call log + call-guard quiet hours,
// always-online, status watcher, and 10 runtime upgrades across the
// community modules.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	AIRich,
	quickButtons,
	createCallLog,
	createCallGuard,
	createAlwaysOnline,
	createStatusWatcher,
	createGatekeeper,
	createFloodGuard,
	createEconomy,
	createShop,
	createWarnManager,
	createLevelSystem,
	createQuotaManager,
	createTierManager,
	createReminderManager,
	createTodoList
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
		emit: (event, payload) => Promise.all((handlers[event] || []).map(fn => fn(payload)))
	};
};

const fakeClient = { logger: null };

// ------------------------------------------------------------------ AIRich

test('AIRich.addMarkdown/fromMarkdown dispatches headings, code, tables, text', () => {
	const md = [
		'# Judul',
		'',
		'paragraf pembuka',
		'dua baris',
		'',
		'```js',
		'const x = 1;',
		'```',
		'',
		'| A | B |',
		'| --- | --- |',
		'| 1 | 2 |',
		'',
		'penutup'
	].join('\n');
	const card = AIRich.fromMarkdown(md, fakeClient);
	const types = card._submessages.map(m => m.messageType);
	assert.deepEqual(types, [2, 2, 5, 4, 2], 'heading, paragraph, code, table, paragraph');
	assert.equal(card._submessages[0].messageText, 'Judul');
	assert.ok(card._submessages[1].messageText.includes('paragraf pembuka'));
	assert.equal(card._submessages[2].codeMetadata.codeLanguage, 'js');
	assert.throws(() => new AIRich(fakeClient).addMarkdown(42), TypeError);
	// chainable on an existing instance too
	const chained = new AIRich(fakeClient).addMarkdown('# Satu').addMarkdown('teks');
	assert.equal(chained._submessages.length, 2);
});

test('AIRich addChecklist / addKeyValue / addProgressBar', () => {
	const checklist = new AIRich(fakeClient).addChecklist(['beli galon', { text: 'bayar wifi', done: true }]);
	assert.ok(checklist._submessages[0].messageText.includes('- [ ] beli galon'));
	assert.ok(checklist._submessages[0].messageText.includes('- [x] bayar wifi'));
	assert.throws(() => new AIRich(fakeClient).addChecklist([]), TypeError);

	const kv = new AIRich(fakeClient).addKeyValue({ Nama: 'JAP', Versi: '2.4.2' });
	assert.equal(kv._submessages[0].messageType, 4, 'renders as a table');
	assert.throws(() => new AIRich(fakeClient).addKeyValue({}), TypeError);

	const progress = new AIRich(fakeClient).addProgressBar('Download', 70, 100);
	const text = progress._submessages[0].messageText;
	assert.ok(text.includes('Download') && text.includes('70%') && text.includes('█'));
});

// ----------------------------------------------------------- button extras

test('quickButtons builds sendButtons-ready arrays', () => {
	const buttons = quickButtons(['Ya', 'Tidak', { id: 'custom', text: 'Custom' }]);
	assert.deepEqual(buttons, [
		{ id: 'qb_0', text: 'Ya' },
		{ id: 'qb_1', text: 'Tidak' },
		{ id: 'custom', text: 'Custom' }
	]);
	assert.equal(quickButtons(['x'], { idPrefix: 'opt' })[0].id, 'opt_0');
	assert.throws(() => quickButtons([]), /non-empty/);
});

// ------------------------------------------------------- call log + guard

test('call log: outcomes, durations, per-caller stats, persistence', async () => {
	let t = 1000;
	const log = createCallLog({ now: () => t });
	const sock = { ev: makeEv() };
	log.bind(sock);
	const ended = [];
	log.onEnded(e => ended.push([e.outcome, e.durationMs]));

	await sock.ev.emit('call', [{ id: 'c1', from: 'a@s.whatsapp.net', status: 'offer', isVideo: false }]);
	t = 31_000;
	await sock.ev.emit('call', [{ id: 'c1', from: 'a@s.whatsapp.net', status: 'accept' }]);
	t = 61_000;
	await sock.ev.emit('call', [{ id: 'c1', from: 'a@s.whatsapp.net', status: 'terminate' }]);
	await sock.ev.emit('call', [{ id: 'c2', from: 'a@s.whatsapp.net', status: 'offer', isVideo: true }]);
	t = 75_000;
	await sock.ev.emit('call', [
		{ id: 'c2', from: 'a@s.whatsapp.net', status: 'timeout' },
		{ id: 'c2', from: 'a@s.whatsapp.net', status: 'terminate' }
	]);

	assert.deepEqual(ended, [['accepted', 60_000], ['missed', 14_000]]);
	const stats = log.getCallerStats('a@s.whatsapp.net');
	assert.equal(stats.calls, 2);
	assert.equal(stats.video, 1);
	assert.deepEqual(stats.outcomes, { accepted: 1, missed: 1 });
	assert.equal(log.getHistory()[0].id, 'c2', 'newest first');
	assert.equal(log.getHistory({ from: 'ghost@s' }).length, 0);
	assert.equal(log.getCallerStats('ghost@s'), null);

	const restored = createCallLog();
	restored.load(log.toJSON());
	assert.equal(restored.getCallerStats('a@s.whatsapp.net').calls, 2);
});

test('call guard upgrade: quiet-hours schedule and denylist', async () => {
	let fake = new Date('2026-09-27T23:00:00').getTime(); // inside 22:00-06:00
	const rejected = [];
	const sock = { ev: makeEv(), rejectCall: async (_id, from) => rejected.push(from), sendMessage: async () => ({}) };
	const guard = createCallGuard({
		autoReject: true,
		schedule: { from: '22:00', to: '06:00' },
		denylist: ['pest@s.whatsapp.net'],
		allowlist: ['vip@s.whatsapp.net'],
		now: () => fake
	});
	guard.bind(sock);

	await sock.ev.emit('call', [{ id: '1', from: 'x@s.whatsapp.net', status: 'offer' }]); // quiet → reject
	await sock.ev.emit('call', [{ id: '2', from: 'vip@s.whatsapp.net', status: 'offer' }]); // allowlist wins
	fake = new Date('2026-09-28T10:00:00').getTime(); // daytime
	await sock.ev.emit('call', [{ id: '3', from: 'y@s.whatsapp.net', status: 'offer' }]); // outside window
	await sock.ev.emit('call', [{ id: '4', from: 'pest@s.whatsapp.net', status: 'offer' }]); // denylist always

	assert.deepEqual(rejected, ['x@s.whatsapp.net', 'pest@s.whatsapp.net']);
	assert.throws(() => createCallGuard({ schedule: { from: '25:00', to: '06:00' } }), /HH:MM/);
});

// ----------------------------------------------- always online + statuses

test('always-online pushes presence, survives failures, switches live', async () => {
	const pushed = [];
	let failing = false;
	const sock = {
		sendPresenceUpdate: async (presence) => {
			if (failing) {
				throw new Error('mid-reconnect');
			}
			pushed.push(presence);
		}
	};
	const online = createAlwaysOnline(sock, { intervalMs: 50 });
	await online.push();
	online.setPresence('unavailable');
	await online.push();
	failing = true;
	await online.push(); // must not throw
	assert.deepEqual(pushed, ['available', 'unavailable']);
	assert.deepEqual(online.stats, { updates: 2, failures: 1 });
	const stop = online.start();
	assert.equal(online.isRunning, true);
	stop();
	assert.equal(online.isRunning, false);
	assert.throws(() => createAlwaysOnline(null), /requires a socket/);
});

test('status watcher: statuses only, contact filters, counters', async () => {
	const watcher = createStatusWatcher();
	const seen = [];
	watcher.onStatus(s => seen.push([s.sender, s.mediaType, typeof s.download]));
	const sock = { ev: makeEv() };
	watcher.bind(sock);

	await sock.ev.emit('messages.upsert', {
		messages: [
			{ key: { remoteJid: 'status@broadcast', id: '1', participant: 'a@s.whatsapp.net' }, message: { imageMessage: {} } },
			{ key: { remoteJid: 'status@broadcast', id: '2', participant: 'b@s.whatsapp.net' }, message: { conversation: 'text status' } },
			{ key: { remoteJid: 'g@g.us', id: '3', participant: 'a@s.whatsapp.net' }, message: { imageMessage: {} } }, // not a status
			{ key: { remoteJid: 'status@broadcast', id: '4', participant: 'a@s.whatsapp.net', fromMe: true }, message: { imageMessage: {} } } // own
		]
	});
	assert.deepEqual(seen, [
		['a@s.whatsapp.net', 'image', 'function'],
		['b@s.whatsapp.net', 'text', 'function']
	]);
	assert.equal(watcher.getSeen('a@s.whatsapp.net'), 1);
	assert.equal(watcher.totalSeen, 2);

	const filtered = createStatusWatcher({ contacts: ['only@s.whatsapp.net'], includeText: false });
	const seen2 = [];
	filtered.onStatus(() => seen2.push(1));
	filtered.handler({ messages: [{ key: { remoteJid: 'status@broadcast', id: '5', participant: 'other@s' }, message: { imageMessage: {} } }] });
	filtered.handler({ messages: [{ key: { remoteJid: 'status@broadcast', id: '6', participant: 'only@s.whatsapp.net' }, message: { conversation: 'x' } }] });
	assert.equal(seen2.length, 0, 'contact filter + includeText:false respected');
});

// ---------------------------------------------------- ten runtime upgrades

test('temp bans, flood auto-mute, bank interest, shop per-user caps', async () => {
	const gate = createGatekeeper();
	gate.banUser('tmp@s.whatsapp.net', 'spam', { expiresInMs: 50 });
	assert.equal(gate.isBannedUser('tmp@s.whatsapp.net'), true);
	await new Promise(r => setTimeout(r, 80));
	assert.equal(gate.isBannedUser('tmp@s.whatsapp.net'), false, 'ban expired');
	assert.equal(gate.allowsJid('tmp@s.whatsapp.net', 'g@g.us'), true);
	gate.banUser('perm@s.whatsapp.net', 'forever');
	assert.equal(gate.isBannedUser('perm@s.whatsapp.net'), true, 'permanent bans unaffected');

	const flood = createFloodGuard({ maxMessages: 2, windowMs: 100, autoMuteMs: 60_000 });
	const floods = [];
	flood.onFlood(f => floods.push(f.mutedUntil > Date.now()));
	const mk = (id) => ({ key: { remoteJid: 'g@g.us', id, participant: 'u@s' }, message: { conversation: 'x' } });
	flood.handler({ messages: [mk('1'), mk('2'), mk('3')] });
	assert.deepEqual(floods, [true]);
	assert.equal(flood.isMuted('g@g.us', 'u@s'), true);
	flood.unmute('g@g.us', 'u@s');
	assert.equal(flood.isMuted('g@g.us', 'u@s'), false);
	flood.muteFor('g@g.us', 'z@s', 1000);
	assert.equal(flood.isMuted('g@g.us', 'z@s'), true);

	const eco = createEconomy();
	eco.add('a', 1000);
	eco.deposit('a', 500);
	eco.add('b', 100); // wallet only — no interest
	const interest = eco.applyInterest(0.1);
	assert.deepEqual(interest, { users: 1, totalAdded: 50 });
	assert.equal(eco.getBankBalance('a'), 550);
	assert.throws(() => eco.applyInterest(0), /positive/);

	const shop = createShop(eco);
	shop.addItem({ id: 'vip', name: 'VIP', price: 100, maxPerUser: 1 });
	shop.buy('a', 'vip');
	assert.throws(() => shop.buy('a', 'vip'), /per-user limit/);
});

test('warn decay, level multipliers, quota limits, tier expiring, snooze, due dates', async () => {
	const warns = createWarnManager();
	warns.warn('a@s', { chat: 'g' });
	warns.warn('a@s', { chat: 'g' });
	await new Promise(r => setTimeout(r, 60));
	warns.warn('a@s', { chat: 'g' });
	assert.equal(warns.decay(50), 2, 'old warns expired');
	assert.equal(warns.getCount('a@s', 'g'), 1);

	const levels = createLevelSystem({ xpPerMessage: 10, cooldownMs: 0 });
	levels.setMultiplier(2);
	levels.setMultiplier(3, 'boost@g.us');
	const msg = (id, chat) => ({ key: { remoteJid: chat, id, participant: 'u@s' }, message: { conversation: 'x' } });
	levels.handler({ type: 'notify', messages: [msg('1', 'a@g.us')] }); // 10*2
	levels.handler({ type: 'notify', messages: [msg('2', 'boost@g.us')] }); // 10*3
	assert.equal(levels.getUser('u@s').xp, 50);
	assert.equal(levels.getMultiplier('boost@g.us'), 3);
	assert.equal(levels.getMultiplier(), 2);
	levels.clearMultiplier();
	assert.equal(levels.getMultiplier(), 1);
	assert.throws(() => levels.setMultiplier(-1), /non-negative/);

	const quota = createQuotaManager({ defaultLimit: 1 });
	quota.consume('u');
	assert.equal(quota.consume('u').allowed, false);
	quota.setDefaultLimit(5);
	assert.equal(quota.consume('u').allowed, true);
	quota.setLimit('gold', 99);
	assert.equal(quota.getLimit('gold'), 99);
	assert.equal(quota.getLimit(), 5);

	let t = 0;
	const tiers = createTierManager({ now: () => t });
	tiers.setTier('soon@s', 'premium', { hours: 1 });
	tiers.setTier('later@s', 'premium', { days: 30 });
	tiers.setTier('life@s', 'vip');
	const expiring = tiers.getExpiring(2 * 3_600_000);
	assert.equal(expiring.length, 1);
	assert.equal(expiring[0].user, 'soon@s');
	assert.equal(expiring[0].remainingMs, 3_600_000);

	let rt = 0;
	const reminders = createReminderManager({ now: () => rt });
	const id = reminders.add({ chat: 'c', user: 'u', inMs: 1000 });
	assert.equal(reminders.snooze(id, 5000), 6000);
	assert.equal(reminders.list()[0].dueAt, 6000);
	assert.equal(reminders.snooze(999, 100), null);
	reminders.clear();

	let tt = 1000;
	const todos = createTodoList({ now: () => tt });
	todos.add('g', 'laporan');
	todos.add('g', 'santai');
	assert.equal(todos.setDue('g', 1, 500), true);
	const overdue = todos.getOverdue('g');
	assert.equal(overdue.length, 1);
	assert.equal(overdue[0].text, 'laporan');
	assert.ok(todos.render('g').includes('laporan ⏰'));
	assert.ok(!todos.render('g').includes('santai ⏰'));
	todos.done('g', 1);
	assert.equal(todos.getOverdue('g').length, 0, 'done tasks are never overdue');
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['call-log', 'always-online', 'status-watcher', 'button-extras']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const airichDts = readFileSync(new URL('../lib/Builders/AIRich.d.ts', import.meta.url), 'utf8');
	for (const bit of ['addMarkdown', 'addChecklist', 'addKeyValue', 'addProgressBar', 'fromMarkdown']) {
		assert.ok(airichDts.includes(bit), `AIRich.d.ts declares ${bit}`);
	}
	const checks = [
		['call-guard.d.ts', ['denylist', 'schedule']],
		['gatekeeper.d.ts', ['expiresInMs']],
		['flood-guard.d.ts', ['autoMuteMs', 'isMuted', 'muteFor']],
		['economy.d.ts', ['applyInterest']],
		['shop.d.ts', ['maxPerUser']],
		['warn-manager.d.ts', ['decay(']],
		['level-system.d.ts', ['setMultiplier']],
		['quota.d.ts', ['setLimit']],
		['tiers.d.ts', ['getExpiring']],
		['reminders.d.ts', ['snooze(']],
		['todo.d.ts', ['setDue', 'getOverdue']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const needle of needles) {
			assert.ok(src.includes(needle), `${file} declares ${needle}`);
		}
	}
});
