/**
 * Attendance ("absen") — the daily roll-call list every Indonesian group
 * bot runs: open a session, members check in, render the numbered list.
 *
 * ```js
 * import { createAttendance } from '@japofc/baileys'
 *
 * const absen = createAttendance({ keyword: 'absen' })
 * absen.bind(sock)
 *
 * absen.open(chat, { title: 'Absen Pagi 🌞' })
 * // members type "absen" → auto check-in
 * absen.onCheckIn(({ user, position }) => console.log(user, 'is #' + position))
 *
 * await sock.sendMessage(chat, { text: absen.render(chat), mentions: absen.getMentions(chat) })
 * // Absen Pagi 🌞
 * // 1. @62812xxx — 07:01
 * // 2. @62813xxx — 07:05
 *
 * absen.close(chat) // returns the final list
 * ```
 */

export const createAttendance = (options = {}) => {
	const {
		keyword = 'absen',
		now = () => Date.now()
	} = options;

	/** chat -> { title, openedAt, openedBy, checkins: Map(user -> at) } */
	const sessions = new Map();
	// JAP@Upgrade: consecutive-day streaks per (chat, user).
	const streaks = new Map(); // `${chat}:${user}` -> { streak, lastDay }
	const dayKey = (t) => {
		const d = new Date(t);
		return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
	};
	const checkInCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (payload) => {
		for (const cb of checkInCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const clock = (t) => {
		const d = new Date(t);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	};

	/** Check a user in. Returns their 1-based position, or null. */
	const checkIn = (chat, user, at = now()) => {
		const session = sessions.get(chat);
		if (!session || session.checkins.has(user)) {
			return null;
		}
		session.checkins.set(user, at);
		const position = session.checkins.size;
		const key = `${chat}:${user}`;
		const today = dayKey(at);
		const prev = streaks.get(key);
		if (!prev || today - prev.lastDay > 1) {
			streaks.set(key, { streak: 1, lastDay: today });
		} else if (today - prev.lastDay === 1) {
			streaks.set(key, { streak: prev.streak + 1, lastDay: today });
		} // same day: unchanged
		emit({ chat, user, position, at, streak: streaks.get(key).streak });
		return position;
	};

	/** Handler for `messages.upsert` — keyword texts check the sender in. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || !sessions.has(chat)) {
				continue;
			}
			const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();
			if (text === keyword.toLowerCase()) {
				checkIn(chat, msg.key.participant || chat);
			}
		}
	};

	return {
		handler,
		checkIn,
		/** Open a session (replaces any previous one in the chat). */
		open(chat, { title = '📋 Absen', openedBy } = {}) {
			sessions.set(chat, { title, openedAt: now(), openedBy, checkins: new Map() });
			return { chat, title, keyword };
		},
		/** Close and return the final list. */
		close(chat) {
			const session = sessions.get(chat);
			if (!session) {
				return null;
			}
			sessions.delete(chat);
			return {
				chat,
				title: session.title,
				openedAt: session.openedAt,
				closedAt: now(),
				attendees: [...session.checkins].map(([user, at], i) => ({ position: i + 1, user, at }))
			};
		},
		/** JAP@Upgrade: pretty recap from a close() result. */
		renderSummary(closed) {
			if (!closed?.attendees) {
				return null;
			}
			const dur = Math.max(1, Math.round((closed.closedAt - closed.openedAt) / 60_000));
			const lines = closed.attendees.map(a => `${a.position}. @${String(a.user).split('@')[0]} \u2014 ${clock(a.at)}`);
			return [`${closed.title} \u2014 *REKAP*`, `${closed.attendees.length} hadir \u00b7 sesi ${dur} menit`, '', ...(lines.length ? lines : ['(kosong)'])].join('\n');
		},
		isOpen: (chat) => sessions.has(chat),
		getAttendees(chat) {
			const session = sessions.get(chat);
			return session ? [...session.checkins].map(([user, at], i) => ({ position: i + 1, user, at })) : [];
		},
		/** Users who are in `participants` but haven't checked in. */
		getMissing(chat, participants = []) {
			const session = sessions.get(chat);
			if (!session) {
				return [];
			}
			const ids = participants.map(p => (typeof p === 'string' ? p : p?.id)).filter(Boolean);
			return ids.filter(id => !session.checkins.has(id));
		},
		/** Ready-to-send numbered list with check-in times. */
		render(chat) {
			const session = sessions.get(chat);
			if (!session) {
				return null;
			}
			const lines = [...session.checkins].map(([user, at], i) =>
				`${i + 1}. @${String(user).split('@')[0]} — ${clock(at)}`);
			return [
				`${session.title}`,
				`Ketik *${keyword}* untuk hadir`,
				'',
				...(lines.length ? lines : ['(belum ada yang absen)'])
			].join('\n');
		},
		/** Mentions array matching render() output. */
		/** JAP@Upgrade: consecutive-day attendance streak for a user. */
		getStreak(chat, user) {
			const entry = streaks.get(`${chat}:${user}`);
			if (!entry) {
				return 0;
			}
			return dayKey(now()) - entry.lastDay <= 1 ? entry.streak : 0;
		},
		getMentions(chat) {
			return [...(sessions.get(chat)?.checkins.keys() ?? [])];
		},
		bind(sock) {
			boundSock = sock;
			boundHandler = handler;
			sock.ev.on('messages.upsert', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('messages.upsert', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		onCheckIn(cb) {
			checkInCbs.add(cb);
			return () => checkInCbs.delete(cb);
		},
		get size() {
			return sessions.size;
		},
		/**
		 * JAP@Fix + Upgrade: persistence. Attendance advertises multi-day
		 * consecutive streaks, but with no toJSON/load the `streaks` map (and any
		 * open session) lived only in memory — so every bot restart silently reset
		 * every streak to 1, making the streak feature effectively non-functional
		 * for the daily-restart bots it targets. `toJSON()`/`load()` now round-trip
		 * both the streak state and any in-progress session.
		 */
		toJSON() {
			return {
				sessions: [...sessions].map(([chat, s]) => [chat, {
					title: s.title,
					openedAt: s.openedAt,
					openedBy: s.openedBy,
					checkins: [...s.checkins]
				}]),
				streaks: [...streaks]
			};
		},
		load(snapshot) {
			sessions.clear();
			streaks.clear();
			for (const [chat, s] of snapshot?.sessions || []) {
				sessions.set(chat, {
					title: s.title,
					openedAt: s.openedAt,
					openedBy: s.openedBy,
					checkins: new Map(s.checkins || [])
				});
			}
			for (const [key, v] of snapshot?.streaks || []) {
				streaks.set(key, { streak: v.streak, lastDay: v.lastDay });
			}
		},
		clear() {
			sessions.clear();
			streaks.clear();
		}
	};
};
