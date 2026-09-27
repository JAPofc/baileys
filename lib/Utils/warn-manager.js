/**
 * Warn manager — the classic three-strikes moderation system: warn users,
 * hit a threshold, act (kick/mute/whatever you decide).
 *
 * ```js
 * import { createWarnManager } from '@japofc/baileys'
 *
 * const warns = createWarnManager({ threshold: 3 })
 *
 * // inside your !warn command:
 * const { count, reachedThreshold } = warns.warn(target, {
 *     chat, by: sender, reason: 'spamming links'
 * })
 * await sock.sendMessage(chat, { text: `⚠️ warn ${count}/3` })
 *
 * warns.onThreshold(async ({ user, chat }) => {
 *     await sock.groupParticipantsUpdate(chat, [user], 'remove')
 *     warns.reset(user, chat)
 * })
 *
 * warns.pardon(target, chat)   // remove one warn
 * warns.getWarns(target, chat) // full history
 * ```
 *
 * Warns are tracked per user per chat by default; pass `perChat: false` for
 * one global counter per user. Plays nicely with anti-link/word-filter:
 * call `warns.warn(...)` from their onDetected/onMatch callbacks.
 */

const DEFAULT_MAX_USERS = 5000;

export const createWarnManager = (options = {}) => {
	const { threshold = 3, perChat = true, maxUsers = DEFAULT_MAX_USERS } = options;

	/** key -> { warns: [{ reason, by, chat, at }] } */
	const store = new Map();
	const warnCbs = new Set();
	const thresholdCbs = new Set();

	const keyOf = (user, chat) => (perChat ? `${chat ?? ''}::${user}` : user);

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const touch = (key) => {
		const entry = store.get(key);
		if (entry) {
			store.delete(key);
			store.set(key, entry);
			return entry;
		}
		const fresh = { warns: [] };
		store.set(key, fresh);
		while (store.size > maxUsers) {
			const oldest = store.keys().next().value;
			store.delete(oldest);
		}
		return fresh;
	};

	return {
		/**
		 * Add a warn. Returns `{ user, chat, count, threshold,
		 * reachedThreshold, warn }`. Fires onThreshold when count hits it.
		 */
		warn(user, { chat, reason = '', by } = {}) {
			const entry = touch(keyOf(user, chat));
			const warn = { reason, by, chat, at: Date.now() };
			entry.warns.push(warn);
			const count = entry.warns.length;
			const result = { user, chat, count, threshold, reachedThreshold: count >= threshold, warn };
			emit(warnCbs, result);
			if (result.reachedThreshold) {
				emit(thresholdCbs, { ...result, warns: [...entry.warns] });
			}
			return result;
		},
		/** Remove the most recent warn(s). Returns the new count. */
		pardon(user, chat, amount = 1) {
			const entry = store.get(keyOf(user, chat));
			if (!entry) {
				return 0;
			}
			entry.warns.splice(-Math.max(1, amount));
			if (!entry.warns.length) {
				store.delete(keyOf(user, chat));
				return 0;
			}
			return entry.warns.length;
		},
		/**
		 * JAP@Upgrade: expire warns older than `olderThanMs` everywhere
		 * ("warns reset after 30 days"). Returns how many were removed.
		 */
		decay(olderThanMs) {
			const cutoff = Date.now() - olderThanMs;
			let removed = 0;
			for (const [key, entry] of store) {
				const before = entry.warns.length;
				entry.warns = entry.warns.filter(w => w.at > cutoff);
				removed += before - entry.warns.length;
				if (!entry.warns.length) {
					store.delete(key);
				}
			}
			return removed;
		},
		/** Wipe all warns for a user (in a chat). */
		reset(user, chat) {
			store.delete(keyOf(user, chat));
		},
		getCount(user, chat) {
			return store.get(keyOf(user, chat))?.warns.length ?? 0;
		},
		getWarns(user, chat) {
			return [...(store.get(keyOf(user, chat))?.warns ?? [])];
		},
		/** All users with warns — optionally only for one chat. */
		list(chat) {
			const out = [];
			for (const [key, entry] of store) {
				if (!entry.warns.length) {
					continue;
				}
				const [entryChat, user] = perChat ? key.split('::') : [undefined, key];
				if (chat && perChat && entryChat !== chat) {
					continue;
				}
				out.push({ user, chat: perChat ? (entryChat || undefined) : undefined, count: entry.warns.length });
			}
			return out;
		},
		/** JAP@Upgrade: most-warned users leaderboard. */
		getTop(limit = 10, chat) {
			return this.list(chat)
				.sort((a, b) => b.count - a.count)
				.slice(0, limit);
		},
		onWarn(cb) {
			warnCbs.add(cb);
			return () => warnCbs.delete(cb);
		},
		onThreshold(cb) {
			thresholdCbs.add(cb);
			return () => thresholdCbs.delete(cb);
		},
		/** Serialize for persistence. */
		toJSON() {
			return { perChat, threshold, entries: [...store].map(([key, entry]) => [key, entry.warns]) };
		},
		/** Restore a previous toJSON() snapshot. */
		load(snapshot) {
			store.clear();
			for (const [key, warns] of snapshot?.entries || []) {
				store.set(key, { warns: [...warns] });
			}
		},
		get size() {
			return store.size;
		},
		clear() {
			store.clear();
		}
	};
};
