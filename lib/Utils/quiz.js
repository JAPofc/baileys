/**
 * Quiz session — multi-question rounds with running scores: the "cerdas
 * cermat" engine (pairs perfectly with generateMathProblem / scrambleWord).
 *
 * ```js
 * import { createQuizSession, generateMathProblem } from '@japofc/baileys'
 *
 * const quiz = createQuizSession({ perQuestionMs: 30_000 })
 * quiz.bind(sock)
 *
 * quiz.start(chat, [
 *     { question: 'Ibukota Jepang?', answer: 'tokyo', points: 10 },
 *     generateMathProblem('medium'),
 *     { question: 'Lawan kata dingin?', answer: 'panas' }
 * ])
 * quiz.onQuestion(({ index, total, question }) =>
 *     sock.sendMessage(chat, { text: `Soal ${index}/${total}:\n${question}` }))
 * quiz.onCorrect(({ user, points, scores }) => react('✅'))
 * quiz.onEnd(({ ranking }) => announce(ranking))    // sorted best-first
 *
 * quiz.skip(chat)   // host skips a stuck question (reveals the answer)
 * ```
 */

export const createQuizSession = (options = {}) => {
	const {
		perQuestionMs = 30_000,
		caseSensitive = false,
		now = () => Date.now()
	} = options;

	/** chat -> { questions, index, scores:Map, timer, startedAt, deadline } */
	const sessions = new Map();
	const cbs = { question: new Set(), correct: new Set(), timeout: new Set(), end: new Set() };
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the quiz
			}
		}
	};

	const norm = (s) => {
		const t = String(s ?? '').trim();
		return caseSensitive ? t : t.toLowerCase();
	};

	const finish = (chat, reason) => {
		const session = sessions.get(chat);
		if (!session) {
			return null;
		}
		if (session.timer) {
			clearTimeout(session.timer);
		}
		sessions.delete(chat);
		const ranking = [...session.scores]
			.map(([user, score]) => ({ user, score }))
			.sort((a, b) => b.score - a.score);
		const result = {
			chat,
			ranking,
			winner: ranking[0]?.score > 0 ? ranking[0] : null,
			questionsAsked: session.index,
			total: session.questions.length,
			reason
		};
		emit(cbs.end, result);
		return result;
	};

	const askNext = (chat) => {
		const session = sessions.get(chat);
		if (!session) {
			return;
		}
		if (session.timer) {
			clearTimeout(session.timer);
			session.timer = null;
		}
		if (session.index >= session.questions.length) {
			finish(chat, 'completed');
			return;
		}
		const q = session.questions[session.index];
		session.index++;
		session.deadline = perQuestionMs ? now() + perQuestionMs : 0;
		emit(cbs.question, {
			chat,
			index: session.index,
			total: session.questions.length,
			question: q.question,
			points: q.points ?? 10,
			deadline: session.deadline
		});
		if (perQuestionMs) {
			session.timer = setTimeout(() => {
				emit(cbs.timeout, { chat, index: session.index, question: q.question, answer: q.answer });
				askNext(chat);
			}, perQuestionMs);
			if (session.timer.unref) {
				session.timer.unref();
			}
		}
	};

	/** Submit an answer directly. 'correct' | 'wrong' | null (no session). */
	const answer = (chat, user, text) => {
		const session = sessions.get(chat);
		if (!session || session.index === 0 || session.index > session.questions.length) {
			return null;
		}
		const q = session.questions[session.index - 1];
		if (norm(text) !== norm(q.answer)) {
			return 'wrong';
		}
		const points = q.points ?? 10;
		session.scores.set(user, (session.scores.get(user) || 0) + points);
		emit(cbs.correct, {
			chat,
			user,
			points,
			answer: q.answer,
			index: session.index,
			scores: [...session.scores].map(([u, s]) => ({ user: u, score: s })).sort((a, b) => b.score - a.score)
		});
		askNext(chat);
		return 'correct';
	};

	/** Handler for `messages.upsert` — texts in a live quiz chat are answers. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || !sessions.has(chat)) {
				continue;
			}
			const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
			if (text) {
				answer(chat, msg.key.participant || chat, text);
			}
		}
	};

	return {
		handler,
		answer,
		/** Start a session: questions `[{ question, answer, points? }]`. */
		start(chat, questions, { shuffle = false, random = Math.random } = {}) {
			if (sessions.has(chat)) {
				throw new Error('a quiz is already running in this chat');
			}
			const list = (questions || []).filter(q => q && q.question && q.answer !== undefined);
			if (!list.length) {
				throw new Error('start(chat, questions[]) needs at least one { question, answer }');
			}
			const prepared = list.map(q => ({ ...q }));
			if (shuffle) {
				for (let i = prepared.length - 1; i > 0; i--) {
					const j = Math.floor(random() * (i + 1));
					[prepared[i], prepared[j]] = [prepared[j], prepared[i]];
				}
			}
			sessions.set(chat, {
				questions: prepared,
				index: 0,
				scores: new Map(),
				timer: null,
				startedAt: now(),
				deadline: 0
			});
			askNext(chat);
			return { chat, total: list.length };
		},
		/** Skip the current question (reveals the answer via onTimeout). */
		skip(chat) {
			const session = sessions.get(chat);
			if (!session || session.index === 0) {
				return false;
			}
			const q = session.questions[session.index - 1];
			emit(cbs.timeout, { chat, index: session.index, question: q.question, answer: q.answer, skipped: true });
			askNext(chat);
			return true;
		},
		/** End early. Returns the final ranking. */
		end(chat) {
			return finish(chat, 'manual');
		},
		isActive: (chat) => sessions.has(chat),
		getScores(chat) {
			const session = sessions.get(chat);
			if (!session) {
				return null;
			}
			return [...session.scores].map(([user, score]) => ({ user, score })).sort((a, b) => b.score - a.score);
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
		onQuestion(cb) {
			cbs.question.add(cb);
			return () => cbs.question.delete(cb);
		},
		onCorrect(cb) {
			cbs.correct.add(cb);
			return () => cbs.correct.delete(cb);
		},
		/** Fires on per-question timeouts AND host skips (skipped: true). */
		onTimeout(cb) {
			cbs.timeout.add(cb);
			return () => cbs.timeout.delete(cb);
		},
		onEnd(cb) {
			cbs.end.add(cb);
			return () => cbs.end.delete(cb);
		},
		get size() {
			return sessions.size;
		}
	};
};
