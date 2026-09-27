/**
 * Text poll — number-voting polls that work in every chat and every
 * client (no protocol poll decryption involved): "vote by replying 1-4".
 *
 * ```js
 * import { createTextPoll } from '@japofc/baileys'
 *
 * const polls = createTextPoll()
 * polls.bind(sock) // votes collected from plain "1".."9" messages
 *
 * polls.start(chat, {
 *     question: 'Mabar jam berapa?',
 *     options: ['19:00', '20:00', '21:00'],
 *     durationMs: 30 * 60_000
 * })
 * await sock.sendMessage(chat, { text: polls.render(chat) })
 *
 * polls.onVote(({ user, option }) => console.log(user, 'voted', option))
 * polls.onEnd(({ results, winner }) => sock.sendMessage(chat, { text: polls.formatResults(results) }))
 * ```
 *
 * One vote per user (revoting switches it). Results include counts,
 * percentages and a text bar chart.
 */
import { progressBar } from './text-extras.js';

export const createTextPoll = (options = {}) => {
	const { now = () => Date.now(), allowRevote = true } = options;

	/** chat -> { question, options[], votes: Map(user -> index), endsAt, timer } */
	const polls = new Map();
	const cbs = { vote: new Set(), end: new Set() };
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break voting
			}
		}
	};

	const tally = (poll) => {
		const counts = poll.options.map(() => 0);
		for (const index of poll.votes.values()) {
			counts[index]++;
		}
		const total = poll.votes.size;
		return poll.options.map((option, i) => ({
			index: i + 1,
			option,
			votes: counts[i],
			percent: total ? Math.round((counts[i] / total) * 100) : 0
		}));
	};

	const finish = (chat, reason) => {
		const poll = polls.get(chat);
		if (!poll) {
			return null;
		}
		if (poll.timer) {
			clearTimeout(poll.timer);
		}
		polls.delete(chat);
		const results = tally(poll);
		const top = [...results].sort((a, b) => b.votes - a.votes);
		const winner = top.length && top[0].votes > 0 && (top.length < 2 || top[0].votes > top[1].votes)
			? top[0]
			: null; // null on ties/no votes
		const result = { chat, question: poll.question, results, winner, totalVotes: poll.votes.size, reason };
		emit(cbs.end, result);
		return result;
	};

	/** Record a vote by option number (1-based). */
	const vote = (chat, user, optionNumber) => {
		const poll = polls.get(chat);
		if (!poll) {
			return null;
		}
		const index = optionNumber - 1;
		if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
			return 'invalid';
		}
		const previous = poll.votes.get(user);
		if (previous !== undefined && !allowRevote) {
			return 'already-voted';
		}
		if (previous === index) {
			return 'unchanged';
		}
		poll.votes.set(user, index);
		emit(cbs.vote, { chat, user, option: poll.options[index], index: optionNumber, changed: previous !== undefined });
		return 'ok';
	};

	/** Handler for `messages.upsert` — bare numbers count as votes. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe || !polls.has(chat)) {
				continue;
			}
			const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
			if (/^\d{1,2}$/.test(text)) {
				vote(chat, msg.key.participant || chat, parseInt(text, 10));
			}
		}
	};

	return {
		handler,
		vote,
		/** Open a poll (throws if one is already running in the chat). */
		start(chat, { question, options: choices, durationMs = 0, startedBy } = {}) {
			if (polls.has(chat)) {
				throw new Error('a poll is already running in this chat');
			}
			if (!question || !Array.isArray(choices) || choices.length < 2 || choices.length > 20) {
				throw new Error('poll needs { question, options: [2..20 choices] }');
			}
			const poll = {
				question,
				options: choices.map(String),
				votes: new Map(),
				startedAt: now(),
				endsAt: durationMs ? now() + durationMs : 0,
				startedBy,
				timer: null
			};
			if (durationMs) {
				poll.timer = setTimeout(() => finish(chat, 'deadline'), durationMs);
				if (poll.timer.unref) {
					poll.timer.unref();
				}
			}
			polls.set(chat, poll);
			return { chat, question, options: poll.options, endsAt: poll.endsAt };
		},
		end(chat) {
			return finish(chat, 'manual');
		},
		isActive: (chat) => polls.has(chat),
		getResults(chat) {
			const poll = polls.get(chat);
			return poll ? { question: poll.question, results: tally(poll), totalVotes: poll.votes.size } : null;
		},
		/** Ready-to-send ballot card ("vote by number"). */
		render(chat) {
			const poll = polls.get(chat);
			if (!poll) {
				return null;
			}
			return [
				`📊 *${poll.question}*`,
				...poll.options.map((option, i) => `${i + 1}. ${option}`),
				'',
				'_Balas dengan angka untuk memilih_'
			].join('\n');
		},
		/** Results with text bar charts. */
		formatResults(results) {
			const list = Array.isArray(results) ? results : results?.results || [];
			if (!list.length) {
				return '(no results)';
			}
			return list
				.map(r => `${r.option}\n${progressBar(r.percent, 100, { size: 10 })} (${r.votes})`)
				.join('\n');
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
		onVote(cb) {
			cbs.vote.add(cb);
			return () => cbs.vote.delete(cb);
		},
		onEnd(cb) {
			cbs.end.add(cb);
			return () => cbs.end.delete(cb);
		},
		get size() {
			return polls.size;
		}
	};
};
