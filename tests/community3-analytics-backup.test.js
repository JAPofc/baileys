// Tests for round: command analytics, anti-tagall guard, shop & inventory,
// group backup/diff/restore, menfess relay, plus upgrades — economy bet with
// injectable RNG, level-system rank titles, verifier challenge presets and
// the WA version bump.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createCommandStats,
	createAntiTagAllGuard,
	createShop,
	createEconomy,
	backupGroup,
	diffGroupBackup,
	restoreGroupSettings,
	createMenfessRelay,
	createVerifier,
	mathChallenge,
	emojiChallenge,
	createLevelSystem
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

// ------------------------------------------------------------ command stats

test('command stats: counters, tops, hourly histogram, middleware, persistence', async () => {
	let t = new Date('2026-09-27T14:00:00').getTime();
	const stats = createCommandStats({ now: () => t });
	stats.record('sticker', 'a@s.whatsapp.net', 'g@g.us');
	stats.record('sticker', 'b@s.whatsapp.net', 'g@g.us');
	stats.record('menu', 'a@s.whatsapp.net', 'dm@s.whatsapp.net');
	const mw = stats.middleware();
	let nextRan = false;
	await mw({ command: 'sticker', sender: 'a@s.whatsapp.net', jid: 'g@g.us' }, async () => {
		nextRan = true;
	});
	assert.equal(nextRan, true, 'middleware calls next()');
	assert.equal(stats.totalCommands, 4);
	assert.deepEqual(stats.getTopCommands(1), [{ command: 'sticker', count: 3 }]);
	assert.equal(stats.getTopUsers(1)[0].user, 'a@s.whatsapp.net');
	assert.equal(stats.getBusiestHours()[14], 4, 'hour histogram counts local hour');
	const cmd = stats.getCommandStats('sticker');
	assert.equal(cmd.users, 2);
	assert.equal(cmd.chats, 1);
	assert.equal(cmd.topUsers[0].user, 'a@s.whatsapp.net');
	assert.equal(stats.getUserStats('a@s.whatsapp.net').commands[0].command, 'sticker');
	assert.equal(stats.getCommandStats('nope'), null);

	const restored = createCommandStats();
	restored.load(stats.toJSON());
	assert.equal(restored.totalCommands, 4);
	assert.equal(restored.getBusiestHours()[14], 4);
	assert.equal(restored.getCommandStats('menu').count, 1);
});

// -------------------------------------------------------------- anti-tagall

test('anti-tagall: hidetag vs visible, threshold, exemptions, auto-delete', async () => {
	const deleted = [];
	const sock = { ev: makeEv(), sendMessage: async (_jid, content) => deleted.push(content) };
	const guard = createAntiTagAllGuard({ threshold: 3, autoDelete: true, exemptUsers: ['adm@s.whatsapp.net'] });
	guard.bind(sock);
	const hits = [];
	guard.onDetected(d => hits.push(d));

	const jids = ['1@s.whatsapp.net', '2@s.whatsapp.net', '3@s.whatsapp.net', '4@s.whatsapp.net'];
	const mk = (id, participant, text, mentioned) => ({
		key: { remoteJid: 'g@g.us', id, participant },
		message: { extendedTextMessage: { text, contextInfo: { mentionedJid: mentioned } } }
	});
	await sock.ev.emit('messages.upsert', {
		messages: [
			mk('1', 'spam@s.whatsapp.net', 'woi semua', jids), // hidetag
			mk('2', 'ok@s.whatsapp.net', 'halo @1 @2', jids.slice(0, 2)), // below threshold
			mk('3', 'adm@s.whatsapp.net', 'rapat', jids), // exempt
			mk('4', 'vis@s.whatsapp.net', '@1 @2 @3 @4 kumpul', jids) // visible tag-all
		]
	});
	assert.equal(hits.length, 2);
	assert.equal(hits[0].hidden, true, 'no @user written → hidetag');
	assert.equal(hits[0].mentionCount, 4);
	assert.equal(hits[0].deleted, true);
	assert.equal(hits[1].hidden, false, 'mentions written out → visible tag-all');
	assert.equal(deleted.length, 2);

	// dynamic exemption + DM ignored
	const dyn = createAntiTagAllGuard({ threshold: 2, isExempt: async ({ sender }) => sender === 'boss@s.whatsapp.net' });
	const dynHits = [];
	dyn.onDetected(d => dynHits.push(d));
	await dyn.handler({ messages: [mk('5', 'boss@s.whatsapp.net', 'x', jids)] });
	await dyn.handler({ messages: [{ key: { remoteJid: 'dm@s.whatsapp.net', id: '6' }, message: { extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: jids } } } }] });
	assert.equal(dynHits.length, 0, 'dynamic exemption + groups-only respected');
});

