// Tests for the social round: reputation, invite tracker, level rewards
// glue, marriage registry + small upgrades (currency format, quiz shuffle,
// voucher bulk minting, RPS series scoreboard, CLI calc).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as B from '../lib/index.js';

const makeEv = () => {
	const h = {};
	return {
		on: (e, f) => { (h[e] ||= []).push(f); },
		off: (e, f) => { h[e] = (h[e] || []).filter(x => x !== f); },
		emit: (e, p) => Promise.all((h[e] || []).map(f => f(p)))
	};
};

test('reputation: give/refusals, cooldown, leaderboard, persistence', () => {
	let t = 0;
	const rep = B.createReputation({ cooldownMs: 1000, now: () => t });
	const events = [];
	rep.onGive(e => events.push(e.total));

	assert.deepEqual(rep.give('a', 'a', 1), { ok: false, reason: 'self' });
	assert.deepEqual(rep.give('a', 'b', 5), { ok: false, reason: 'bad-amount' });
	assert.deepEqual(rep.give('a', 'b', 1, 'helpful'), { ok: true, total: 1 });
	const blocked = rep.give('a', 'b', 1);
	assert.equal(blocked.reason, 'cooldown');
	assert.equal(blocked.remainingMs, 1000);
	t = 1500;
	assert.deepEqual(rep.give('a', 'b', -1), { ok: true, total: 0 });
	assert.deepEqual(rep.give('c', 'b', 1), { ok: true, total: 1 }, 'different giver bypasses cooldown');

	const info = rep.getRep('b');
	assert.equal(info.up, 2);
	assert.equal(info.down, 1);
	assert.equal(info.history[0].reason, 'helpful');
	assert.equal(rep.getRep('ghost').total, 0);
	assert.equal(rep.getLeaderboard(1)[0].user, 'b');
	assert.ok(rep.renderCard('b').includes('rep 1 (👍 2 / 👎 1)'));
	assert.deepEqual(events, [1, 0, 1]);

	const restored = B.createReputation({ now: () => t });
	restored.load(rep.toJSON());
	assert.equal(restored.getRep('b').total, 1);
});

test('invite tracker: attribution, active vs total, leaderboard', async () => {
	const invites = B.createInviteTracker();
	const sock = { ev: makeEv() };
	invites.bind(sock);
	const events = [];
	invites.onInvite(e => events.push([e.inviter, e.invited]));

	await sock.ev.emit('group-participants.update', { id: 'g@g.us', action: 'add', author: 'adm@s', participants: ['x@s', 'y@s'] });
	await sock.ev.emit('group-participants.update', { id: 'g@g.us', action: 'add', author: 'b@s', participants: ['z@s'] });
	await sock.ev.emit('group-participants.update', { id: 'g@g.us', action: 'add', author: 'self@s', participants: ['self@s'] });
	assert.equal(events.length, 3, 'self-joins credit nobody');
	assert.deepEqual(invites.getCount('g@g.us', 'adm@s'), { total: 2, active: 2 });
	assert.equal(invites.getInviter('g@g.us', 'z@s'), 'b@s');

	await sock.ev.emit('group-participants.update', { id: 'g@g.us', action: 'remove', participants: ['x@s'] });
	assert.deepEqual(invites.getCount('g@g.us', 'adm@s'), { total: 2, active: 1 }, 'leaver decrements active');
	assert.equal(invites.getInviter('g@g.us', 'x@s'), null);

	const board = invites.getLeaderboard('g@g.us');
	assert.equal(board[0].inviter, 'adm@s');
	assert.ok(invites.renderLeaderboard('g@g.us').includes('🥇 @adm — 1 aktif (2 total)'));

	const restored = B.createInviteTracker();
	restored.load(invites.toJSON());
	assert.deepEqual(restored.getCount('g@g.us', 'adm@s'), { total: 2, active: 1 });
});

test('level rewards: thresholds pay once, multi-level jumps, managers wired', () => {
	const levels = B.createLevelSystem();
	const eco = B.createEconomy();
	let t = 0;
	const tiers = B.createTierManager({ now: () => t });
	const customs = [];
	const grants = [];
	const handle = B.attachLevelRewards(levels, {
		1: { balance: 100 },
		2: { balance: 500, tier: { name: 'silver', days: 30 } },
		5: { custom: (user, level) => customs.push([user, level]) }
	}, { economy: eco, tiers });
	handle.onGrant(g => grants.push(g.level));

	levels.addXp('u', 450); // jumps straight to level 2 → thresholds 1 AND 2
	assert.equal(eco.getBalance('u'), 600, 'both thresholds paid');
	assert.equal(tiers.isActive('u', 'silver'), true);
	assert.deepEqual(grants, [1, 2]);
	assert.equal(handle.hasClaimed('u', 1), true);
	assert.equal(handle.hasClaimed('u', 5), false);

	levels.addXp('u', 100 * 25); // well past level 5
	assert.deepEqual(customs, [['u', 5]]);
	levels.addXp('u', 100 * 100);
	assert.equal(eco.getBalance('u'), 600, 'no double payouts ever');

	assert.throws(() => B.attachLevelRewards({}, { 1: {} }), /createLevelSystem/);
	assert.throws(() => B.attachLevelRewards(levels, {}), /at least one/);
	handle();
});

