/**
 * Text extras — the everyday toolbox for bot messages: read-more collapse,
 * progress bars, human durations & sizes, safe truncation/chunking,
 * markdown escaping and fuzzy string distance.
 *
 * ```js
 * import {
 *     readMore, progressBar, formatDuration, formatBytes,
 *     truncate, chunkText, escapeMarkdown, levenshtein, similarity
 * } from '@japofc/baileys'
 *
 * readMore('Promo!', 'detail panjang…')  // collapses behind "Read more"
 * progressBar(70, 100)                   // '███████░░░ 70%'
 * formatDuration(93_784_000)             // '1d 2h 3m'
 * formatBytes(5_242_880)                 // '5 MB'
 * chunkText(longText, 4000)              // split for WhatsApp limits
 * similarity('jakarta', 'jakrata')       // 0.71 — for "almost!" hints
 * ```
 */

/** ~4000 zero-width spaces: everything after them collapses behind "Read more". */
export const READ_MORE = '\u200B'.repeat(4001);

/** Compose a message where `hidden` sits behind the "Read more" fold. */
export const readMore = (visible, hidden = '') =>
	hidden ? `${visible}${READ_MORE}${hidden}` : `${visible}${READ_MORE}`;

/** Text progress bar: `progressBar(70, 100)` → '███████░░░ 70%'. */
export const progressBar = (value, max = 100, options = {}) => {
	const { size = 10, filled = '█', empty = '░', showPercent = true } = options;
	const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
	const fill = Math.round(ratio * size);
	const bar = filled.repeat(fill) + empty.repeat(size - fill);
	return showPercent ? `${bar} ${Math.round(ratio * 100)}%` : bar;
};

const DURATION_UNITS = [
	['d', 86_400_000],
	['h', 3_600_000],
	['m', 60_000],
	['s', 1000]
];

/** Human duration: `formatDuration(93784000)` → '1d 2h 3m' (top `parts` units). */
export const formatDuration = (ms, { parts = 3 } = {}) => {
	let rest = Math.max(0, Math.floor(ms));
	const out = [];
	for (const [label, unitMs] of DURATION_UNITS) {
		if (rest >= unitMs && out.length < parts) {
			const n = Math.floor(rest / unitMs);
			rest -= n * unitMs;
			out.push(`${n}${label}`);
		}
	}
	return out.length ? out.join(' ') : '0s';
};

/** Human size: `formatBytes(5242880)` → '5 MB'. */
export const formatBytes = (bytes, { decimals = 1 } = {}) => {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return '0 B';
	}
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let value = bytes;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	const fixed = value.toFixed(decimals).replace(/\.0+$/, '');
	return `${fixed} ${units[i]}`;
};

/** Cut a string at `max` chars, appending an ellipsis when trimmed. */
export const truncate = (text, max, { ellipsis = '…' } = {}) => {
	const s = String(text ?? '');
	if (s.length <= max) {
		return s;
	}
	return s.slice(0, Math.max(0, max - ellipsis.length)) + ellipsis;
};

/**
 * Split long text into chunks of at most `size` chars, preferring newline
 * then space boundaries — for WhatsApp's message length limits.
 */
export const chunkText = (text, size = 4000) => {
	const s = String(text ?? '');
	if (!s) {
		return [];
	}
	const chunks = [];
	let rest = s;
	while (rest.length > size) {
		let cut = rest.lastIndexOf('\n', size);
		if (cut < size * 0.5) {
			cut = rest.lastIndexOf(' ', size);
		}
		if (cut < size * 0.5) {
			cut = size;
		}
		chunks.push(rest.slice(0, cut));
		rest = rest.slice(cut).replace(/^[\n ]/, '');
	}
	chunks.push(rest);
	return chunks;
};

