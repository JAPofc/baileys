// Tests for the community events round: giveaways, attendance ("absen"),
// auctions ("lelang") and text polls — plus release version coverage.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createGiveaway,
	createAttendance,
	createAuction,
	createTextPoll
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

const msg = (chat, user, text) => ({
	key: { remoteJid: chat, id: `${Math.random()}`, participant: user },
	message: { conversation: text }
});

// ---------------------------------------------------------------- giveaway

test('giveaway: keyword entries, one per user, fair draw, render', async () => {
	const sock = { ev: makeEv() };
	const giveaway = createGiveaway({ keyword: 'ikut', random: () => 0 });
	giveaway.bind(sock);
	const joins = [];
	const ends = [];
	giveaway.onJoin(j => joins.push(j.user));
	giveaway.onEnd(e => ends.push(e));

	giveaway.start('g@g.us', { prize: 'Saldo 50k', durationMs: 0, winners: 2 });
	assert.throws(() => giveaway.start('g@g.us', {}), /already running/);
	assert.throws(() => giveaway.start('x@g.us', { winners: 0 }), /positive/);

	await sock.ev.emit('messages.upsert', {
		messages: [
			msg('g@g.us', 'a@s', 'IKUT'), // case-insensitive
			msg('g@g.us', 'b@s', 'ikut'),
			msg('g@g.us', 'a@s', 'ikut'), // double entry ignored
			msg('g@g.us', 'c@s', 'bukan keyword')
		]
	});
	assert.equal(giveaway.enter('g@g.us', 'd@s'), true, 'manual entry');
	assert.equal(giveaway.enter('g@g.us', 'd@s'), false);
	assert.deepEqual(joins, ['a@s', 'b@s', 'd@s']);
	assert.ok(giveaway.render('g@g.us').includes('Entries: 3'));

	const result = giveaway.end('g@g.us');
	assert.equal(result.winners.length, 2);
	assert.equal(result.winners[0], 'a@s', 'deterministic RNG picks first');
	assert.equal(result.entries, 3);
	assert.equal(ends.length, 1);
	assert.equal(giveaway.isActive('g@g.us'), false);
	assert.equal(giveaway.end('g@g.us'), null);

	giveaway.start('x@g.us', {});
	assert.equal(giveaway.cancel('x@g.us'), true);
	assert.equal(ends.length, 1, 'cancel never draws');
});

// -------------------------------------------------------------- attendance

test('attendance: keyword check-ins, ordering, missing list, close', async () => {
	let t = new Date('2026-09-28T07:01:00').getTime();
	const sock = { ev: makeEv() };
	const absen = createAttendance({ now: () => t });
	absen.bind(sock);
	const checkins = [];
	absen.onCheckIn(i => checkins.push([i.user, i.position]));

	absen.open('g@g.us', { title: 'Absen Pagi' });
	await sock.ev.emit('messages.upsert', { messages: [msg('g@g.us', 'a@s', 'absen')] });
	t += 4 * 60_000;
	await sock.ev.emit('messages.upsert', {
		messages: [msg('g@g.us', 'b@s', 'ABSEN'), msg('g@g.us', 'a@s', 'absen')] // double ignored
	});
	assert.deepEqual(checkins, [['a@s', 1], ['b@s', 2]]);

	const rendered = absen.render('g@g.us');
	assert.ok(rendered.includes('Absen Pagi'));
	assert.ok(rendered.includes('1. @a — 07:01'));
	assert.ok(rendered.includes('2. @b — 07:05'));
	assert.deepEqual(absen.getMentions('g@g.us'), ['a@s', 'b@s']);
	assert.deepEqual(absen.getMissing('g@g.us', [{ id: 'a@s' }, { id: 'c@s' }, 'd@s']), ['c@s', 'd@s']);
	assert.equal(absen.checkIn('lain@g.us', 'x@s'), null, 'no session → null');

	const closed = absen.close('g@g.us');
	assert.equal(closed.attendees.length, 2);
	assert.equal(closed.attendees[0].position, 1);
	assert.equal(absen.isOpen('g@g.us'), false);
	assert.equal(absen.close('g@g.us'), null);
	assert.equal(absen.render('g@g.us'), null);
});

// ------------------------------------------------------------------ auction

