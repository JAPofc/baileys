/**
 * Reminders — "!remind 10m angkat gorengan": parse human durations, arm
 * timers, fire onDue, survive restarts via JSON persistence.
 *
 * ```js
 * import { createReminderManager, parseDuration } from '@japofc/baileys'
 *
 * parseDuration('1h30m')     // 5400000
 * parseDuration('2d')        // 172800000
 *
 * const reminders = createReminderManager()
 * reminders.onDue(({ chat, user, text }) =>
 *     sock.sendMessage(chat, { text: `⏰ @${user.split('@')[0]} ${text}`, mentions: [user] }))
 *
 * // in your !remind command:
 * const id = reminders.add({ chat, user: sender, text: 'angkat gorengan', inMs: parseDuration(args[0]) })
 * reminders.list(chat)       // pending reminders in this chat
 * reminders.cancel(id)
 *
 * // survive restarts:
 * fs.writeFileSync('reminders.json', JSON.stringify(reminders.toJSON()))
 * reminders.load(JSON.parse(fs.readFileSync('reminders.json'))) // re-arms; overdue fire immediately
 * ```
 */

const UNIT_MS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };

/**
 * Parse '90s', '10m', '1h30m', '2d 4h' → milliseconds. Returns null on
 * anything it doesn't understand (never throws).
 */
export const parseDuration = (input) => {
	const s = String(input ?? '').trim().toLowerCase();
	if (!s) {
		return null;
	}
	// NOTE: \b would fail on '1h30m' ('h' and '3' are both word chars —
	// no boundary), silently dropping the hours. Use a letter lookahead.
	const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)(?![a-z])/g;
	let total = 0;
	let matchedLen = 0;
	for (const m of s.matchAll(re)) {
		total += parseFloat(m[1]) * UNIT_MS[m[2]];
		matchedLen += m[0].length;
	}
	if (!total) {
		return null;
	}
	// reject inputs that are mostly garbage ('10m tomorrow' is fine-ish; 'x10m' is not)
	const stripped = s.replace(re, '').replace(/[\s,]+/g, '');
	if (stripped.length > 0 && matchedLen === 0) {
		return null;
	}
	return Math.round(total);
};

export const createReminderManager = (options = {}) => {
	const { maxPerUser = 25, now = () => Date.now() } = options;

	/** id -> { id, chat, user, text, dueAt, createdAt, timer } */
	const reminders = new Map();
	const dueCbs = new Set();
	let nextId = 1;

	const emit = (payload) => {
		for (const cb of dueCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const fire = (reminder) => {
		// JAP@Upgrade: recurring reminders re-arm instead of dying.
		if (reminder.repeatMs) {
			reminder.dueAt = now() + reminder.repeatMs;
			const { timer, ...safe } = reminder;
			emit({ ...safe, recurring: true });
			arm(reminder);
			return;
		}
		reminders.delete(reminder.id);
		const { timer, ...safe } = reminder;
		emit(safe);
	};

	const arm = (reminder) => {
		const delay = Math.max(0, reminder.dueAt - now());
		reminder.timer = setTimeout(() => fire(reminder), delay);
		if (reminder.timer.unref) {
			reminder.timer.unref();
		}
	};

	return {
		/**
		 * Schedule a reminder: `{ chat, user, text, inMs }` or `{ ..., atMs }`.
		 * Returns the reminder id.
		 */
		add({ chat, user, text = '', inMs, atMs, repeatMs } = {}) {
			if (!chat || !user) {
				throw new Error('reminder needs { chat, user }');
			}
			const dueAt = atMs ?? (inMs !== undefined ? now() + inMs : undefined);
			if (!Number.isFinite(dueAt) || dueAt <= now()) {
				throw new Error('reminder needs a future time (inMs or atMs)');
			}
			const mine = [...reminders.values()].filter(r => r.user === user).length;
			if (mine >= maxPerUser) {
				throw new Error(`reminder limit reached (${maxPerUser} per user)`);
			}
			if (repeatMs !== undefined && (!Number.isFinite(repeatMs) || repeatMs < 1000)) {
				throw new Error('repeatMs must be >= 1000');
			}
			const reminder = { id: nextId++, chat, user, text, dueAt, repeatMs, createdAt: now(), timer: null };
			reminders.set(reminder.id, reminder);
			arm(reminder);
			return reminder.id;
		},
		/** JAP@Upgrade: push a pending reminder back by `extraMs`. */
		snooze(id, extraMs) {
			const reminder = reminders.get(id);
			if (!reminder || !Number.isFinite(extraMs) || extraMs <= 0) {
				return null;
			}
			clearTimeout(reminder.timer);
			reminder.dueAt += extraMs;
			arm(reminder);
			return reminder.dueAt;
		},
		cancel(id) {
			const reminder = reminders.get(id);
			if (!reminder) {
				return false;
			}
			clearTimeout(reminder.timer);
			reminders.delete(id);
			return true;
		},
		/** Pending reminders — everywhere, in one chat, or for one user. */
		list({ chat, user } = {}) {
			return [...reminders.values()]
				.filter(r => (!chat || r.chat === chat) && (!user || r.user === user))
				.sort((a, b) => a.dueAt - b.dueAt)
				.map(({ timer, ...safe }) => safe);
		},
		onDue(cb) {
			dueCbs.add(cb);
			return () => dueCbs.delete(cb);
		},
		get size() {
			return reminders.size;
		},
		toJSON() {
			return { nextId, entries: this.list() };
		},
		/**
		 * Restore a snapshot: pending reminders re-arm; overdue ones fire
		 * on the next tick (marked `late: true`).
		 */
		load(snapshot) {
			this.clear();
			nextId = snapshot?.nextId || 1;
			for (const entry of snapshot?.entries || []) {
				const reminder = { ...entry, timer: null };
				reminders.set(reminder.id, reminder);
				if (reminder.dueAt <= now()) {
					reminder.late = true;
					const t = setTimeout(() => fire(reminder), 0);
					if (t.unref) {
						t.unref();
					}
					reminder.timer = t;
				} else {
					arm(reminder);
				}
			}
		},
		clear() {
			for (const reminder of reminders.values()) {
				clearTimeout(reminder.timer);
			}
			reminders.clear();
		}
	};
};
