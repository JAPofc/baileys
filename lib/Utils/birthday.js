/**
 * Birthday manager — remember birthdays, get today's celebrants and the
 * upcoming week, run a daily check that congratulates automatically.
 *
 * ```js
 * import { createBirthdayManager } from '@japofc/baileys'
 *
 * const bdays = createBirthdayManager()
 * bdays.set(userJid, { day: 17, month: 8, year: 2000, chat: groupJid })
 *
 * bdays.onBirthday(({ user, age, chat }) =>
 *     sock.sendMessage(chat, { text: `🎂 Happy birthday @${user.split('@')[0]}${age ? ` (${age})` : ''}!`, mentions: [user] }))
 * bdays.start()                 // checks once a day (and right away)
 *
 * bdays.getToday()              // celebrants today
 * bdays.getUpcoming(7)          // next 7 days, sorted
 * ```
 *
 * Each birthday fires at most once per year per user, even across restarts
 * within the same day (`lastCelebratedYear` is persisted).
 */

// JAP@Upgrade: western zodiac from day/month — [endDay, sign] per month
const ZODIAC = [
	[19, 'Capricorn', 'Aquarius'], [18, 'Aquarius', 'Pisces'], [20, 'Pisces', 'Aries'],
	[19, 'Aries', 'Taurus'], [20, 'Taurus', 'Gemini'], [20, 'Gemini', 'Cancer'],
	[22, 'Cancer', 'Leo'], [22, 'Leo', 'Virgo'], [22, 'Virgo', 'Libra'],
	[22, 'Libra', 'Scorpio'], [21, 'Scorpio', 'Sagittarius'], [21, 'Sagittarius', 'Capricorn']
];

/** Western zodiac sign for a date: getZodiac(17, 8) → 'Leo'. */
export const getZodiac = (day, month) => {
	if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1 || day > 31) {
		return null;
	}
	const [endDay, before, after] = ZODIAC[month - 1];
	return day <= endDay ? before : after;
};

export const createBirthdayManager = (options = {}) => {
	const { checkIntervalMs = 60 * 60_000, now = () => Date.now() } = options;

	/** user -> { day, month, year?, chat?, lastCelebratedYear? } */
	const entries = new Map();
	const birthdayCbs = new Set();
	let timer = null;

	const emit = (payload) => {
		for (const cb of birthdayCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the daily check
			}
		}
	};

	const today = () => {
		const d = new Date(now());
		return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
	};

	/** Days from today until the next occurrence of day/month (0 = today). */
	const daysUntil = (day, month) => {
		const t = new Date(now());
		t.setHours(0, 0, 0, 0);
		const target = new Date(t.getFullYear(), month - 1, day);
		target.setHours(0, 0, 0, 0);
		if (target < t) {
			target.setFullYear(target.getFullYear() + 1);
		}
		return Math.round((target - t) / 86_400_000);
	};

	/** Run one check — fires onBirthday for everyone celebrating today. */
	const checkNow = () => {
		const { day, month, year } = today();
		const celebrated = [];
		for (const [user, entry] of entries) {
			if (entry.day !== day || entry.month !== month) {
				continue;
			}
			if (entry.lastCelebratedYear === year) {
				continue; // already congratulated this year
			}
			entry.lastCelebratedYear = year;
			const age = entry.year ? year - entry.year : undefined;
			const event = { user, chat: entry.chat, day, month, age, zodiac: getZodiac(day, month) };
			celebrated.push(event);
			emit(event);
		}
		return celebrated;
	};

	return {
		/** Add or update a birthday: `{ day, month, year?, chat? }`. */
		set(user, { day, month, year, chat } = {}) {
			if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
				throw new Error('birthday needs { day: 1-31, month: 1-12 }');
			}
			const existing = entries.get(user);
			entries.set(user, { day, month, year, chat, lastCelebratedYear: existing?.lastCelebratedYear });
			return entries.get(user);
		},
		remove(user) {
			return entries.delete(user);
		},
		get(user) {
			return entries.get(user) ?? null;
		},
		/** Everyone celebrating today (does NOT mark them as celebrated). */
		getToday() {
			const { day, month, year } = today();
			return [...entries]
				.filter(([, e]) => e.day === day && e.month === month)
				.map(([user, e]) => ({ user, chat: e.chat, age: e.year ? year - e.year : undefined, zodiac: getZodiac(e.day, e.month) }));
		},
		/** Birthdays in the next `days` days (0 = today), sorted soonest first. */
		getUpcoming(days = 7) {
			return [...entries]
				.map(([user, e]) => ({ user, chat: e.chat, day: e.day, month: e.month, inDays: daysUntil(e.day, e.month) }))
				.filter(e => e.inDays <= days)
				.sort((a, b) => a.inDays - b.inDays);
		},
		/** JAP@Upgrade: ready-to-send upcoming-birthdays list. */
		renderUpcoming(days = 7, { title = '🎂 *Upcoming birthdays*' } = {}) {
			const upcoming = this.getUpcoming(days);
			if (!upcoming.length) {
				return `${title}\n(none in the next ${days} days)`;
			}
			const lines = upcoming.map(u => {
				const when = u.inDays === 0 ? 'TODAY 🎉' : u.inDays === 1 ? 'tomorrow' : `in ${u.inDays} days`;
				return `• @${String(u.user).split('@')[0]} — ${u.day}/${u.month} (${when})`;
			});
			return `${title}\n${lines.join('\n')}`;
		},
		checkNow,
		/** Start periodic checks (hourly by default; fires at most 1x/year/user). */
		start() {
			if (timer) {
				return () => this.stop();
			}
			checkNow();
			timer = setInterval(checkNow, checkIntervalMs);
			if (timer.unref) {
				timer.unref();
			}
			return () => this.stop();
		},
		stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		get isRunning() {
			return !!timer;
		},
		onBirthday(cb) {
			birthdayCbs.add(cb);
			return () => birthdayCbs.delete(cb);
		},
		get size() {
			return entries.size;
		},
		toJSON() {
			return { entries: [...entries] };
		},
		load(snapshot) {
			entries.clear();
			for (const [user, entry] of snapshot?.entries || []) {
				entries.set(user, { ...entry });
			}
		},
		clear() {
			entries.clear();
		}
	};
};
