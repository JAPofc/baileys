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
		emit({ chat, user, position, at });
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
		}
	};
};