// ------------------------------------------------------- shop & economy bet

test('shop: buy/stock/use/sell-back/gift and persistence', () => {
	const eco = createEconomy();
	eco.add('u@s.whatsapp.net', 1000);
	const shop = createShop(eco);
	shop.addItem({ id: 'potion', name: 'Potion', price: 250, consumable: true });
	shop.addItem({ id: 'vip', name: 'VIP', price: 400, stock: 1 });

	const purchase = shop.buy('u@s.whatsapp.net', 'potion', 2);
	assert.equal(purchase.paid, 500);
	assert.equal(eco.getBalance('u@s.whatsapp.net'), 500);
	shop.buy('u@s.whatsapp.net', 'vip');
	assert.throws(() => shop.buy('u@s.whatsapp.net', 'vip'), /out of stock/);
	assert.throws(() => shop.buy('u@s.whatsapp.net', 'potion', 99), /insufficient/);
	assert.throws(() => shop.buy('u@s.whatsapp.net', 'ghost'), /unknown item/);

	const used = [];
	shop.onUse(u => used.push(u.item.id));
	assert.equal(shop.useItem('u@s.whatsapp.net', 'potion'), 1, 'consumable decrements');
	assert.equal(shop.useItem('u@s.whatsapp.net', 'vip'), 1, 'non-consumable stays');
	assert.deepEqual(used, ['potion', 'vip']);

	const sellback = shop.sellBack('u@s.whatsapp.net', 'potion');
	assert.equal(sellback.refund, 125, '50% sell rate, floored');
	assert.equal(shop.hasItem('u@s.whatsapp.net', 'potion'), false);

	shop.giveItem('u@s.whatsapp.net', 'friend@s.whatsapp.net', 'vip');
	assert.equal(shop.hasItem('friend@s.whatsapp.net', 'vip'), true);
	assert.throws(() => shop.giveItem('u@s.whatsapp.net', 'x@s.whatsapp.net', 'vip'), /not enough/);

	const restored = createShop(createEconomy());
	restored.load(shop.toJSON());
	assert.equal(restored.getItem('vip').stock, 0, 'sold-out stock survives JSON roundtrip (gifts do not restock)');
	assert.equal(restored.getItem('potion').stock, Infinity, 'unlimited stock survives JSON roundtrip');
	assert.equal(restored.hasItem('friend@s.whatsapp.net', 'vip'), true);
	assert.throws(() => createShop({}), /createEconomy/);
});

test('economy bet: injectable RNG makes outcomes deterministic', () => {
	const winner = createEconomy({ random: () => 0.3 });
	winner.add('u', 100);
	const win = winner.bet('u', 100, { winChance: 0.5, multiplier: 2 });
	assert.deepEqual(win, { won: true, payout: 100, balance: 200 });

	const loser = createEconomy({ random: () => 0.9 });
	loser.add('x', 100);
	const loss = loser.bet('x', 100);
	assert.equal(loss.won, false);
	assert.equal(loss.payout, -100);
	assert.equal(loser.getBalance('x'), 0);
	assert.throws(() => loser.bet('x', 50), /insufficient/);
	assert.throws(() => loser.bet('x', -5), /positive/);

	const tx = [];
	const tracked = createEconomy({ random: () => 0.1 });
	tracked.onTransaction(e => tx.push(e.type));
	tracked.add('t', 10);
	tracked.bet('t', 10);
	assert.deepEqual(tx, ['add', 'bet-win']);
});

// -------------------------------------------- level ranks & verifier presets

