/**
 * Random tools — dice, coins, picks and the deterministic "rate/jodoh"
 * meters every fun bot ships.
 *
 * ```js
 * import { rollDice, flipCoin, randomPick, weightedPick, hashRating, matchScore } from '@japofc/baileys'
 *
 * rollDice('2d6+3')            // { rolls: [4, 2], modifier: 3, total: 9 }
 * flipCoin()                   // 'heads' | 'tails'
 * randomPick(['a', 'b', 'c'])
 * weightedPick([{ value: 'rare', weight: 1 }, { value: 'common', weight: 9 }])
 * hashRating('nasi goreng')    // 0-100, same input → same rating forever
 * matchScore('budi', 'ani')    // 0-100, order-independent ("jodoh meter")
 * ```
 *
 * Every randomized helper accepts an injectable `random` for deterministic
 * tests / provably-fair games.
 */
import { createHash } from 'crypto';

/** Parse and roll dice notation: '2d6', 'd20', '3d10+5', '1d4-1'. */
export const rollDice = (notation, { random = Math.random } = {}) => {
	const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(String(notation ?? ''));
	if (!m) {
		throw new Error(`invalid dice notation: "${notation}" (use NdS+M, e.g. 2d6+3)`);
	}
	const count = m[1] ? parseInt(m[1], 10) : 1;
	const sides = parseInt(m[2], 10);
	const modifier = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
	if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
		throw new Error('dice out of range (1-100 dice, 2-1000 sides)');
	}
	const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
	return { rolls, modifier, total: rolls.reduce((a, b) => a + b, 0) + modifier, notation: `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}` };
};

export const flipCoin = ({ random = Math.random } = {}) => (random() < 0.5 ? 'heads' : 'tails');

export const randomInt = (min, max, { random = Math.random } = {}) =>
	Math.floor(random() * (max - min + 1)) + min;

export const randomPick = (items, { random = Math.random } = {}) => {
	if (!Array.isArray(items) || !items.length) {
		return undefined;
	}
	return items[Math.floor(random() * items.length)];
};

/** Fisher–Yates shuffle (returns a new array). */
export const shuffle = (items, { random = Math.random } = {}) => {
	const out = [...(items || [])];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

/** Pick by weight: `[{ value, weight }]` — higher weight, higher odds. */
export const weightedPick = (entries, { random = Math.random } = {}) => {
	const list = (entries || []).filter(e => e && Number.isFinite(e.weight) && e.weight > 0);
	if (!list.length) {
		return undefined;
	}
	const total = list.reduce((a, e) => a + e.weight, 0);
	let roll = random() * total;
	for (const entry of list) {
		roll -= entry.weight;
		if (roll <= 0) {
			return entry.value;
		}
	}
	return list[list.length - 1].value;
};

/**
 * Normally-distributed random number (Box–Muller). Human reaction times
 * cluster around a mean — uniform jitter looks robotic; Gaussian doesn't.
 * `clamp: [min, max]` keeps outliers sane.
 */
export const randomGaussian = (mean = 0, stdDev = 1, { random = Math.random, clamp } = {}) => {
	let u = 0;
	let v = 0;
	while (u === 0) {
		u = random(); // avoid log(0)
	}
	while (v === 0) {
		v = random();
	}
	let value = mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	if (clamp) {
		value = Math.min(clamp[1], Math.max(clamp[0], value));
	}
	return value;
};

/** Gaussian-jittered delay in ms — e.g. gaussianDelayMs(2000, 600). */
export const gaussianDelayMs = (meanMs, stdMs = meanMs / 3, options = {}) =>
	Math.round(randomGaussian(meanMs, stdMs, { clamp: [0, meanMs * 3], ...options }));

const hash01 = (text) => {
	const digest = createHash('sha256').update(String(text).toLowerCase().trim()).digest();
	return digest.readUInt32BE(0) / 0xffffffff;
};

/** Deterministic 0-100 rating — same input always rates the same. */
export const hashRating = (text) => Math.round(hash01(`rate:${text}`) * 100);

/** Deterministic 0-100 match score, order-independent ("jodoh meter"). */
export const matchScore = (a, b) => {
	const pair = [String(a).toLowerCase().trim(), String(b).toLowerCase().trim()].sort().join('\u0000');
	return Math.round(hash01(`match:${pair}`) * 100);
};
