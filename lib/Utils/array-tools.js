/**
 * Array tools — the list helpers every bot ends up writing by hand.
 *
 * ```js
 * import { chunk, unique, groupBy, sortBy, sample, range } from '@japofc/baileys'
 *
 * chunk([1,2,3,4,5], 2)                   // [[1,2],[3,4],[5]]
 * unique(members, m => m.id)              // de-dupe by key
 * groupBy(msgs, m => m.key.remoteJid)     // { 'a@g.us': [...], ... }
 * sortBy(users, u => -u.xp)               // sort by computed key
 * sample(participants, 3)                 // 3 distinct random winners
 * range(1, 10)                            // [1..10]
 * ```
 */

export const chunk = (items, size) => {
	if (!Number.isInteger(size) || size < 1) {
		throw new Error('chunk size must be a positive integer');
	}
	const out = [];
	const list = [...(items || [])];
	for (let i = 0; i < list.length; i += size) {
		out.push(list.slice(i, i + size));
	}
	return out;
};

/** De-duplicate, optionally by a key function (first occurrence wins). */
export const unique = (items, keyFn) => {
	const seen = new Set();
	const out = [];
	for (const item of items || []) {
		const key = keyFn ? keyFn(item) : item;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(item);
		}
	}
	return out;
};

export const groupBy = (items, keyFn) => {
	const out = {};
	for (const item of items || []) {
		const key = String(keyFn(item));
		(out[key] ||= []).push(item);
	}
	return out;
};

/** Sort by a computed key (new array); negate numbers for descending. */
export const sortBy = (items, keyFn) =>
	[...(items || [])].sort((a, b) => {
		const ka = keyFn(a);
		const kb = keyFn(b);
		return ka < kb ? -1 : ka > kb ? 1 : 0;
	});

/** N distinct random elements (Fisher–Yates partial). */
export const sample = (items, n = 1, { random = Math.random } = {}) => {
	const pool = [...(items || [])];
	const count = Math.min(n, pool.length);
	for (let i = 0; i < count; i++) {
		const j = i + Math.floor(random() * (pool.length - i));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, count);
};

/** Inclusive range: range(1, 5) → [1,2,3,4,5]; supports step + descending. */
export const range = (from, to, step = 1) => {
	if (step === 0) {
		throw new Error('range step must not be 0');
	}
	const out = [];
	if (from <= to) {
		for (let i = from; i <= to; i += Math.abs(step)) {
			out.push(i);
		}
	} else {
		for (let i = from; i >= to; i -= Math.abs(step)) {
			out.push(i);
		}
	}
	return out;
};
