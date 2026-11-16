/**
 * Validation tools — quick input checks for command arguments.
 *
 * ```js
 * import { isUrl, isEmail, parseBool, clamp, ensureArray, pickFields } from '@japofc/baileys'
 *
 * isUrl(args[0])                 // before fetching user input
 * parseBool('ya')                // true — id/en friendly (ya/yes/on/1/true…)
 * clamp(amount, 1, 1000)         // bound bet sizes
 * ensureArray(jidOrJids)         // normalize single-or-array params
 * pickFields(body, ['name','qty'])
 * ```
 */

export const isUrl = (value) => {
	try {
		const u = new URL(String(value));
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
};

export const isEmail = (value) =>
	/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? ''));

/** 'ya/yes/y/true/on/1/aktif' → true; 'tidak/no/n/false/off/0/mati' → false; else null. */
export const parseBool = (value) => {
	const s = String(value ?? '').trim().toLowerCase();
	if (['ya', 'yes', 'y', 'true', 'on', '1', 'aktif', 'iya'].includes(s)) {
		return true;
	}
	if (['tidak', 'no', 'n', 'false', 'off', '0', 'mati', 'ga', 'gak', 'nggak'].includes(s)) {
		return false;
	}
	return null;
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Wrap non-arrays; null/undefined → []. */
export const ensureArray = (value) =>
	value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];

/** New object with only the listed keys (missing keys skipped). */
export const pickFields = (obj, keys) => {
	const out = {};
	for (const key of keys || []) {
		if (obj && key in obj) {
			out[key] = obj[key];
		}
	}
	return out;
};

/** True when the value is (or cleanly parses to) a finite number. '' and '1a' are false. */
export const isNumeric = (v) => {
	if (typeof v === 'number') {
		return Number.isFinite(v);
	}
	if (typeof v !== 'string') {
		return false;
	}
	const t = v.trim();
	return t !== '' && Number.isFinite(Number(t));
};

/** Loose phone-number check — 5..15 digits (E.164-ish), ignoring +, spaces, -, (). */
export const isPhoneNumber = (value) => {
	const digits = String(value ?? '').replace(/[\s\-().+]/g, '');
	return /^\d{5,15}$/.test(digits);
};

/** Parse to a finite number or return `fallback` (default 0). Accepts numbers and numeric strings. */
export const coerceNumber = (value, fallback = 0) => {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : fallback;
	}
	const t = String(value ?? '').trim();
	if (t === '') {
		return fallback;
	}
	const n = Number(t);
	return Number.isFinite(n) ? n : fallback;
};

/** New object WITHOUT the listed keys (complement of pickFields). */
export const omitFields = (obj, keys) => {
	const out = {};
	const drop = new Set(keys || []);
	for (const key of Object.keys(obj || {})) {
		if (!drop.has(key)) {
			out[key] = obj[key];
		}
	}
	return out;
};

/** Inclusive numeric bounds check: inRange(5, 1, 10) → true. Non-numbers → false. */
export const inRange = (value, min, max) =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** True for an integer, or a string that cleanly represents one ('42' ✓, '4.2' ✗). */
export const isInteger = (value) => {
	if (typeof value === 'number') {
		return Number.isInteger(value);
	}
	if (typeof value !== 'string') {
		return false;
	}
	const t = value.trim();
	return t !== '' && Number.isInteger(Number(t));
};

/** Parse to an integer or return `fallback` (default 0). Truncates toward zero. */
export const toInt = (value, fallback = 0) => {
	const n = coerceNumber(value, NaN);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
