// v2.4.5 round 2: 20 more pure helpers (array/random/math/time/text/validate)
// plus two persistence bug fixes — economy.load() dropping `lastWorkAt` (work
// cooldown bypass on restart) and reputation.toJSON/load dropping `cooldowns`
// (rep-farming cooldown bypass on restart).
import { test } from 'node:test';
import assert from 'node:assert';
import * as B from '../lib/index.js';

test('array-tools: takeWhile / dropWhile / maxBy / minBy / median', () => {
	assert.deepEqual(B.takeWhile([1, 2, 9, 1], x => x < 5), [1, 2]);
	assert.deepEqual(B.dropWhile([1, 2, 9, 1], x => x < 5), [9, 1]);
	assert.deepEqual(B.takeWhile([], x => true), []);
	assert.equal(B.maxBy([{ n: 1 }, { n: 9 }, { n: 3 }], o => o.n).n, 9);
	assert.equal(B.minBy([{ n: 1 }, { n: 9 }, { n: 3 }], o => o.n).n, 1);
	assert.equal(B.maxBy([], o => o), undefined);
	assert.equal(B.median([3, 1, 2]), 2);        // odd
	assert.equal(B.median([4, 1, 3, 2]), 2.5);   // even → avg of middles
	assert.equal(B.median([]), 0);
	assert.equal(B.median([{ v: 10 }, { v: 20 }], o => o.v), 15);
});

test('random-tools: randomBool / randomHex / uuid', () => {
	assert.equal(B.randomBool(1), true);   // p=1 always true
	assert.equal(B.randomBool(0), false);  // p=0 always false
	assert.equal(B.randomBool(0.5, { random: () => 0.4 }), true);
	assert.equal(B.randomBool(0.5, { random: () => 0.6 }), false);
	assert.match(B.randomHex(8), /^[0-9a-f]{16}$/);
	assert.match(B.randomHex(4), /^[0-9a-f]{8}$/);
	assert.notEqual(B.randomHex(8), B.randomHex(8)); // overwhelmingly distinct
	assert.match(B.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.notEqual(B.uuid(), B.uuid());
});

test('math-eval: gcd / lcm / percentage / roundTo', () => {
	assert.equal(B.gcd(12, 18), 6);
	assert.equal(B.gcd(0, 0), 0);
	assert.equal(B.gcd(-12, 8), 4);
	assert.equal(B.lcm(4, 6), 12);
	assert.equal(B.lcm(7, 0), 0);
	assert.equal(B.percentage(1, 4), 25);
	assert.equal(B.percentage(1, 3, 2), 33.33);
	assert.equal(B.percentage(5, 0), 0);        // no divide-by-zero
	assert.equal(B.roundTo(1.005, 2), 1.01);    // float-drift-free half-up
	assert.equal(B.roundTo(2.5), 3);
	assert.equal(B.roundTo(3.14159, 3), 3.142);
});

test('time-tools: addDays / daysBetween / weekdayName', () => {
	const base = new Date(2026, 8, 29, 12, 0).getTime(); // Tue 29 Sep 2026
	assert.equal(B.weekdayName(base, 'en'), 'Tuesday');
	assert.equal(B.weekdayName(base, 'id'), 'Selasa');
	assert.ok(B.isSameDay(B.addDays(base, 1), new Date(2026, 8, 30, 12, 0).getTime()));
	assert.ok(B.isSameDay(B.addDays(base, -2), new Date(2026, 8, 27, 12, 0).getTime()));
	assert.equal(B.daysBetween(base, B.addDays(base, 5)), 5);
	assert.equal(B.daysBetween(B.addDays(base, 5), base), -5);
	assert.equal(B.daysBetween(base, base), 0);
});

test('text-extras: stripAccents / initials / pluralize', () => {
	assert.equal(B.stripAccents('Café Niño'), 'Cafe Nino');
	assert.equal(B.initials('Budi Santoso'), 'BS');
	assert.equal(B.initials('madonna'), 'M');
	assert.equal(B.initials('a b c d', { max: 3 }), 'ABC');
	assert.equal(B.pluralize(1, 'file'), '1 file');
	assert.equal(B.pluralize(3, 'file'), '3 files');
	assert.equal(B.pluralize(2, 'child', 'children'), '2 children');
	assert.equal(B.pluralize(5, 'item', undefined, { includeCount: false }), 'items');
});

test('validate-tools: isInteger / toInt', () => {
	assert.equal(B.isInteger(42), true);
	assert.equal(B.isInteger('42'), true);
	assert.equal(B.isInteger('4.2'), false);
	assert.equal(B.isInteger(4.2), false);
	assert.equal(B.isInteger('  7 '), true);
	assert.equal(B.isInteger(''), false);
	assert.equal(B.toInt('42'), 42);
	assert.equal(B.toInt('42.9'), 42);   // truncates toward zero
	assert.equal(B.toInt('-3.7'), -3);
	assert.equal(B.toInt('nope', 5), 5);
});

test('bug fix: economy.load() preserves lastWorkAt (work cooldown survives restart)', () => {
	let clock = 1_000_000;
	const eco = B.createEconomy({ now: () => clock });
	const w1 = eco.work('u', { pay: [100, 100], cooldownMs: 60_000 });
	assert.equal(w1.worked, true);
	// simulate save + restart into a fresh instance
	const snapshot = JSON.parse(JSON.stringify(eco.toJSON()));
	const eco2 = B.createEconomy({ now: () => clock });
	eco2.load(snapshot);
	// immediately trying to work again must still be on cooldown
	const w2 = eco2.work('u', { pay: [100, 100], cooldownMs: 60_000 });
	assert.equal(w2.worked, false, 'cooldown must survive the reload');
	assert.ok(w2.remainingMs > 0);
	// after the cooldown elapses it works again
	clock += 60_000;
	assert.equal(eco2.work('u', { pay: [100, 100], cooldownMs: 60_000 }).worked, true);
});

test('bug fix: reputation.toJSON/load preserves cooldowns (anti-farm survives restart)', () => {
	let clock = 5_000_000;
	const rep = B.createReputation({ cooldownMs: 3_600_000, now: () => clock });
	assert.equal(rep.give('a', 'b', 1).ok, true);
	assert.equal(rep.give('a', 'b', 1).ok, false); // on cooldown in-memory
	// save + restart
	const snapshot = JSON.parse(JSON.stringify(rep.toJSON()));
	assert.ok(snapshot.cooldowns && snapshot.cooldowns.length >= 1, 'cooldowns serialized');
	const rep2 = B.createReputation({ cooldownMs: 3_600_000, now: () => clock });
	rep2.load(snapshot);
	const after = rep2.give('a', 'b', 1);
	assert.equal(after.ok, false, 'cooldown must survive the reload (no rep farming)');
	assert.ok(after.remainingMs > 0);
	// once the cooldown passes, giving works again
	clock += 3_600_000;
	assert.equal(rep2.give('a', 'b', 1).ok, true);
});
