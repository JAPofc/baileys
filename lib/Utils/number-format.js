/**
 * number-format — compact/ordinal/grouped number formatting for bot output.
 *
 * ```js
 * import { compactNumber, ordinal, groupDigits, formatIDR } from '@japofc/baileys'
 *
 * compactNumber(1_500)      // '1.5K'
 * compactNumber(2_400_000)  // '2.4M'
 * ordinal(1)                // '1st'
 * groupDigits(1234567)      // '1,234,567'
 * formatIDR(15000)          // 'Rp15.000'
 * ```
 */

const COMPACT_UNITS = [
	[1e12, 'T'],
	[1e9, 'B'],
	[1e6, 'M'],
	[1e3, 'K']
];

/**
 * Abbreviate a number: 1500 → '1.5K', 2_400_000 → '2.4M'. Trailing '.0' is
 * dropped ('2000' → '2K'). Negative values keep their sign. `decimals`
 * controls the fraction precision (default 1).
 */
export const compactNumber = (value, { decimals = 1 } = {}) => {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		return '0';
	}
	const sign = n < 0 ? '-' : '';
	const abs = Math.abs(n);
	for (let i = 0; i < COMPACT_UNITS.length; i++) {
		const [unit, suffix] = COMPACT_UNITS[i];
		if (abs >= unit) {
			// JAP@Fix (bug 73): rounding can carry the scaled value up to the next
			// unit's magnitude (999_999 / 1e3 = 999.999 → toFixed(1) = '1000.0'),
			// which used to print '1000K'/'1000M' instead of promoting to '1M'/'1B'.
			// If the rounded value reaches 1000 and a larger unit exists, use it.
			if (i > 0 && Number((abs / unit).toFixed(decimals)) >= 1000) {
				const [biggerUnit, biggerSuffix] = COMPACT_UNITS[i - 1];
				const promoted = (abs / biggerUnit).toFixed(decimals).replace(/\.0+$/, '');
				return `${sign}${promoted}${biggerSuffix}`;
			}
			const fixed = (abs / unit).toFixed(decimals).replace(/\.0+$/, '');
			return `${sign}${fixed}${suffix}`;
		}
	}
	return `${sign}${abs}`;
};

/** English ordinal: 1 → '1st', 2 → '2nd', 3 → '3rd', 11 → '11th', 22 → '22nd'. */
export const ordinal = (value) => {
	const n = Math.trunc(Number(value));
	if (!Number.isFinite(n)) {
		return String(value);
	}
	const abs = Math.abs(n) % 100;
	const last = abs % 10;
	let suffix = 'th';
	if (abs < 11 || abs > 13) {
		if (last === 1) suffix = 'st';
		else if (last === 2) suffix = 'nd';
		else if (last === 3) suffix = 'rd';
	}
	return `${n}${suffix}`;
};

/**
 * Group the integer part with a thousands separator: 1234567 → '1,234,567'.
 * Keeps any fractional part intact. `separator` defaults to ','.
 */
export const groupDigits = (value, { separator = ',' } = {}) => {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		return '0';
	}
	const sign = n < 0 ? '-' : '';
	const [int, frac] = Math.abs(n).toString().split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
	return sign + grouped + (frac ? `.${frac}` : '');
};

/**
 * Indonesian Rupiah: 15000 → 'Rp15.000'. Uses '.' as the thousands separator
 * (the id-ID convention) and rounds to whole rupiah by default.
 */
export const formatIDR = (value, { symbol = 'Rp', decimals = 0 } = {}) => {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		return `${symbol}0`;
	}
	const sign = n < 0 ? '-' : '';
	const rounded = decimals > 0 ? Math.abs(n).toFixed(decimals) : String(Math.round(Math.abs(n)));
	const [int, frac] = rounded.split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${sign}${symbol}${grouped}${frac ? `,${frac}` : ''}`;
};