test('marriage registry: full lifecycle, monogamy, couples list', () => {
	let t = 0;
	const nikah = B.createMarriageRegistry({ proposalTtlMs: 1000, now: () => t });
	const married = [];
	const divorced = [];
	nikah.onMarried(m => married.push([m.a, m.b]));
	nikah.onDivorced(d => divorced.push(d.lastedDays));

	assert.equal(nikah.propose('a', 'a').reason, 'self');
	assert.deepEqual(nikah.propose('a', 'b'), { ok: true, expiresAt: 1000 });
	assert.equal(nikah.propose('a', 'b').reason, 'already-proposed');
	assert.equal(nikah.accept('b', 'ghost').reason, 'no-proposal');
	assert.equal(nikah.accept('b', 'a').ok, true);
	assert.equal(nikah.isMarried('a') && nikah.isMarried('b'), true);
	assert.equal(nikah.getPartner('a'), 'b');

	assert.equal(nikah.propose('c', 'b').reason, 'target-married');
	assert.equal(nikah.propose('a', 'd').reason, 'you-are-married');

	t = 3 * 86_400_000;
	assert.equal(nikah.getMarriage('a').days, 3);
	assert.ok(nikah.renderCouples().includes('@a 💍 @b — 3 hari'));
	assert.equal(nikah.size, 1);

	const split = nikah.divorce('b');
	assert.equal(split.partner, 'a');
	assert.equal(split.lastedDays, 3);
	assert.equal(nikah.isMarried('a'), false);
	assert.deepEqual(divorced, [3]);
	assert.equal(nikah.divorce('a').reason, 'not-married');

	// proposals expire
	nikah.propose('x', 'y');
	t += 5000;
	assert.equal(nikah.accept('y', 'x').reason, 'no-proposal', 'TTL pruned');
	assert.deepEqual(married, [['a', 'b']]);
});

test('small upgrades: currency format, quiz shuffle, voucher bulk, RPS scoreboard, CLI calc', () => {
	const eco = B.createEconomy({ currency: '💎' });
	assert.equal(eco.format(1234567), '1.234.567 💎');

	const quiz = B.createQuizSession({ perQuestionMs: 0 });
	const asked = [];
	quiz.onQuestion(q => asked.push(q.question));
	const qs = [{ question: 'q1', answer: 1 }, { question: 'q2', answer: 2 }, { question: 'q3', answer: 3 }];
	quiz.start('c', qs, { shuffle: true, random: () => 0 }); // deterministic shuffle
	quiz.end('c');
	assert.equal(asked.length, 1);
	assert.ok(qs.some(q => q.question === asked[0]), 'question still from the set');

	const vouchers = B.createVoucherManager();
	const codes = vouchers.createMany(5, { payload: { balance: 100 } });
	assert.equal(codes.length, 5);
	assert.equal(new Set(codes).size, 5, 'all unique');
	assert.equal(vouchers.redeem('u', codes[0]).payload.balance, 100);
	assert.throws(() => vouchers.createMany(0), /1\.\.1000/);

	const rps = B.createRPS();
	rps.challenge('c', 'A@s', 'B@s', { rounds: 3 });
	rps.accept('c', 'B@s');
	rps.pick('c', 'A@s', 'batu');
	rps.pick('c', 'B@s', 'gunting');
	assert.equal(rps.renderSeries('c'), '🥊 Ronde 2/3 — @A 1 : 0 @B');
	assert.equal(rps.renderSeries('ghost'), null);

	const cli = new URL('../lib/cli.js', import.meta.url).pathname;
	const out = execFileSync(process.execPath, [cli, 'calc', '(1+2)^3 / 9'], { encoding: 'utf8' });
	assert.ok(out.includes('3'));
	assert.ok(out.includes('tiga'));
	assert.throws(() => execFileSync(process.execPath, [cli, 'calc', '1/0'], { encoding: 'utf8', stdio: 'pipe' }));
});

test('barrel and type definitions export the social reputation and rewards modules', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	for (const mod of ['reputation', 'invite-tracker', 'level-rewards', 'marriage']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts`);
	}
	for (const [file, needle] of [['economy.d.ts', 'format('], ['quiz.d.ts', 'shuffle?:'], ['voucher.d.ts', 'createMany'], ['rps.d.ts', 'renderSeries']]) {
		assert.ok(readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8').includes(needle), `${file}: ${needle}`);
	}
	const cli = readFileSync(new URL('../lib/cli.js', import.meta.url), 'utf8');
	assert.ok(cli.includes("case 'calc'"));
});
