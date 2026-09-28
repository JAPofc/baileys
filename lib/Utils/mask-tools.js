/**
 * Mask tools — hide the middle of sensitive strings for public output.
 *
 * ```js
 * import { maskPhone, maskEmail, censorText } from '@japofc/baileys'
 *
 * maskPhone('6281234567890')          // '62812•••••90'
 * maskEmail('budi.s@gmail.com')       // 'bu••••@gmail.com'
 * censorText('dasar anjing lu', ['anjing'])  // 'dasar a****g lu'
 * ```
 */

/** Keep the first 5 and last 2 digits; accepts jids too. */
export const maskPhone = (input, { keepStart = 5, keepEnd = 2, char = '•' } = {}) => {
	const digits = String(input ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
	if (digits.length <= keepStart + keepEnd) {
		return digits;
	}
	return digits.slice(0, keepStart) + char.repeat(digits.length - keepStart - keepEnd) + digits.slice(-keepEnd);
};

export const maskEmail = (input, { keep = 2, char = '•' } = {}) => {
	const s = String(input ?? '');
	const at = s.indexOf('@');
	if (at < 1) {
		return s;
	}
	const local = s.slice(0, at);
	const kept = local.slice(0, Math.min(keep, local.length));
	return kept + char.repeat(Math.max(1, local.length - kept.length)) + s.slice(at);
};

/**
 * Star out listed words (first + last letter kept for 3+ letter words),
 * case-insensitive, word-boundary aware.
 */
export const censorText = (text, words, { char = '*' } = {}) => {
	let out = String(text ?? '');
	for (const word of words || []) {
		const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
		out = out.replace(re, (m) =>
			m.length <= 2 ? char.repeat(m.length) : m[0] + char.repeat(m.length - 2) + m[m.length - 1]);
	}
	return out;
};
