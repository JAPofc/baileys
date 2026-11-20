/**
 * Guess game engine — run "tebak-tebakan" rounds in any chat: set an answer,
 * players guess by chatting, first correct answer wins (optionally a reward).
 *
 * ```js
 * import { createGuessGame, createEconomy } from '@japofc/baileys'
 *
 * const game = createGuessGame({ timeoutMs: 60_000 })
 * game.bind(sock)
 *
 * // e.g. inside your !tebakangka command:
 * game.start(chat, { answer: '42', hint: 'the answer to everything', reward: 500 })
 *
 * game.onCorrect(({ chat, user, reward, attempts }) => {
 *     eco.add(user, reward, 'guess game win')
 *     sock.sendMessage(chat, { text: `🎉 @${user.split('@')[0]} got it! +${reward}`, mentions: [user] })
 * })
 * game.onTimeout(({ chat, answer }) =>
 *     sock.sendMessage(chat, { text: `⏰ Time's up! The answer was *${answer}*` }))
 * ```
 *
 * One round per chat; answers are matched case-insensitively (configurable).
 */

import { levenshtein } from './text-extras.js';

export const createGuessGame = (options = {}) => {
	const {
		timeoutMs = 60_000,
		caseSensitive = false,
		trim = true,
		/** JAP@Upgrade: wrong guesses within this edit distance get close: true. */
		closeDistance = 2,
		now = () => Date.now()
	} = options;

	/** chat -> { answer, matchAnswer, hint, reward, attempts, startedAt, deadline, startedBy, timer } */
	const rounds = new Map();
	const cbs = { correct: new Set(), wrong: new Set(), timeout: new Set() };
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the game loop
			}
		}
	};

	const normalize = (text) => {
		let t = String(text ?? '');
		if (trim) {
			t = t.trim();
		}
		return caseSensitive ? t : t.toLowerCase();
	};

	const clearRound = (chat) => {
		const round = rounds.get(chat);
		if (round?.timer) {
			clearTimeout(round.timer);
		}
		rounds.delete(chat);
		return round;
	};

	/** Start a round in a chat. Throws if one is already running there. */
	const start = (chat, { answer, hint = '', reward = 0, timeoutMs: roundTimeout = timeoutMs, startedBy } = {}) => {
		if (!chat || answer === undefined || answer === null || String(answer) === '') {
			throw new Error('start(chat, { answer }) requires a chat and a non-empty answer');
		}
		if (rounds.has(chat)) {
			throw new Error('a round is already running in this chat');
		}
		const round = {
			answer: String(answer),
			matchAnswer: normalize(answer),
			hint,
			reward,
			attempts: 0,
			startedAt: now(),
			deadline: roundTimeout ? now() + roundTimeout : 0,
			startedBy,
			timer: null
		};
		if (roundTimeout) {
			round.timer = setTimeout(() => {
				clearRound(chat);
				emit(cbs.timeout, { chat, answer: round.answer, hint, attempts: round.attempts });
			}, roundTimeout);
			if (round.timer.unref) {
				round.timer.unref();
			}
		}
		rounds.set(chat, round);
		return { chat, hint, reward, deadline: round.deadline };
	};

	/**
	 * JAP@Upgrade: progressive hint — reveals a few more of the answer's
	 * letters each call ('j_k__t_'). Returns the mask, or null.
	 */
	const revealHint = (chat, { fraction = 0.25 } = {}) => {
		const round = rounds.get(chat);
		if (!round) {
			return null;
		}
		const answer = round.answer;
		if (!round.revealed) {
			round.revealed = new Set();
		}
		const positions = [...answer].map((c, i) => (c === ' ' ? null : i)).filter(i => i !== null);
		const target = Math.min(positions.length - 1, round.revealed.size + Math.max(1, Math.round(positions.length * fraction)));
		const hidden = positions.filter(i => !round.revealed.has(i));
		while (round.revealed.size < target && hidden.length) {
			const pick = hidden.splice(Math.floor(Math.random() * hidden.length), 1)[0];
			round.revealed.add(pick);
		}
		return [...answer].map((c, i) => (c === ' ' ? ' ' : round.revealed.has(i) ? c : '_')).join('');
	};

	/** Submit a guess directly. Returns 'correct' | 'wrong' | null (no round). */
	const guess = (chat, user, text, msg) => {
		const round = rounds.get(chat);
		if (!round) {
			return null;
		}
		round.attempts++;
		if (normalize(text) === round.matchAnswer) {
			clearRound(chat);
			emit(cbs.correct, {
				chat,
				user,
				answer: round.answer,
				reward: round.reward,
				attempts: round.attempts,
				elapsedMs: now() - round.startedAt,
				msg
			});
			return 'correct';
		}
		const distance = levenshtein(normalize(text), round.matchAnswer);
		emit(cbs.wrong, { chat, user, text, attempts: round.attempts, close: closeDistance > 0 && distance <= closeDistance, distance, msg });
		return 'wrong';
	};

	/** Handler for `messages.upsert` — every text in an active chat is a guess. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || !rounds.has(chat)) {
				continue;
			}
			const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
			if (!text) {
				continue;
			}
			guess(chat, msg.key.participant || chat, text, msg);
		}
	};

	return {
		start,
		revealHint,
		/**
		 * JAP@Upgrade: shortcut for a number-guessing round — picks a random
		 * number in [min, max] and builds the hint for you.
		 */
		startNumberGame(chat, { min = 1, max = 100, reward = 0, timeoutMs: t, random = Math.random, startedBy } = {}) {
			const answer = min + Math.floor(random() * (max - min + 1));
			return start(chat, {
				answer: String(answer),
				hint: `a number between ${min} and ${max}`,
				reward,
				...(t !== undefined ? { timeoutMs: t } : {}),
				startedBy
			});
		},
		guess,
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
		onCorrect(cb) {
			cbs.correct.add(cb);
			return () => cbs.correct.delete(cb);
		},
		onWrong(cb) {
			cbs.wrong.add(cb);
			return () => cbs.wrong.delete(cb);
		},
		onTimeout(cb) {
			cbs.timeout.add(cb);
			return () => cbs.timeout.delete(cb);
		},
		isActive: (chat) => rounds.has(chat),
		getRound(chat) {
			const round = rounds.get(chat);
			if (!round) {
				return null;
			}
			const { timer, matchAnswer, answer, ...safe } = round;
			return safe; // answer withheld — hint/attempts/deadline only
		},
		/** End a round without a winner. Returns the answer, or null. */
		end(chat) {
			const round = clearRound(chat);
			return round ? round.answer : null;
		},
		get size() {
			return rounds.size;
		},
		clear() {
			for (const chat of [...rounds.keys()]) {
				clearRound(chat);
			}
		}
	};
};
