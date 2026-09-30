/**
 * AFK manager — mark users (or yourself) away; get notified when someone
 * pings them, and automatically welcome them back when they type again.
 *
 * ```js
 * import { createAfkManager } from '@japofc/baileys'
 *
 * const afk = createAfkManager()
 * afk.bind(sock) // listens on messages.upsert
 *
 * // e.g. inside your command handler:
 * afk.setAfk(sender, 'lunch break 🍜')
 *
 * afk.onAfkMention(({ chat, afkUser, reason, since, msg }) =>
 *     sock.sendMessage(chat, {
 *         text: `@${afkUser.split('@')[0]} is AFK: ${reason}`,
 *         mentions: [afkUser]
 *     }, { quoted: msg }))
 *
 * afk.onReturn(({ user, awayMs, missed }) =>
 *     console.log(user, 'is back after', awayMs, 'ms —', missed.length, 'pings while away'))
 * ```
 *
 * A user is "pinged" when they are @mentioned or when the message replies to
 * one of theirs (quoted participant). When an AFK user sends any message
 * themselves they are automatically marked back.
 */

const DEFAULT_MAX_MISSED = 100;

export const createAfkManager = (options = {}) => {
	const { maxMissedPerUser = DEFAULT_MAX_MISSED, autoReturn = true } = options;

	/** jid -> { reason, since, missed: [] } */
	const totalAfk = new Map();
	const away = new Map();
	const mentionCbs = new Set();
	const returnCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	const setBack = (jid) => {
		const entry = away.get(jid);
		if (!entry) {
			return null;
		}
		// JAP@Upgrade: accumulate lifetime AFK duration
		totalAfk.set(jid, (totalAfk.get(jid) || 0) + (Date.now() - entry.since));
		away.delete(jid);
		const summary = {
			user: jid,
			reason: entry.reason,
			since: entry.since,
			awayMs: Date.now() - entry.since,
			missed: entry.missed
		};
		emit(returnCbs, summary);
		return summary;
	};

	/** Handler for `messages.upsert`. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const key = msg?.key;
			const chat = key?.remoteJid;
			if (!chat || !msg.message) {
				continue;
			}
			const sender = key.participant || chat;
			// AFK user speaks → they are back
			if (autoReturn && !key.fromMe && away.has(sender)) {
				setBack(sender);
			}
			// collect pinged users: @mentions + quoted participant
			const pinged = new Set();
			for (const content of Object.values(msg.message)) {
				const ctx = content && typeof content === 'object' ? content.contextInfo : undefined;
				if (!ctx) {
					continue;
				}
				for (const jid of ctx.mentionedJid || []) {
					pinged.add(jid);
				}
				if (ctx.participant) {
					pinged.add(ctx.participant);
				}
			}
			for (const afkUser of pinged) {
				const entry = away.get(afkUser);
				if (!entry || afkUser === sender) {
					continue;
				}
				const ping = { chat, from: sender, at: Date.now(), keyId: key.id };
				entry.missed.push(ping);
				while (entry.missed.length > maxMissedPerUser) {
					entry.missed.shift();
				}
				emit(mentionCbs, {
					chat,
					from: sender,
					afkUser,
					reason: entry.reason,
					since: entry.since,
					msg
				});
			}
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
		/** Mark a user AFK. Returns their entry. */
		setAfk(jid, reason = '') {
			const entry = { reason, since: Date.now(), missed: [] };
			away.set(jid, entry);
			return { user: jid, ...entry };
		},
		/** Mark a user back manually. Returns a summary (or null if not AFK). */
		setBack,
		isAfk: (jid) => away.has(jid),
		getAfk: (jid) => {
			const entry = away.get(jid);
			return entry ? { user: jid, ...entry } : null;
		},
		getAfkUsers: () => [...away.keys()],
		/** JAP@Upgrade: cumulative AFK time (ms) across completed sessions. */
		getTotalAfkMs(jid) {
			return totalAfk.get(jid) || 0;
		},
		/** JAP@Upgrade: ready-to-send list of who's AFK and for how long. */
		renderAfkList({ title = '💤 *Lagi AFK*' } = {}) {
			const entries = [...away.entries()];
			if (!entries.length) {
				return `${title}\n(tidak ada yang AFK)`;
			}
			const lines = entries.map(([jid, e], i) => {
				const mins = Math.floor((Date.now() - e.since) / 60_000);
				const dur = mins >= 60 ? `${Math.floor(mins / 60)}j ${mins % 60}m` : `${mins}m`;
				return `${i + 1}. @${String(jid).split('@')[0]} — ${e.reason || '(tanpa alasan)'} (${dur})`;
			});
			return `${title}\n${lines.join('\n')}`;
		},
		/** Fires when someone @mentions or replies to an AFK user. */
		onAfkMention(cb) {
			mentionCbs.add(cb);
			return () => mentionCbs.delete(cb);
		},
		/** Fires when an AFK user returns (auto or manual). */
		onReturn(cb) {
			returnCbs.add(cb);
			return () => returnCbs.delete(cb);
		},
		get size() {
			return away.size;
		},
		clear() {
			away.clear();
		}
	};
};
