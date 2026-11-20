// v2.4.5 round: 20 new pure helpers (array/validate/text/time/emoji) plus the
// two bug fixes — the injected-RNG boundary clamp (random() === 1.0) across the
// randomized helpers, and hasEmoji avoiding the stateful global-regex .test().
import { test } from 'node:test';
import assert from 'node:assert';
import * as B from '../lib/index.js';

test('array-tools: flatten / countBy / compact / sum / mean', () => {
	assert.deepEqual(B.flatten([1, [2, [3]]]), [1, 2, [3]]);
	assert.deepEqual(B.flatten([1, [2, [3, [4]]]], 2), [1, 2, 3, [4]]);
	assert.deepEqual(B.countBy(['a', 'b', 'a', 'a'], x => x), { a: 3, b: 1 });
	assert.deepEqual(B.countBy([{ r: 'x' }, { r: 'y' }, { r: 'x' }], o => o.r), { x: 2, y: 1 });
	assert.deepEqual(B.compact([0, 1, null, 2, '', false, 3, undefined, NaN]), [1, 2, 3]);
	assert.equal(B.sum([1, 2, 3, 4]), 10);
	assert.equal(B.sum([{ n: 5 }, { n: 7 }], o => o.n), 12);
	assert.equal(B.sum(['x', 2, null, 3]), 5); // non-numbers skipped
	assert.equal(B.mean([2, 4, 6]), 4);
	assert.equal(B.mean([]), 0);
});

test('array-tools: move / intersection / difference', () => {
	assert.deepEqual(B.move([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
	assert.deepEqual(B.move(['a', 'b', 'c'], -1, 0), ['c', 'a', 'b']);
	assert.deepEqual(B.move([1, 2, 3], 5, 0), [1, 2, 3]); // out-of-range from → unchanged
	assert.deepEqual(B.intersection([1, 2, 3, 2], [2, 3, 4]), [2, 3]);
	assert.deepEqual(B.difference([1, 2, 3, 3], [2]), [1, 3]);
	assert.deepEqual(
		B.intersection([{ id: 1 }, { id: 2 }], [{ id: 2 }], o => o.id).map(o => o.id),
		[2]
	);
});

test('validate-tools: isPhoneNumber / coerceNumber / omitFields / inRange', () => {
	assert.equal(B.isPhoneNumber('+62 812-3456-7890'), true);
	assert.equal(B.isPhoneNumber('(021) 555 1234'), true);
	assert.equal(B.isPhoneNumber('123'), false); // too short
	assert.equal(B.isPhoneNumber('62abc'), false);
	assert.equal(B.coerceNumber('42'), 42);
	assert.equal(B.coerceNumber('   3.5 '), 3.5);
	assert.equal(B.coerceNumber('nope', -1), -1);
	assert.equal(B.coerceNumber(undefined, 7), 7);
	assert.equal(B.coerceNumber(NaN, 9), 9);
	assert.deepEqual(B.omitFields({ a: 1, b: 2, c: 3 }, ['b']), { a: 1, c: 3 });
	assert.equal(B.inRange(5, 1, 10), true);
	assert.equal(B.inRange(10, 1, 10), true); // inclusive
	assert.equal(B.inRange(11, 1, 10), false);
	assert.equal(B.inRange('5', 1, 10), false); // non-number
});

test('text-extras: capitalize / reverseText / countOccurrences / padCenter', () => {
	assert.equal(B.capitalize('hALO'), 'HALO');
	assert.equal(B.capitalize(''), '');
	assert.equal(B.reverseText('abc'), 'cba');
	assert.equal(B.reverseText('a🔥b'), 'b🔥a'); // emoji-safe (no mangled surrogate)
	assert.equal(B.countOccurrences('abababa', 'aba'), 2); // non-overlapping
	assert.equal(B.countOccurrences('hello', 'z'), 0);
	assert.equal(B.countOccurrences('hello', ''), 0);
	assert.equal(B.padCenter('hi', 6), '  hi  ');
	assert.equal(B.padCenter('hi', 7), '  hi   '); // extra pad favors the right
	assert.equal(B.padCenter('toolong', 3), 'toolong'); // no truncation
});

test('time-tools: startOfDay / isSameDay', () => {
	const a = new Date(2026, 8, 29, 9, 30).getTime();
	const b = new Date(2026, 8, 29, 23, 59).getTime();
	const c = new Date(2026, 8, 30, 0, 1).getTime();
	assert.equal(B.startOfDay(a), new Date(2026, 8, 29, 0, 0, 0, 0).getTime());
	assert.equal(B.isSameDay(a, b), true);
	assert.equal(B.isSameDay(b, c), false);
});

test('emoji-tools: hasEmoji (stateless) / emojiRatio', () => {
	assert.equal(B.hasEmoji('halo 🔥'), true);
	assert.equal(B.hasEmoji('plain text'), false);
	// stateless: repeated calls must not flip due to a global-regex lastIndex bug
	assert.equal(B.hasEmoji('x😀'), true);
	assert.equal(B.hasEmoji('x😀'), true);
	assert.equal(B.hasEmoji('x😀'), true);
	assert.equal(B.emojiRatio(''), 0);
	assert.equal(B.emojiRatio('🔥🔥'), 1);
	assert.equal(Math.round(B.emojiRatio('ab🔥🔥') * 100) / 100, 0.5);
});

test('bug fix: injected RNG returning exactly 1.0 stays in bounds', () => {
	const one = () => 1; // a fair/hash RNG can legitimately return 1.0
	// array-tools.sample — must not swap `undefined` into the result
	const s = B.sample([1, 2, 3, 4, 5], 3, { random: one });
	assert.equal(s.length, 3);
	assert.ok(s.every(x => x !== undefined), 'no undefined leaked into sample');
	assert.equal(new Set(s).size, 3, 'still distinct');
	// random-tools.randomInt — documented inclusive [min,max], never max+1
	assert.equal(B.randomInt(1, 6, { random: one }), 6);
	// random-tools.randomPick — real element, never undefined
	assert.equal(B.randomPick(['a', 'b', 'c'], { random: one }), 'c');
	// random-tools.shuffle — permutation, no undefined / no dropped element
	const sh = B.shuffle([1, 2, 3, 4], { random: one });
	assert.deepEqual([...sh].sort((x, y) => x - y), [1, 2, 3, 4]);
	// random-tools.rollDice — never rolls sides+1
	const roll = B.rollDice('3d6', { random: one });
	assert.ok(roll.rolls.every(r => r >= 1 && r <= 6), 'every die within [1,6]');
	// random-tools.randomString — exact requested length, no empty slots
	assert.equal(B.randomString(8, 'abc', { random: one }).length, 8);
	// emoji-tools.randomEmoji — a real emoji, never undefined
	assert.equal(typeof B.randomEmoji('fire', { random: one }), 'string');
});

test('sanity: existing randomized helpers still behave with Math.random', () => {
	assert.equal(B.sample([1, 2, 3], 2).length, 2);
	const r = B.randomInt(1, 3);
	assert.ok(r >= 1 && r <= 3);
	assert.deepEqual([...B.shuffle([1, 2, 3])].sort((a, b) => a - b), [1, 2, 3]);
});
