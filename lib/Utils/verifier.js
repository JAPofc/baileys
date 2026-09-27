/**
 * Member verifier — captcha-gate new group members: they get a challenge on
 * join and you get a callback to kick them when they fail or stay silent.
 *
 * ```js
 * import { createVerifier } from '@japofc/baileys'
 *
 * const verifier = createVerifier({ timeoutMs: 120_000 })
 * verifier.bind(sock) // auto-challenges on group-participants.update 'add'
 *
 * verifier.onChallenge(({ chat, user, question }) =>
 *     sock.sendMessage(chat, {
 *         text: `👋 @${user.split('@')[0]} verify yourself: ${question}`,
 *         mentions: [user]
 *     }))
 * verifier.onVerified(({ chat, user }) =>
 *     sock.sendMessage(chat, { text: `✅ @${user.split('@')[0]} verified!`, mentions: [user] }))
 * verifier.onFailed(async ({ chat, user, reason }) => {
 *     await sock.groupParticipantsUpdate(chat, [user], 'remove') // timeout | attempts
 * })
 * ```
 *
 * The default challenge is simple math; plug your own with
 * `generateChallenge: () => ({ question, answer })`.
 */

/** Built-in math captcha: "3 + 5 = ?" → "8". */
export const mathChallenge = () => {
	const a = 1 + Math.floor(Math.random() * 9);
	const b = 1 + Math.floor(Math.random() * 9);
	return { question: `${a} + ${b} = ?`, answer: String(a + b) };
};

const EMOJI_POOL = ['🍎', '🐱', '🚗', '🌙', '⚽', '🎸', '🍕', '🐘', '🌸', '🔥'];

/** Built-in emoji captcha: "type this emoji: 🔥" → "🔥". */
export const emojiChallenge = () => {
	const target = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
	return { question: `type this emoji: ${target}`, answer: target };
};

const CHALLENGE_PRESETS = { math: mathChallenge, emoji: emojiChallenge };
const defaultChallenge = mathChallenge;

export const createVerifier = (options = {}) => {
	const {
		timeoutMs = 120_000,
		maxAttempts = 3,
		autoChallenge = true,
		challenge: challengePreset,
		generateChallenge = CHALLENGE_PRESETS[challengePreset] || defaultChallenge,
		groups
	} = options;

	const watchedGroups = groups ? new Set(groups) : null;
	/** `${chat}:${user}` -> { user, chat, question, answer, attempts, deadline, timer } */
	const pending = new Map();
	const cbs = { challenge: new Set(), verified: new Set(), failed: new Set() };
	let boundSock = null;
	let onParticipants = null;
	let onUpsert = null;

	const keyOf = (user, chat) => `${chat}:${user}`;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break event handling
			}
		}
	};

	const clearEntry = (entry) => {
		if (entry.timer) {
			clearTimeout(entry.timer);
		}
		pending.delete(keyOf(entry.user, entry.chat));
	};

	const fail = (entry, reason) => {
		clearEntry(entry);
		emit(cbs.failed, { user: entry.user, chat: entry.chat, reason, attempts: entry.attempts });
	};

	/** Issue a challenge manually. Returns the pending entry. */
	const challenge = (user, chat) => {
		const existing = pending.get(keyOf(user, chat));
		if (existing) {
			clearEntry(existing);
		}
		const { question, answer } = generateChallenge({ user, chat });
		const entry = {
			user,
			chat,
			question,
			answer: String(answer),
			attempts: 0,
			deadline: Date.now() + timeoutMs,
			timer: null
		};
		if (timeoutMs) {
			entry.timer = setTimeout(() => fail(entry, 'timeout'), timeoutMs);
			if (entry.timer.unref) {
				entry.timer.unref();
			}
		}
		pending.set(keyOf(user, chat), entry);
		emit(cbs.challenge, { user, chat, question, deadline: entry.deadline });
		return entry;
	};

	/**
	 * Check an answer. Returns 'verified' | 'wrong' | 'failed' | null
	 * (null = no pending challenge for this user).
	 */
	const verify = (user, chat, answer) => {
		const entry = pending.get(keyOf(user, chat));
		if (!entry) {
			return null;
		}
		if (String(answer).trim() === entry.answer) {
			clearEntry(entry);
			emit(cbs.verified, { user, chat, attempts: entry.attempts + 1 });
			return 'verified';
		}
		entry.attempts++;
		if (entry.attempts >= maxAttempts) {
			fail(entry, 'attempts');
			return 'failed';
		}
		return 'wrong';
	};

	/** Handler for `group-participants.update` — challenges new members. */
	const participantsHandler = (update) => {
		if (!autoChallenge || update?.action !== 'add' || !update.id) {
			return;
		}
		if (watchedGroups && !watchedGroups.has(update.id)) {
			return;
		}
		for (const user of update.participants || []) {
			challenge(user, update.id);
		}
	};

	/** Handler for `messages.upsert` — treats messages from pending users as answers. */
	const upsertHandler = ({ messages }) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe) {
				continue;
			}
			const user = msg.key.participant || chat;
			if (!pending.has(keyOf(user, chat))) {
				continue;
			}
			const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
			if (text) {
				verify(user, chat, text);
			}
		}
	};

	return {
		challenge,
		verify,
		participantsHandler,
		upsertHandler,
		bind(sock) {
			boundSock = sock;
			onParticipants = participantsHandler;
			onUpsert = upsertHandler;
			sock.ev.on('group-participants.update', onParticipants);
			sock.ev.on('messages.upsert', onUpsert);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock) {
				boundSock.ev.off('group-participants.update', onParticipants);
				boundSock.ev.off('messages.upsert', onUpsert);
			}
			boundSock = null;
			onParticipants = null;
			onUpsert = null;
		},
		onChallenge(cb) {
			cbs.challenge.add(cb);
			return () => cbs.challenge.delete(cb);
		},
		onVerified(cb) {
			cbs.verified.add(cb);
			return () => cbs.verified.delete(cb);
		},
		/** reason: 'timeout' | 'attempts' */
		onFailed(cb) {
			cbs.failed.add(cb);
			return () => cbs.failed.delete(cb);
		},
		isPending: (user, chat) => pending.has(keyOf(user, chat)),
		getPending: () => [...pending.values()].map(({ timer, ...rest }) => rest),
		/** Cancel a pending challenge without failing it. */
		cancel(user, chat) {
			const entry = pending.get(keyOf(user, chat));
			if (entry) {
				clearEntry(entry);
				return true;
			}
			return false;
		},
		get size() {
			return pending.size;
		},
		clear() {
			for (const entry of pending.values()) {
				if (entry.timer) {
					clearTimeout(entry.timer);
				}
			}
			pending.clear();
		}
	};
};
