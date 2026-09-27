/**
 * Conversation flows — multi-step wizards per user ("what's your name? →
 * how many? → confirm"): registration forms, order taking, setup dialogs.
 *
 * ```js
 * import { createConversationFlow } from '@japofc/baileys'
 *
 * const flows = createConversationFlow({ timeoutMs: 5 * 60_000 })
 * flows.define('order', [
 *     { id: 'item', prompt: 'What would you like to order?' },
 *     { id: 'qty', prompt: 'How many?', validate: t => /^\d+$/.test(t) || 'Numbers only!' },
 *     { id: 'confirm', prompt: a => `${a.qty}x ${a.item} — type "yes" to confirm` }
 * ])
 * flows.bind(sock) // answers arrive via normal chat messages
 *
 * // e.g. inside your !order command:
 * await flows.start(sock, chat, sender, 'order')
 *
 * flows.onComplete(({ answers, chat }) =>
 *     sock.sendMessage(chat, { text: `Order placed: ${answers.qty}x ${answers.item}` }))
 * flows.onCancel(({ reason }) => console.log('flow ended:', reason))
 * ```
 *
 * One active flow per (chat, user). "cancel"/"batal" aborts; silence past
 * the timeout aborts too. Validation errors re-prompt without advancing.
 */

const DEFAULT_CANCEL_WORDS = ['cancel', 'batal'];

