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
		// clamp: an injected `random()` may return exactly 1.0 (unlike
		// Math.random's [0,1)), which would push j out of bounds and swap
		// `undefined` into the result — silently dropping a real element.
		const j = Math.min(pool.length - 1, i + Math.floor(random() * (pool.length - i)));
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

/** Split an array into [pass, fail] by a predicate. */
export const partition = (arr, pred) => {
	const pass = [];
	const fail = [];
	(arr || []).forEach((v, i) => (pred(v, i) ? pass : fail).push(v));
	return [pass, fail];
};

/** Zip arrays element-wise: zip([1,2],['a','b']) -> [[1,'a'],[2,'b']]. Stops at the shortest. */
export const zip = (...arrays) => {
	if (!arrays.length) {
		return [];
	}
	const len = Math.min(...arrays.map(a => (a || []).length));
	const out = [];
	for (let i = 0; i < len; i++) {
		out.push(arrays.map(a => a[i]));
	}
	return out;
};

/** Flatten nested arrays up to `depth` levels (default 1): flatten([1,[2,[3]]]) → [1,2,[3]]. */
export const flatten = (items, depth = 1) => {
	const out = [];
	for (const item of items || []) {
		if (Array.isArray(item) && depth > 0) {
			out.push(...flatten(item, depth - 1));
		} else {
			out.push(item);
		}
	}
	return out;
};

/** Tally occurrences by a computed key: countBy(users, u => u.role) → { admin: 2, member: 9 }. */
export const countBy = (items, keyFn) => {
	const out = {};
	for (const item of items || []) {
		const key = String(keyFn ? keyFn(item) : item);
		out[key] = (out[key] || 0) + 1;
	}
	return out;
};

/** Drop falsy values (null/undefined/0/''/false/NaN): compact([0,1,null,2,'']) → [1,2]. */
export const compact = (items) => (items || []).filter(Boolean);

/** Sum a list, optionally by a numeric key function; non-numbers are skipped. */
export const sum = (items, keyFn) => {
	let total = 0;
	for (const item of items || []) {
		const n = keyFn ? keyFn(item) : item;
		if (typeof n === 'number' && Number.isFinite(n)) {
			total += n;
		}
	}
	return total;
};

/** Arithmetic mean of a list (0 for empty); optional numeric key function. */
export const mean = (items, keyFn) => {
	const list = [...(items || [])];
	if (!list.length) {
		return 0;
	}
	return sum(list, keyFn) / list.length;
};

/** Move an element to a new index (new array); negative indexes count from the end. */
export const move = (items, from, to) => {
	const out = [...(items || [])];
	const norm = (i) => (i < 0 ? out.length + i : i);
	const f = norm(from);
	let t = norm(to);
	if (f < 0 || f >= out.length) {
		return out;
	}
	t = Math.min(Math.max(0, t), out.length - 1);
	const [item] = out.splice(f, 1);
	out.splice(t, 0, item);
	return out;
};

/** Elements present in BOTH arrays (order/uniqueness from the first); optional key fn. */
export const intersection = (a, b, keyFn) => {
	const key = keyFn || ((x) => x);
	const setB = new Set((b || []).map(key));
	return unique((a || []).filter(x => setB.has(key(x))), key);
};

/** Elements in `a` that are NOT in `b` (deduped, order from `a`); optional key fn. */
export const difference = (a, b, keyFn) => {
	const key = keyFn || ((x) => x);
	const setB = new Set((b || []).map(key));
	return unique((a || []).filter(x => !setB.has(key(x))), key);
};

/** Leading run of elements while `pred` holds: takeWhile([1,2,9,1], x => x<5) → [1,2]. */
export const takeWhile = (items, pred) => {
	const out = [];
	let i = 0;
	for (const item of items || []) {
		if (!pred(item, i++)) {
			break;
		}
		out.push(item);
	}
	return out;
};

/** Drop the leading run while `pred` holds, keep the rest: dropWhile([1,2,9,1], x => x<5) → [9,1]. */
export const dropWhile = (items, pred) => {
	const list = [...(items || [])];
	let i = 0;
	while (i < list.length && pred(list[i], i)) {
		i++;
	}
	return list.slice(i);
};

/** Element with the largest computed key (first winner on ties), or undefined for empty. */
export const maxBy = (items, keyFn) => {
	let best;
	let bestKey = -Infinity;
	let seen = false;
	for (const item of items || []) {
		const k = keyFn(item);
		if (!seen || k > bestKey) {
			best = item;
			bestKey = k;
			seen = true;
		}
	}
	return best;
};

/** Element with the smallest computed key (first winner on ties), or undefined for empty. */
export const minBy = (items, keyFn) => {
	let best;
	let bestKey = Infinity;
	let seen = false;
	for (const item of items || []) {
		const k = keyFn(item);
		if (!seen || k < bestKey) {
			best = item;
			bestKey = k;
			seen = true;
		}
	}
	return best;
};

/** Median of a numeric list (average of the two middles for even length); 0 for empty. */
export const median = (items, keyFn) => {
	const nums = (items || [])
		.map(x => (keyFn ? keyFn(x) : x))
		.filter(n => typeof n === 'number' && Number.isFinite(n))
		.sort((a, b) => a - b);
	if (!nums.length) {
		return 0;
	}
	const mid = Math.floor(nums.length / 2);
	return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};
