/**
 * Time tools — relative timestamps, clocks, schedules and greetings.
 *
 * ```js
 * import { formatRelative, formatClock, nextOccurrence, isWithinHours, getGreeting } from '@japofc/baileys'
 *
 * formatRelative(Date.now() - 300_000)   // '5m ago'
 * formatRelative(Date.now() + 7_200_000) // 'in 2h'
 * formatClock(5_025_000)                 // '01:23:45'
 * nextOccurrence('22:00')                // next 10pm as epoch ms
 * isWithinHours('23:30', '22:00', '06:00') // true (overnight-aware)
 * getGreeting(9, 'id')                   // 'Selamat pagi'
 * ```
 */

const REL_UNITS = [
	[31_536_000_000, 'y'],
	[2_592_000_000, 'mo'],
	[604_800_000, 'w'],
	[86_400_000, 'd'],
	[3_600_000, 'h'],
	[60_000, 'm'],
	[1000, 's']
];

/** '5m ago' / 'in 2h' / 'just now'. */
export const formatRelative = (timestamp, { now = Date.now() } = {}) => {
	const diff = timestamp - now;
	const abs = Math.abs(diff);
	if (abs < 5000) {
		return 'just now';
	}
	for (const [ms, label] of REL_UNITS) {
		if (abs >= ms) {
			const n = Math.floor(abs / ms);
			return diff < 0 ? `${n}${label} ago` : `in ${n}${label}`;
		}
	}
	return 'just now';
};

/** Milliseconds → 'HH:MM:SS' (or 'D:HH:MM:SS' past 24h). */
export const formatClock = (ms) => {
	let rest = Math.max(0, Math.floor(ms / 1000));
	const s = rest % 60;
	rest = (rest - s) / 60;
	const m = rest % 60;
	rest = (rest - m) / 60;
	const h = rest % 24;
	const d = (rest - h) / 24;
	const pad = (n) => String(n).padStart(2, '0');
	return d > 0 ? `${d}:${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** Parse 'HH:MM' (24h). Throws on invalid input. */
export const parseClockTime = (value) => {
	const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
	if (!m) {
		throw new Error(`invalid time "${value}" — use "HH:MM" (24h)`);
	}
	return { hour: +m[1], minute: +m[2] };
};

/** Next occurrence of a local 'HH:MM' as epoch ms (today if still ahead). */
export const nextOccurrence = (at, { now = Date.now() } = {}) => {
	const { hour, minute } = parseClockTime(at);
	const d = new Date(now);
	d.setHours(hour, minute, 0, 0);
	if (d.getTime() <= now) {
		d.setDate(d.getDate() + 1);
	}
	return d.getTime();
};

/**
 * Is a time inside a window? Accepts 'HH:MM' strings or epoch ms for the
 * probe; overnight windows (22:00→06:00) handled.
 */
export const isWithinHours = (probe, from, to) => {
	const minutesOf = (value) => {
		if (typeof value === 'number') {
			const d = new Date(value);
			return d.getHours() * 60 + d.getMinutes();
		}
		const { hour, minute } = parseClockTime(value);
		return hour * 60 + minute;
	};
	const p = minutesOf(probe);
	const f = minutesOf(from);
	const t = minutesOf(to);
	return f <= t ? p >= f && p < t : p >= f || p < t;
};

/** JAP@Upgrade: locale-pretty date — humanDate(ts, 'id') → '28 September 2026'. */
export const humanDate = (timestamp = Date.now(), lang = 'en', options = { day: 'numeric', month: 'long', year: 'numeric' }) => {
	try {
		return new Intl.DateTimeFormat(lang, options).format(new Date(timestamp));
	} catch {
		return new Date(timestamp).toDateString();
	}
};

const GREETINGS = {
	en: ['Good night', 'Good morning', 'Good afternoon', 'Good evening'],
	id: ['Selamat malam', 'Selamat pagi', 'Selamat siang', 'Selamat malam']
};

/** Time-of-day greeting. `hour` defaults to the current local hour. */
export const getGreeting = (hour = new Date().getHours(), lang = 'en') => {
	const set = GREETINGS[lang] || GREETINGS.en;
	if (hour < 4) {
		return set[0];
	}
	if (hour < 11) {
		return set[1];
	}
	if (hour < 15) {
		return set[2];
	}
	if (hour < 19) {
		return lang === 'id' ? 'Selamat sore' : set[3];
	}
	return set[lang === 'id' ? 0 : 3];
};
