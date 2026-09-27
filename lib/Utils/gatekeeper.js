/**
 * Gatekeeper — ban users/chats from your bot and filter them out of any
 * handler with one wrapper. The moderation glue for router/command bots.
 *
 * ```js
 * import { createGatekeeper } from '@japofc/baileys'
 *
 * const gate = createGatekeeper()
 * gate.banUser('pest@s.whatsapp.net', 'spam')
 * gate.banChat('toxic@g.us')
 *
 * // wrap any messages.upsert handler — banned traffic never reaches it:
 * sock.ev.on('messages.upsert', gate.filter(async ({ messages }) => {
 *     // only clean messages arrive here
 * }))
 *
 * gate.allows(msg)                  // manual check for a single message
 * gate.onBlocked(({ user, chat }) => console.log('dropped msg from', user))
 * gate.unbanUser('pest@s.whatsapp.net')
 * ```
 *
 * `mode: 'allowlist'` flips the logic: ONLY explicitly allowed users/chats
 * pass (private-bot mode).
 */

export const createGatekeeper = (options = {}) => {
	const { mode = 'denylist' } = options;

	const bannedUsers = new Map(); // jid -> { reason, at }
	const bannedChats = new Map();
	const allowedUsers = new Set(options.allowedUsers || []);
	const allowedChats = new Set(options.allowedChats || []);
	const blockedCbs = new Set();
	let blockedCount = 0;

	const emit = (payload) => {
		for (const cb of blockedCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	// JAP@Upgrade: temporary bans — expired entries clean themselves up.
	const banActive = (map, jid) => {
		const info = map.get(jid);
		if (!info) {
			return false;
		}
		if (info.expiresAt && info.expiresAt <= Date.now()) {
			map.delete(jid);
			return false;
		}
		return true;
	};

	const allowsIds = (user, chat) => {
		if (mode === 'allowlist') {
			return (chat && allowedChats.has(chat)) || (user && allowedUsers.has(user));
		}
		if (chat && banActive(bannedChats, chat)) {
			return false;
		}
		if (user && banActive(bannedUsers, user)) {
			return false;
		}
		return true;
	};

	const senderOf = (msg) => {
		const chat = msg?.key?.remoteJid;
		return { chat, user: msg?.key?.participant || chat };
	};

	return {
		/** True if this WAMessage passes the gate. */
		allows(msg) {
			const { chat, user } = senderOf(msg);
			return allowsIds(user, chat);
		},
		/** True if this user/chat combination passes the gate. */
		allowsJid: (user, chat) => allowsIds(user, chat),
		/**
		 * Wrap a `messages.upsert` handler: banned messages are stripped from
		 * the batch (whole call skipped when nothing survives).
		 */
		filter(handlerFn) {
			return (upsert, ...rest) => {
				const messages = (upsert?.messages || []).filter(msg => {
					const { chat, user } = senderOf(msg);
					const ok = allowsIds(user, chat);
					if (!ok) {
						blockedCount++;
						emit({ user, chat, msg });
					}
					return ok;
				});
				if (!messages.length && (upsert?.messages || []).length) {
					return undefined; // everything was banned
				}
				return handlerFn({ ...upsert, messages }, ...rest);
			};
		},
		banUser(jid, reason = '', { expiresInMs } = {}) {
			bannedUsers.set(jid, { reason, at: Date.now(), expiresAt: expiresInMs ? Date.now() + expiresInMs : 0 });
		},
		/** JAP@Upgrade: bulk ban (raid cleanup). Returns how many were added. */
		banMany(jids, reason = '', options = {}) {
			let added = 0;
			for (const jid of jids || []) {
				if (jid && !bannedUsers.has(jid)) {
					added++;
				}
				this.banUser(jid, reason, options);
			}
			return added;
		},
		unbanUser(jid) {
			return bannedUsers.delete(jid);
		},
		banChat(jid, reason = '', { expiresInMs } = {}) {
			bannedChats.set(jid, { reason, at: Date.now(), expiresAt: expiresInMs ? Date.now() + expiresInMs : 0 });
		},
		unbanChat(jid) {
			return bannedChats.delete(jid);
		},
		allowUser(jid) {
			allowedUsers.add(jid);
		},
		allowChat(jid) {
			allowedChats.add(jid);
		},
		disallowUser(jid) {
			return allowedUsers.delete(jid);
		},
		disallowChat(jid) {
			return allowedChats.delete(jid);
		},
		isBannedUser: (jid) => banActive(bannedUsers, jid),
		isBannedChat: (jid) => banActive(bannedChats, jid),
		getBanInfo: (jid) => bannedUsers.get(jid) || bannedChats.get(jid) || null,
		/** JAP@Upgrade: detailed ban list with reasons and remaining time. */
		listBans() {
			const describe = (map, type) => [...map.entries()]
				.filter(([jid]) => banActive(map, jid))
				.map(([jid, info]) => ({
					jid,
					type,
					reason: info.reason,
					at: info.at,
					expiresAt: info.expiresAt || null,
					remainingMs: info.expiresAt ? Math.max(0, info.expiresAt - Date.now()) : null
				}));
			return [...describe(bannedUsers, 'user'), ...describe(bannedChats, 'chat')];
		},
		getBannedUsers: () => [...bannedUsers.keys()],
		getBannedChats: () => [...bannedChats.keys()],
		onBlocked(cb) {
			blockedCbs.add(cb);
			return () => blockedCbs.delete(cb);
		},
		get blockedCount() {
			return blockedCount;
		},
		/** Serialize for persistence. */
		toJSON() {
			return {
				mode,
				bannedUsers: [...bannedUsers],
				bannedChats: [...bannedChats],
				allowedUsers: [...allowedUsers],
				allowedChats: [...allowedChats]
			};
		},
		/** Restore a previous toJSON() snapshot. */
		load(snapshot) {
			bannedUsers.clear();
			bannedChats.clear();
			allowedUsers.clear();
			allowedChats.clear();
			for (const [jid, info] of snapshot?.bannedUsers || []) {
				bannedUsers.set(jid, info);
			}
			for (const [jid, info] of snapshot?.bannedChats || []) {
				bannedChats.set(jid, info);
			}
			for (const jid of snapshot?.allowedUsers || []) {
				allowedUsers.add(jid);
			}
			for (const jid of snapshot?.allowedChats || []) {
				allowedChats.add(jid);
			}
		},
		clear() {
			bannedUsers.clear();
			bannedChats.clear();
		}
	};
};
