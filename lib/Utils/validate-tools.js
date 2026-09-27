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