test('auction: increments, self-bid guard, anti-snipe, winner', () => {
	let t = 0;
	const auction = createAuction({ now: () => t });
	const outbids = [];
	const ends = [];
	auction.onOutbid(o => outbids.push([o.user, o.by]));
	auction.onEnd(e => ends.push(e));

	auction.start('g@g.us', { item: 'Akun ML', startBid: 50_000, minIncrement: 5_000, durationMs: 600_000, antiSnipeMs: 30_000 });
	assert.throws(() => auction.start('g@g.us', {}), /already running/);

	assert.deepEqual(auction.bid('g@g.us', 'a@s', 40_000), { accepted: false, reason: 'too-low', minNext: 50_000 });
	assert.equal(auction.bid('g@g.us', 'a@s', 50_000).accepted, true);
	assert.equal(auction.bid('g@g.us', 'a@s', 60_000).reason, 'already-leading');
	assert.equal(auction.bid('g@g.us', 'b@s', 52_000).reason, 'too-low', 'minIncrement enforced');
	assert.equal(auction.bid('g@g.us', 'b@s', 55_000).accepted, true);
	assert.deepEqual(outbids, [['a@s', 'b@s']]);

	t = 590_000; // 10s left, inside the 30s anti-snipe window
	const snipe = auction.bid('g@g.us', 'a@s', 60_000);
	assert.equal(snipe.extended, true);
	assert.equal(auction.getStatus('g@g.us').remainingMs, 30_000, 'clock pushed out');

	assert.ok(auction.render('g@g.us').includes('Akun ML'));
	const result = auction.end('g@g.us');
	assert.equal(result.winner, 'a@s');
	assert.equal(result.amount, 60_000);
	assert.equal(result.bids, 3);
	assert.equal(ends.length, 1);
	assert.equal(auction.bid('g@g.us', 'x@s', 99_999).reason, 'no-auction');

	auction.start('empty@g.us', { item: 'x', durationMs: 1000 });
	assert.equal(auction.end('empty@g.us').winner, null, 'no bids → no winner');
	auction.start('c@g.us', {});
	assert.equal(auction.cancel('c@g.us'), true);
	assert.equal(ends.length, 2, 'cancel fires no onEnd');
});

// ---------------------------------------------------------------- text poll

test('text poll: number votes, revoting, tally, tie handling, bars', async () => {
	const sock = { ev: makeEv() };
	const polls = createTextPoll();
	polls.bind(sock);
	const votes = [];
	const ends = [];
	polls.onVote(v => votes.push([v.user, v.index, v.changed]));
	polls.onEnd(e => ends.push(e));

	polls.start('g@g.us', { question: 'Mabar jam?', options: ['19:00', '20:00', '21:00'] });
	assert.throws(() => polls.start('g@g.us', { question: 'x', options: ['a', 'b'] }), /already running/);
	assert.throws(() => polls.start('y@g.us', { question: 'x', options: ['a'] }), /2\.\.20/);

	await sock.ev.emit('messages.upsert', {
		messages: [
			msg('g@g.us', 'a@s', '1'),
			msg('g@g.us', 'b@s', '2'),
			msg('g@g.us', 'c@s', ' 2 '),
			msg('g@g.us', 'd@s', '9'), // invalid option
			msg('g@g.us', 'e@s', 'dua'), // not a number
			msg('g@g.us', 'a@s', '2') // revote
		]
	});
	assert.equal(votes.length, 4);
	assert.deepEqual(votes[3], ['a@s', 2, true], 'revote flagged as changed');

	const tally = polls.getResults('g@g.us');
	assert.equal(tally.totalVotes, 3);
	assert.equal(tally.results[1].votes, 3);
	assert.equal(tally.results[1].percent, 100);
	assert.equal(tally.results[0].votes, 0);
	assert.equal(polls.vote('g@g.us', 'a@s', 2), 'unchanged');
	assert.equal(polls.vote('nope@g.us', 'a@s', 1), null);

	const ballot = polls.render('g@g.us');
	assert.ok(ballot.includes('Mabar jam?') && ballot.includes('2. 20:00'));

	const end = polls.end('g@g.us');
	assert.equal(end.winner.option, '20:00');
	assert.equal(ends.length, 1);
	const bars = polls.formatResults(end.results);
	assert.ok(bars.includes('█') && bars.includes('(3)'));

	polls.start('tie@g.us', { question: 'x', options: ['a', 'b'] });
	polls.vote('tie@g.us', 'u1', 1);
	polls.vote('tie@g.us', 'u2', 2);
	assert.equal(polls.end('tie@g.us').winner, null, 'ties have no winner');

	const strict = createTextPoll({ allowRevote: false });
	strict.start('s@g.us', { question: 'x', options: ['a', 'b'] });
	strict.vote('s@g.us', 'u', 1);
	assert.equal(strict.vote('s@g.us', 'u', 2), 'already-voted');
});

// -------------------------------------------------------- version + exports

test('version is 2.4.7 and barrel exports the round', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	assert.equal(pkg.version, '2.4.7');

	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['giveaway', 'attendance', 'auction', 'text-poll']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
});