export const createConversationFlow = (options = {}) => {
	const {
		timeoutMs = 5 * 60_000,
		cancelWords = DEFAULT_CANCEL_WORDS,
		now = () => Date.now()
	} = options;

	/** flowName -> steps[] */
	const flows = new Map();
	/** `${chat}:${user}` -> session { flow, stepIndex, answers, startedAt, lastActiveAt, timer, chat, user } */
	const sessions = new Map();
	const cbs = { step: new Set(), complete: new Set(), cancel: new Set() };
	const cancels = new Set(cancelWords.map(w => w.toLowerCase()));
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the flow engine
			}
		}
	};

	const keyOf = (chat, user) => `${chat}:${user}`;

	const clearSession = (session) => {
		if (session.timer) {
			clearTimeout(session.timer);
		}
		sessions.delete(keyOf(session.chat, session.user));
	};

	const armTimeout = (session) => {
		if (session.timer) {
			clearTimeout(session.timer);
		}
		if (!timeoutMs) {
			return;
		}
		session.timer = setTimeout(() => {
			clearSession(session);
			emit(cbs.cancel, { chat: session.chat, user: session.user, flow: session.flowName, reason: 'timeout', answers: { ...session.answers } });
		}, timeoutMs);
		if (session.timer.unref) {
			session.timer.unref();
		}
	};

	const promptOf = (step, answers) => {
		const base = typeof step.prompt === 'function' ? step.prompt(answers) : (step.prompt ?? '');
		// JAP@Upgrade: steps with `choices` render a numbered option list.
		if (Array.isArray(step.choices) && step.choices.length) {
			const list = step.choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
			return base ? `${base}\n${list}` : list;
		}
		return base;
	};

	const sendPrompt = async (sock, session) => {
		const step = session.flow[session.stepIndex];
		const prompt = promptOf(step, session.answers);
		emit(cbs.step, { chat: session.chat, user: session.user, flow: session.flowName, step: step.id, prompt });
		if (sock && prompt) {
			await sock.sendMessage(session.chat, { text: prompt }).catch(() => { });
		}
	};

	/** Feed one answer into a session. Used internally by the bound handler. */
	const answer = async (chat, user, text, sock = boundSock) => {
		const session = sessions.get(keyOf(chat, user));
		if (!session) {
			return null;
		}
		const clean = String(text).trim();
		if (cancels.has(clean.toLowerCase())) {
			clearSession(session);
			emit(cbs.cancel, { chat, user, flow: session.flowName, reason: 'cancelled', answers: { ...session.answers } });
			return 'cancelled';
		}
		const step = session.flow[session.stepIndex];
		// JAP@Upgrade: `choices` steps accept the option text (case
		// insensitive) OR its 1-based number, and store the canonical text.
		if (Array.isArray(step.choices) && step.choices.length) {
			const lower = clean.toLowerCase();
			let picked = step.choices.find(c => String(c).toLowerCase() === lower);
			if (!picked && /^\d{1,2}$/.test(clean)) {
				picked = step.choices[parseInt(clean, 10) - 1];
			}
			if (picked === undefined) {
				if (sock) {
					await sock.sendMessage(chat, { text: `Pilih salah satu: ${step.choices.join(' / ')} (atau balas angkanya)` }).catch(() => { });
				}
				armTimeout(session);
				return 'invalid';
			}
			session.answers[step.id] = picked;
			session.lastActiveAt = now();
			session.stepIndex++;
			if (session.stepIndex >= session.flow.length) {
				clearSession(session);
				emit(cbs.complete, { chat, user, flow: session.flowName, answers: { ...session.answers } });
				return 'complete';
			}
			armTimeout(session);
			await sendPrompt(sock, session);
			return 'next';
		}
		if (step.validate) {
			let verdict;
			try {
				verdict = await step.validate(clean, { ...session.answers });
			} catch (err) {
				verdict = err?.message || 'invalid input';
			}
			if (verdict !== true && verdict !== undefined) {
				const message = typeof verdict === 'string' ? verdict : 'Invalid input, try again.';
				if (sock) {
					await sock.sendMessage(chat, { text: message }).catch(() => { });
				}
				armTimeout(session);
				return 'invalid';
			}
		}
		session.answers[step.id] = step.parse ? step.parse(clean) : clean;
		session.lastActiveAt = now();
		session.stepIndex++;
		if (session.stepIndex >= session.flow.length) {
			clearSession(session);
			emit(cbs.complete, { chat, user, flow: session.flowName, answers: { ...session.answers } });
			return 'complete';
		}
		armTimeout(session);
		await sendPrompt(sock, session);
		return 'next';
	};

	/** Handler for `messages.upsert` — routes texts from users mid-flow. */
	const handler = async ({ messages }, sock = boundSock) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || msg.key.fromMe) {
				continue;
			}
			const user = msg.key.participant || chat;
			if (!sessions.has(keyOf(chat, user))) {
				continue;
			}
			const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
			if (text) {
				await answer(chat, user, text, sock);
			}
		}
	};

	return {
		/** Register a named flow: steps `[{ id, prompt, validate?, parse? }]`. */
		define(name, steps) {
			if (!name || !Array.isArray(steps) || !steps.length) {
				throw new Error('define(name, steps[]) requires a name and at least one step');
			}
			for (const step of steps) {
				if (!step.id) {
					throw new Error('every step needs an id');
				}
			}
			flows.set(name, steps.map(s => ({ ...s })));
			return this;
		},
		/** Start a flow for a user in a chat. Sends the first prompt. */
		async start(sock, chat, user, flowName, seed = {}) {
			const flow = flows.get(flowName);
			if (!flow) {
				throw new Error(`unknown flow: ${flowName}`);
			}
			const key = keyOf(chat, user);
			const existing = sessions.get(key);
			if (existing) {
				clearSession(existing);
			}
			const session = {
				chat,
				user,
				flowName,
				flow,
				stepIndex: 0,
				answers: { ...seed },
				startedAt: now(),
				lastActiveAt: now(),
				timer: null
			};
			sessions.set(key, session);
			armTimeout(session);
			await sendPrompt(sock, session);
			return session;
		},
		answer,
		handler,
		bind(sock) {
			boundSock = sock;
			// return the (error-swallowed) promise so awaited emitters can wait
			boundHandler = (events) => handler(events, sock).catch(() => { });
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
		cancel(chat, user, reason = 'manual') {
			const session = sessions.get(keyOf(chat, user));
			if (!session) {
				return false;
			}
			clearSession(session);
			emit(cbs.cancel, { chat, user, flow: session.flowName, reason, answers: { ...session.answers } });
			return true;
		},
		isActive: (chat, user) => sessions.has(keyOf(chat, user)),
		getSession(chat, user) {
			const session = sessions.get(keyOf(chat, user));
			if (!session) {
				return null;
			}
			const { timer, flow, ...safe } = session;
			return { ...safe, totalSteps: flow.length };
		},
		onStep(cb) {
			cbs.step.add(cb);
			return () => cbs.step.delete(cb);
		},
		onComplete(cb) {
			cbs.complete.add(cb);
			return () => cbs.complete.delete(cb);
		},
		onCancel(cb) {
			cbs.cancel.add(cb);
			return () => cbs.cancel.delete(cb);
		},
		get size() {
			return sessions.size;
		},
		clear() {
			for (const session of [...sessions.values()]) {
				clearSession(session);
			}
		}
	};
};
