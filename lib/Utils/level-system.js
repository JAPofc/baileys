/**
 * Level system — XP and levels per user ("levelup" bots): messages earn XP,
 * levels follow a quadratic curve, leaderboards included.
 *
 * ```js
 * import { createLevelSystem } from '@japofc/baileys'
 *
 * const levels = createLevelSystem({ xpPerMessage: [10, 20], cooldownMs: 30_000 })
 * levels.bind(sock) // counts every real incoming message
 *
 * levels.onLevelUp(({ user, chat, level }) =>
 *     sock.sendMessage(chat, { text: `🎉 @${user.split('@')[0]} reached level ${level}!`, mentions: [user] }))
 *
 * levels.getUser(jid)               // { xp, level, messages, nextLevelXp, progress }
 * levels.getLeaderboard(10)         // top 10 globally
 * levels.getLeaderboard(10, chatId) // top 10 in one group
 *
 * fs.writeFileSync('levels.json', JSON.stringify(levels.toJSON()))  // persist
 * levels.load(JSON.parse(fs.readFileSync('levels.json')))
 * ```
 *
 * Level curve: level n needs `baseXp * n²` total XP (baseXp default 100) —
 * level 1 at 100, level 2 at 400, level 3 at 900...
 */

export const createLevelSystem = (options = {}) => {
	const {
		xpPerMessage = [10, 20],
		cooldownMs = 30_000,
		baseXp = 100,
		groupsChatStats = true
	} = options;

	const [xpMin, xpMax] = Array.isArray(xpPerMessage) ? xpPerMessage : [xpPerMessage, xpPerMessage];

	/** user -> { xp, messages, lastXpAt, chats: { chatJid: xp } } */
	const users = new Map();
	const levelUpCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / baseXp));
	const xpForLevel = (level) => baseXp * level * level;

	const emit = (payload) => {
		for (const cb of levelUpCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	const describe = (user, entry) => {
		const level = levelOf(entry.xp);
		const nextLevelXp = xpForLevel(level + 1);
		const currentLevelXp = xpForLevel(level);
		return {
			user,
			xp: entry.xp,
			level,
			messages: entry.messages,
			nextLevelXp,
			progress: (entry.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)
		};
	};

	/** Award XP manually. Returns the user's new stats. */
	const addXp = (user, amount, chat) => {
		let entry = users.get(user);
		if (!entry) {
			entry = { xp: 0, messages: 0, lastXpAt: 0, chats: {} };
			users.set(user, entry);
		}
		const before = levelOf(entry.xp);
		entry.xp += amount;
		if (chat && groupsChatStats) {
			entry.chats[chat] = (entry.chats[chat] || 0) + amount;
		}
		const after = levelOf(entry.xp);
		if (after > before) {
			emit({ user, chat, level: after, previousLevel: before, xp: entry.xp });
		}
		return describe(user, entry);
	};

	/** Handler for `messages.upsert` — real incoming messages earn XP. */
	const handler = ({ messages, type }) => {
		if (type && type !== 'notify') {
			return;
		}
		const now = Date.now();
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || chat === 'status@broadcast') {
				continue;
			}
			const user = msg.key.participant || chat;
			let entry = users.get(user);
			if (!entry) {
				entry = { xp: 0, messages: 0, lastXpAt: 0, chats: {} };
				users.set(user, entry);
			}
			entry.messages++;
			if (now - entry.lastXpAt < cooldownMs) {
				continue; // message counted, no XP during cooldown
			}
			entry.lastXpAt = now;
			const amount = xpMin + Math.floor(Math.random() * (xpMax - xpMin + 1));
			addXp(user, amount, chat);
		}
	};

	return {
		handler,
		addXp,
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
		onLevelUp(cb) {
			levelUpCbs.add(cb);
			return () => levelUpCbs.delete(cb);
		},
		getUser(user) {
			const entry = users.get(user);
			return entry ? describe(user, entry) : null;
		},
		/** Top users by XP — global, or within one chat when `chat` given. */
		getLeaderboard(limit = 10, chat) {
			const rows = [...users].map(([user, entry]) => ({
				user,
				xp: chat ? (entry.chats[chat] || 0) : entry.xp,
				level: levelOf(chat ? (entry.chats[chat] || 0) : entry.xp),
				messages: entry.messages
			}));
			return rows
				.filter(r => r.xp > 0)
				.sort((a, b) => b.xp - a.xp)
				.slice(0, limit)
				.map((row, i) => ({ rank: i + 1, ...row }));
		},
		levelOf,
		xpForLevel,
		/** Serialize for persistence. */
		toJSON() {
			return { baseXp, entries: [...users].map(([user, e]) => [user, { xp: e.xp, messages: e.messages, chats: e.chats }]) };
		},
		/** Restore a previous toJSON() snapshot. */
		load(snapshot) {
			users.clear();
			for (const [user, e] of snapshot?.entries || []) {
				users.set(user, { xp: e.xp || 0, messages: e.messages || 0, lastXpAt: 0, chats: e.chats || {} });
			}
		},
		get size() {
			return users.size;
		},
		clear() {
			users.clear();
		}
	};
};
