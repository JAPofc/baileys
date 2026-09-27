/**
 * Giveaway — run raffles in a chat: open entries, people join with a
 * keyword, winners drawn fairly at the deadline.
 *
 * ```js
 * import { createGiveaway } from '@japofc/baileys'
 *
 * const giveaway = createGiveaway({ keyword: 'ikut' })
 * giveaway.bind(sock) // entries collected from normal chat messages
 *
 * giveaway.start(chat, { prize: 'Saldo 50k', durationMs: 60 * 60_000, winners: 2 })
 * giveaway.onJoin(({ user, entries }) => console.log(user, 'joined —', entries, 'total'))
 * giveaway.onEnd(({ prize, winners, entries }) =>
 *     sock.sendMessage(chat, {
 *         text: `🎉 ${prize} — winners: ${winners.map(w => '@' + w.split('@')[0]).join(', ')}`,
 *         mentions: winners
 *     }))
 *
 * giveaway.render(chat)      // status card
 * giveaway.end(chat)         // draw early
 * ```
 *
 * One giveaway per chat; each user enters once; the draw uses an
 * injectable RNG for provable fairness.
 */

export const createGiveaway = (options = {}) => {
	const {
		keyword = 'join',
		/** JAP@Upgrade: entry requirement — (user, chat) => true | string reason. */
		canJoin,
		random = Math.random,
		now = () => Date.now()
	} = options;

	/** chat -> { prize, winners, entries:Set, startedAt, endsAt, timer, startedBy } */
	const rounds = new Map();
	const cbs = { join: new Set(), end: new Set(), denied: new Set() };
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the giveaway
			}
		}
	};

	const draw = (chat, reason) => {
		const round = rounds.get(chat);
		if (!round) {
			return null;
		}
		if (round.timer) {
			clearTimeout(round.timer);
		}
		rounds.delete(chat);
		const pool = [...round.entries];
		const winners = [];
		while (winners.length < round.winners && pool.length) {
			winners.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
		}
		const result = {
			chat,
			prize: round.prize,
			winners,
			entries: round.entries.size,
			reason,
			startedBy: round.startedBy
		};
		emit(cbs.end, result);
		return result;
	};

	/** Handler for `messages.upsert` — keyword texts enter the raffle. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || !rounds.has(chat)) {
				continue;
			}
			const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();
			if (text !== keyword.toLowerCase()) {
				continue;
			}
			const round = rounds.get(chat);
			const user = msg.key.participant || chat;
			if (round.entries.has(user)) {
				continue; // one entry each
			}
			if (canJoin) {
				let verdict = true;
				try {
					verdict = canJoin(user, chat);
				} catch {
					verdict = 'error';
				}
				if (verdict !== true) {
					emit(cbs.denied, { chat, user, reason: typeof verdict === 'string' ? verdict : 'not-eligible', msg });
					continue;
				}
			}
			round.entries.add(user);
			emit(cbs.join, { chat, user, entries: round.entries.size, msg });
		}
	};

	return {
		handler,
		/** Open a giveaway in a chat. Throws when one is already running. */
		start(chat, { prize = '🎁', durationMs = 60 * 60_000, winners = 1, startedBy } = {}) {
			if (rounds.has(chat)) {
				throw new Error('a giveaway is already running in this chat');
			}
			if (!Number.isInteger(winners) || winners < 1) {
				throw new Error('winners must be a positive integer');
			}
			const round = {
				prize,
				winners,
				entries: new Set(),
				startedAt: now(),
				endsAt: durationMs ? now() + durationMs : 0,
				startedBy,
				timer: null
			};
			if (durationMs) {
				round.timer = setTimeout(() => draw(chat, 'deadline'), durationMs);
				if (round.timer.unref) {
					round.timer.unref();
				}
			}
			rounds.set(chat, round);
			return { chat, prize, winners, endsAt: round.endsAt, keyword };
		},
		/** Draw winners now. Returns the result, or null when nothing runs. */
		end(chat) {
			return draw(chat, 'manual');
		},
		/** Cancel without drawing (no onEnd). */
		cancel(chat) {
			const round = rounds.get(chat);
			if (!round) {
				return false;
			}
			if (round.timer) {
				clearTimeout(round.timer);
			}
			rounds.delete(chat);
			return true;
		},
		/** Manually enter a user (e.g. reaction-based joining). */
		enter(chat, user) {
			const round = rounds.get(chat);
			if (!round || round.entries.has(user)) {
				return false;
			}
			round.entries.add(user);
			emit(cbs.join, { chat, user, entries: round.entries.size });
			return true;
		},
		isActive: (chat) => rounds.has(chat),
		getEntries: (chat) => [...(rounds.get(chat)?.entries ?? [])],
		/** Ready-to-send status card. */
		render(chat) {
			const round = rounds.get(chat);
			if (!round) {
				return null;
			}
			const remaining = round.endsAt ? Math.max(0, round.endsAt - now()) : null;
			return [
				`🎁 *GIVEAWAY: ${round.prize}*`,
				`Type *${keyword}* to enter`,
				`Entries: ${round.entries.size} · Winners: ${round.winners}`,
				remaining !== null ? `Ends in: ${Math.ceil(remaining / 60_000)} min` : 'No deadline'
			].join('\n');
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
		onJoin(cb) {
			cbs.join.add(cb);
			return () => cbs.join.delete(cb);
		},
		onEnd(cb) {
			cbs.end.add(cb);
			return () => cbs.end.delete(cb);
		},
		/** JAP@Upgrade: fires when canJoin rejects an entry. */
		onDenied(cb) {
			cbs.denied.add(cb);
			return () => cbs.denied.delete(cb);
		},
		get size() {
			return rounds.size;
		}
	};
};