test('level system rank titles and rank-up detection', () => {
	const levels = createLevelSystem({ ranks: [{ minLevel: 0, title: 'Newbie' }, { minLevel: 2, title: 'Pro' }] });
	const ups = [];
	levels.onLevelUp(e => ups.push([e.level, e.rank, e.rankUp]));
	levels.addXp('u', 100); // level 1 — still Newbie
	levels.addXp('u', 300); // level 2 — Pro
	assert.equal(levels.getUser('u').rank, 'Pro');
	assert.deepEqual(ups, [[1, 'Newbie', false], [2, 'Pro', true]]);
	assert.equal(levels.rankOf(0), 'Newbie');
	assert.equal(levels.rankOf(99), 'Pro');
	// default ranks present when not configured
	const defaults = createLevelSystem();
	assert.equal(defaults.rankOf(0), 'Newbie');
	assert.equal(defaults.rankOf(50), 'Legend');
});

test('verifier challenge presets: math and emoji', () => {
	const math = mathChallenge();
	assert.match(math.question, /^\d \+ \d = \?$/);
	const [a, , b] = math.question.split(' ');
	assert.equal(String(+a + +b), math.answer);

	const emoji = emojiChallenge();
	assert.ok(emoji.question.includes(emoji.answer), 'emoji question contains the answer emoji');

	const verifier = createVerifier({ challenge: 'emoji', timeoutMs: 0 });
	const c = verifier.challenge('u@s.whatsapp.net', 'g@g.us');
	assert.ok(c.question.startsWith('type this emoji:'));
	assert.equal(verifier.verify('u@s.whatsapp.net', 'g@g.us', c.answer), 'verified');
});

// ------------------------------------------------------------- group backup

test('group backup: snapshot, diff and settings restore', async () => {
	const meta = {
		id: 'g@g.us',
		subject: 'Grup A',
		desc: 'old desc',
		announce: false,
		restrict: false,
		joinApprovalMode: false,
		ephemeralDuration: 0,
		participants: [
			{ id: 'a@s.whatsapp.net', admin: 'superadmin' },
			{ id: 'b@s.whatsapp.net', admin: null },
			{ id: 'c@s.whatsapp.net', admin: null }
		]
	};
	const backup = await backupGroup({ groupMetadata: async () => meta }, 'g@g.us');
	assert.equal(backup.type, 'jap-group-backup');
	assert.equal(backup.size, 3);
	assert.equal(backup.subject, 'Grup A');
	assert.equal(backup.participants[0].admin, 'superadmin');
	assert.ok(!JSON.stringify(backup).includes('creds'), 'no auth material inside');

	const meta2 = {
		...meta,
		subject: 'Grup B',
		announce: true,
		participants: [
			{ id: 'a@s.whatsapp.net', admin: 'superadmin' },
			{ id: 'c@s.whatsapp.net', admin: 'admin' },
			{ id: 'd@s.whatsapp.net', admin: null }
		]
	};
	const diff = await diffGroupBackup({ groupMetadata: async () => meta2 }, backup);
	assert.deepEqual(diff.joined, ['d@s.whatsapp.net']);
	assert.deepEqual(diff.left, ['b@s.whatsapp.net']);
	assert.deepEqual(diff.promoted, ['c@s.whatsapp.net']);
	assert.deepEqual(diff.demoted, []);
	assert.ok(diff.changed.includes('subject') && diff.changed.includes('announce'));
	assert.ok(!diff.changed.includes('restrict'));
	await assert.rejects(() => diffGroupBackup({}, { type: 'nope' }), /not a group backup/);

	const calls = [];
	const sock = {
		groupUpdateSubject: async (_j, s) => calls.push(['subject', s]),
		groupUpdateDescription: async (_j, d) => calls.push(['description', d]),
		groupSettingUpdate: async (_j, s) => calls.push(['setting', s]),
		groupToggleEphemeral: async () => {
			throw new Error('not allowed');
		}
	};
	const result = await restoreGroupSettings(sock, { ...backup, ephemeralDuration: 86400 });
	assert.ok(result.applied.includes('subject'));
	assert.ok(result.applied.includes('announce') && result.applied.includes('restrict'));
	assert.equal(result.errors.length, 1, 'failed step reported, restore continues');
	assert.equal(result.errors[0].step, 'ephemeral');
	assert.ok(calls.some(c => c[0] === 'setting' && c[1] === 'not_announcement'));
});

// ------------------------------------------------------------------ menfess

