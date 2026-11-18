/**
 * Message counter — who talks how much, per chat, per day: powers "top
 * chatters" leaderboards and daily digests.
 *
 * ```js
 * import { createMessageCounter } from '@japofc/baileys'
 *
 * const counter = createMessageCounter()
 * counter.bind(sock)
 *
 * counter.getTopChatters(chat, 5)          // today's most active
 * counter.getUserCount(chat, user)         // messages today
 * counter.getChatTotal(chat)               // chat volume today
 *
 * // daily digest at 21:00 via your scheduler:
 * await sock.sendMessage(chat, {
 *     text: counter.renderDigest(chat),
 *     mentions: counter.getTopChatters(chat).map(t => t.user)
 * })
 *
 * counter.getHistory(chat, 7)              // last 7 days' totals
 * ```
 *
 * Days roll at local midnight; a bounded history window is kept per chat.
 */

export const createMessageCounter = (options = {}) => {
	const {
		historyDays = 7,
		now = () => Date.now()
	} = options;

	/** chat -> { day, users: Map(user -> count), history: [{ day, total, topUser }] } */
	const chats = new Map();
	let boundSock = null;
	let boundHandler = null;

	const dayKey = (t) => {
		const d = new Date(t);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	const bucket = (chat) => {
		const today = dayKey(now());
		let entry = chats.get(chat);
		if (!entry) {
			entry = { day: today, users: new Map(), history: [] };
			chats.set(chat, entry);
		}
		if (entry.day !== today) {
			// roll the finished day into history
			let total = 0;
			let topUser = null;
			let topCount = 0;
			for (const [user, count] of entry.users) {
				total += count;
				if (count > topCount) {
					topCount = count;
					topUser = user;
				}
			}
			entry.history.push({ day: entry.day, total, topUser });
			while (entry.history.length > historyDays) {
				entry.history.shift();
			}
			entry.day = today;
			entry.users = new Map();
		}
		return entry;
	};

	/** Handler for `messages.upsert` — real-time messages only. */
	const handler = ({ messages, type }) => {
		if (type && type !== 'notify') {
			return;
		}
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || chat === 'status@broadcast') {
				continue;
			}
			const user = msg.key.participant || chat;
			const entry = bucket(chat);
			entry.users.set(user, (entry.users.get(user) || 0) + 1);
		}
	};

	return {
		handler,
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
		/** Today's most active users in a chat, busiest first. */
		getTopChatters(chat, limit = 10) {
			const entry = bucket(chat);
			return [...entry.users]
				.map(([user, count]) => ({ user, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, limit);
		},
		getUserCount(chat, user) {
			return bucket(chat).users.get(user) || 0;
		},
		getChatTotal(chat) {
			let total = 0;
			for (const count of bucket(chat).users.values()) {
				total += count;
			}
			return total;
		},
		/** Finished days, oldest first: `[{ day, total, topUser }]`. */
		getHistory(chat, days = historyDays) {
			return bucket(chat).history.slice(-days).map(h => ({ ...h }));
		},
		/** Ready-to-send daily digest with medals. */
		renderDigest(chat, { title = '📈 *Rekap Chat Hari Ini*', limit = 5 } = {}) {
			const top = this.getTopChatters(chat, limit);
			const total = this.getChatTotal(chat);
			if (!total) {
				return `${title}\n(sepi — belum ada pesan hari ini)`;
			}
			const medals = ['🥇', '🥈', '🥉'];
			const lines = top.map((t, i) =>
				`${medals[i] || `${i + 1}.`} @${String(t.user).split('@')[0]} — ${t.count} pesan`);
			return [`${title}`, `Total: ${total} pesan`, '', ...lines].join('\n');
		},
		resetChat(chat) {
			return chats.delete(chat);
		},
		get size() {
			return chats.size;
		},
		toJSON() {
			return {
				entries: [...chats].map(([chat, e]) => [chat, { day: e.day, users: [...e.users], history: e.history }])
			};
		},
		load(snapshot) {
			chats.clear();
			for (const [chat, e] of snapshot?.entries || []) {
				chats.set(chat, { day: e.day, users: new Map(e.users), history: [...(e.history || [])] });
			}
		}
	};
};
