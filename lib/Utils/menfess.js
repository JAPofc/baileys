/**
 * Menfess relay — anonymous two-way chat sessions through the bot: the
 * classic Indonesian "menfess" bot, batteries included.
 *
 * ```js
 * import { createMenfessRelay } from '@japofc/baileys'
 *
 * const menfess = createMenfessRelay({ sessionTtlMs: 30 * 60_000 })
 * menfess.bind(sock)
 *
 * // e.g. inside your !menfess <number> <text> command:
 * await menfess.start(sock, sender, targetJid, firstMessage)
 * // target receives: "💌 Menfess from Anon-1 ..." — sender stays hidden
 *
 * // from now on every DM either side sends to the bot is relayed on:
 * menfess.onRelayed(({ session, direction, text }) => console.log(direction, text))
 * menfess.onEnded(({ session, reason }) => console.log('ended:', reason))
 *
 * menfess.end(sessionId)              // or either side sends "stop"
 * ```
 *
 * One user can hold one active session at a time; identities are never
 * leaked to the counterpart (alias `Anon-N` only).
 */

const DEFAULT_TTL_MS = 30 * 60_000;

export const createMenfessRelay = (options = {}) => {
	const {
		aliasPrefix = 'Anon',
		sessionTtlMs = DEFAULT_TTL_MS,
		stopWords = ['stop', 'udahan'],
		header = '💌',
		now = () => Date.now()
	} = options;

	/** sessionId -> { id, a, b, aliasA, aliasB, startedAt, lastActiveAt } */
	const sessions = new Map();
	/** userJid -> sessionId */
	const byUser = new Map();
	let nextAlias = 1;
	let nextSession = 1;
	const relayedCbs = new Set();
	const endedCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break relaying
			}
		}
	};

	const stops = new Set(stopWords.map(w => w.toLowerCase()));

	const endSession = (session, reason) => {
		sessions.delete(session.id);
		byUser.delete(session.a);
		byUser.delete(session.b);
		emit(endedCbs, { session, reason });
	};

	/**
	 * Start a session and deliver the first message. Returns the session.
	 * Throws when either side is already in an active session.
	 */
	const start = async (sock, fromJid, toJid, firstText = '') => {
		if (fromJid === toJid) {
			throw new Error('cannot menfess yourself');
		}
		if (byUser.has(fromJid)) {
			throw new Error('sender already has an active menfess session');
		}
		if (byUser.has(toJid)) {
			throw new Error('target is busy in another menfess session');
		}
		const session = {
			id: nextSession++,
			a: fromJid,
			b: toJid,
			aliasA: `${aliasPrefix}-${nextAlias++}`,
			aliasB: `${aliasPrefix}-${nextAlias++}`,
			startedAt: now(),
			lastActiveAt: now()
		};
		sessions.set(session.id, session);
		byUser.set(fromJid, session.id);
		byUser.set(toJid, session.id);
		if (firstText) {
			await sock.sendMessage(toJid, {
				text: `${header} *Menfess from ${session.aliasA}*\n\n${firstText}\n\n_Reply here to answer anonymously. Send "${stopWords[0]}" to end._`
			});
			emit(relayedCbs, { session, direction: 'a->b', from: fromJid, to: toJid, text: firstText });
		}
		return session;
	};

	/** Handler for `messages.upsert` — relays DMs between session parties. */
	const handler = async ({ messages }, sock = boundSock) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe) {
				continue;
			}
			if (chat.endsWith('@g.us') || chat === 'status@broadcast') {
				continue; // sessions live in DMs only
			}
			const sessionId = byUser.get(chat);
			if (!sessionId) {
				continue;
			}
			const session = sessions.get(sessionId);
			if (!session) {
				byUser.delete(chat);
				continue;
			}
			if (sessionTtlMs && now() - session.lastActiveAt > sessionTtlMs) {
				endSession(session, 'expired');
				continue;
			}
			const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
			if (!text) {
				continue;
			}
			if (stops.has(text.trim().toLowerCase())) {
				endSession(session, 'stopped');
				if (sock) {
					const other = chat === session.a ? session.b : session.a;
					await sock.sendMessage(other, { text: `${header} _Menfess session ended._` }).catch(() => { });
				}
				continue;
			}
			session.lastActiveAt = now();
			const fromA = chat === session.a;
			const to = fromA ? session.b : session.a;
			const alias = fromA ? session.aliasA : session.aliasB;
			if (sock) {
				try {
					await sock.sendMessage(to, { text: `${header} *${alias}:* ${text}` });
					emit(relayedCbs, { session, direction: fromA ? 'a->b' : 'b->a', from: chat, to, text });
				} catch (error) {
					emit(endedCbs, { session, reason: 'error', error });
				}
			}
		}
	};

	return {
		start,
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = (events) => {
				handler(events, sock).catch(() => { });
			};
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
		onRelayed(cb) {
			relayedCbs.add(cb);
			return () => relayedCbs.delete(cb);
		},
		onEnded(cb) {
			endedCbs.add(cb);
			return () => endedCbs.delete(cb);
		},
		getSession: (userJid) => {
			const id = byUser.get(userJid);
			return id ? sessions.get(id) || null : null;
		},
		isInSession: (userJid) => byUser.has(userJid),
		end(sessionId, reason = 'manual') {
			const session = sessions.get(sessionId);
			if (!session) {
				return false;
			}
			endSession(session, reason);
			return true;
		},
		get size() {
			return sessions.size;
		},
		clear() {
			sessions.clear();
			byUser.clear();
		}
	};
};