test('menfess: anonymous start, two-way relay, aliases never leak identities', async () => {
	const sent = [];
	const sock = { ev: makeEv(), sendMessage: async (jid, content) => sent.push([jid, content.text]) };
	const menfess = createMenfessRelay();
	menfess.bind(sock);
	const relayed = [];
	menfess.onRelayed(r => relayed.push(r.direction));

	await menfess.start(sock, 'pengirim@s.whatsapp.net', 'target@s.whatsapp.net', 'suka sama kamu');
	assert.equal(sent[0][0], 'target@s.whatsapp.net');
	assert.ok(sent[0][1].includes('Anon-1'));
	assert.ok(sent[0][1].includes('suka sama kamu'));
	assert.ok(!sent[0][1].includes('pengirim'), 'sender identity hidden');
	assert.equal(menfess.isInSession('pengirim@s.whatsapp.net'), true);
	assert.equal(menfess.getSession('target@s.whatsapp.net').aliasB, 'Anon-2');

	await sock.ev.emit('messages.upsert', {
		messages: [{ key: { remoteJid: 'target@s.whatsapp.net', id: 'r1' }, message: { conversation: 'siapa nih?' } }]
	});
	assert.equal(sent[1][0], 'pengirim@s.whatsapp.net');
	assert.ok(sent[1][1].includes('Anon-2'));
	assert.ok(!sent[1][1].includes('target'), 'replier identity hidden too');
	assert.deepEqual(relayed, ['a->b', 'b->a']);

	await assert.rejects(() => menfess.start(sock, 'lain@s.whatsapp.net', 'target@s.whatsapp.net', 'x'), /busy/);
	await assert.rejects(() => menfess.start(sock, 'z@s.whatsapp.net', 'z@s.whatsapp.net', 'x'), /yourself/);
});

test('menfess: stop words, TTL expiry, group messages ignored', async () => {
	let t = 0;
	const sent = [];
	const sock = { ev: makeEv(), sendMessage: async (jid, content) => sent.push([jid, content.text]) };
	const menfess = createMenfessRelay({ sessionTtlMs: 1000, now: () => t });
	menfess.bind(sock);
	const ended = [];
	menfess.onEnded(e => ended.push(e.reason));

	await menfess.start(sock, 'a@s.whatsapp.net', 'b@s.whatsapp.net', 'halo');
	await sock.ev.emit('messages.upsert', {
		messages: [{ key: { remoteJid: 'g@g.us', id: 'g1', participant: 'a@s.whatsapp.net' }, message: { conversation: 'di grup' } }]
	});
	assert.equal(sent.length, 1, 'group traffic never relayed');

	await sock.ev.emit('messages.upsert', {
		messages: [{ key: { remoteJid: 'a@s.whatsapp.net', id: 's1' }, message: { conversation: ' STOP ' } }]
	});
	assert.deepEqual(ended, ['stopped']);
	assert.equal(menfess.size, 0);
	assert.equal(sent[1][0], 'b@s.whatsapp.net', 'other side notified of the ending');

	await menfess.start(sock, 'a@s.whatsapp.net', 'b@s.whatsapp.net', 'lagi');
	t = 5000; // beyond TTL
	await sock.ev.emit('messages.upsert', {
		messages: [{ key: { remoteJid: 'b@s.whatsapp.net', id: 'r2' }, message: { conversation: 'telat' } }]
	});
	assert.deepEqual(ended, ['stopped', 'expired']);
	assert.equal(menfess.size, 0);
});

// ------------------------------------------------- version bump & exports

test('WA web version bumped to the live revision', () => {
	const defaults = readFileSync(new URL('../lib/Defaults/index.js', import.meta.url), 'utf8');
	assert.match(defaults, /\[2, 3000, 1048590665\]/, 'baked version matches live sw.js revision');
	assert.ok(!defaults.includes('1048570357'), 'old revision gone');
});

test('barrel and type definitions export the new modules and upgrades', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['command-stats', 'anti-tagall', 'shop', 'group-backup', 'menfess']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const verifierDts = readFileSync(new URL('../lib/Utils/verifier.d.ts', import.meta.url), 'utf8');
	assert.ok(verifierDts.includes('emojiChallenge') && verifierDts.includes("challenge?: 'math' | 'emoji'"));
	const levelDts = readFileSync(new URL('../lib/Utils/level-system.d.ts', import.meta.url), 'utf8');
	assert.ok(levelDts.includes('rankOf') && levelDts.includes('rankUp'));
	const ecoDts = readFileSync(new URL('../lib/Utils/economy.d.ts', import.meta.url), 'utf8');
	assert.ok(ecoDts.includes('bet(') && ecoDts.includes('random?'));
});