/** Escape WhatsApp formatting characters (* _ ~ `) in user-provided text. */
export const escapeMarkdown = (text) => String(text ?? '').replace(/([*_~`])/g, '\u200B$1');

/** Strip WhatsApp formatting characters entirely. */
export const stripMarkdown = (text) => String(text ?? '').replace(/[*_~`]/g, '');

/** Levenshtein edit distance between two strings. */
export const levenshtein = (a, b) => {
	const s = String(a ?? '');
	const t = String(b ?? '');
	if (s === t) {
		return 0;
	}
	if (!s.length) {
		return t.length;
	}
	if (!t.length) {
		return s.length;
	}
	let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
	for (let i = 1; i <= s.length; i++) {
		const curr = [i];
		for (let j = 1; j <= t.length; j++) {
			curr[j] = Math.min(
				prev[j] + 1,
				curr[j - 1] + 1,
				prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
			);
		}
		prev = curr;
	}
	return prev[t.length];
};

/** Similarity ratio 0..1 based on edit distance (1 = identical). */
export const similarity = (a, b) => {
	const s = String(a ?? '');
	const t = String(b ?? '');
	const maxLen = Math.max(s.length, t.length);
	if (!maxLen) {
		return 1;
	}
	return 1 - levenshtein(s, t) / maxLen;
};

/** Text sparkline: sparkline([1,5,3,8]) → '▁▅▃█' (great for trends). */
export const sparkline = (values, { chars = '▁▂▃▄▅▆▇█' } = {}) => {
	const nums = (values || []).filter(v => Number.isFinite(v));
	if (!nums.length) {
		return '';
	}
	const min = Math.min(...nums);
	const max = Math.max(...nums);
	const range = max - min || 1;
	return nums.map(v => chars[Math.min(chars.length - 1, Math.floor(((v - min) / range) * chars.length))]).join('');
};

/** Title Case Every Word ('halo dunia bot' → 'Halo Dunia Bot'). */
export const titleCase = (text) =>
	String(text ?? '').toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

/** URL/file-safe slug: 'Halo Dunia! 2026' → 'halo-dunia-2026'. */
export const slugify = (text, { separator = '-' } = {}) =>
	String(text ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, separator)
		.replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '');

/** Short unique id: 'ord_lx2c9f4ka1b2' — time-sortable prefix + randomness. */
export const generateId = (prefix = '') =>
	`${prefix ? prefix + '_' : ''}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Count whitespace-delimited words. */
export const wordCount = (str) => {
	const t = String(str ?? '').trim();
	return t ? t.split(/\s+/).length : 0;
};

/** Capitalize the first character, leaving the rest untouched: 'hALO' → 'HALO'. */
export const capitalize = (text) => {
	const s = String(text ?? '');
	return s ? s[0].toUpperCase() + s.slice(1) : s;
};

/** Reverse a string, code-point aware so emoji/surrogates aren't mangled. */
export const reverseText = (text) => [...String(text ?? '')].reverse().join('');

/** Count non-overlapping occurrences of `needle` in `haystack` (0 for empty needle). */
export const countOccurrences = (haystack, needle) => {
	const s = String(haystack ?? '');
	const n = String(needle ?? '');
	if (!n) {
		return 0;
	}
	let count = 0;
	let from = 0;
	for (;;) {
		const idx = s.indexOf(n, from);
		if (idx === -1) {
			break;
		}
		count++;
		from = idx + n.length;
	}
	return count;
};

/** Strip diacritics/accents: stripAccents('Café Niño') → 'Cafe Nino'. */
export const stripAccents = (text) =>
	String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/** Initials from a name: initials('Budi Santoso') → 'BS' (up to `max`, default 2). */
export const initials = (name, { max = 2 } = {}) => {
	const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
	return words.slice(0, max).map(w => [...w][0].toUpperCase()).join('');
};

/**
 * Count-aware word form: pluralize(1,'file') → '1 file'; pluralize(3,'file') →
 * '3 files'. Pass an explicit `plural` for irregulars (e.g. 'child','children').
 * Set `includeCount:false` to get just the word.
 */
export const pluralize = (count, singular, plural, { includeCount = true } = {}) => {
	const word = Math.abs(count) === 1 ? singular : (plural ?? `${singular}s`);
	return includeCount ? `${count} ${word}` : word;
};

/** Center a string within `width` using `fill` (extra padding favors the right). */
export const padCenter = (text, width, fill = ' ') => {
	const s = String(text ?? '');
	if (!fill || s.length >= width) {
		return s;
	}
	const total = width - s.length;
	const left = Math.floor(total / 2);
	const right = total - left;
	const pad = (n) => fill.repeat(Math.ceil(n / fill.length)).slice(0, n);
	return pad(left) + s + pad(right);
};

/** Truncate keeping both ends: ellipsisMiddle('abcdefgh', 5) -> 'ab…gh'. */
export const ellipsisMiddle = (str, max = 20, ellipsis = '…') => {
	const s = String(str ?? '');
	if (max <= 0 || s.length <= max) {
		return s;
	}
	if (max <= ellipsis.length) {
		return s.slice(0, max);
	}
	const keep = max - ellipsis.length;
	const head = Math.ceil(keep / 2);
	const tail = keep - head;
	return s.slice(0, head) + ellipsis + (tail ? s.slice(-tail) : '');
};
