/**
 * Call guard — track incoming WhatsApp calls and (optionally) auto-reject them.
 *
 * ```js
 * import { createCallGuard } from '@japofc/baileys'
 *
 * const guard = createCallGuard({
 *     autoReject: true,
 *     rejectMessage: 'Sorry, this bot cannot take calls.',
 *     allowlist: ['628111xxx@s.whatsapp.net']
 * })
 * guard.bind(sock) // listens on the 'call' event
 *
 * guard.onCall(call => console.log(call.from, call.status, call.isVideo))
 * guard.getCallCount('628222xxx@s.whatsapp.net') // how often has this jid called?
 * ```
 *
 * Only `status === 'offer'` triggers rejection — latency/terminate/timeout
 * updates are logged but never acted on. Rejection failures are reported via
 * `onError` and never throw into the event loop.
 */

const DEFAULT_MAX_CALLS = 200;

export const createCallGuard = (options = {}) => {
	const {
		autoReject = false,
		rejectMessage = undefined,
		allowlist = [],
		denylist = [],
		schedule,
		now = () => Date.now(),
		maxCalls = DEFAULT_MAX_CALLS
	} = options;

	const allowed = new Set(allowlist);
	const denied = new Set(denylist);
	// JAP@Upgrade: quiet hours — only auto-reject inside the window.
	// schedule: { from: '22:00', to: '06:00' } (overnight ranges fine).
	const parseHM = (v) => {
		const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v || ''));
		return m ? (+m[1]) * 60 + (+m[2]) : null;
	};
	const quiet = schedule ? { from: parseHM(schedule.from), to: parseHM(schedule.to) } : null;
	if (quiet && (quiet.from === null || quiet.to === null)) {
		throw new Error("call-guard schedule needs { from: 'HH:MM', to: 'HH:MM' }");
	}
	const inQuietHours = () => {
		if (!quiet) {
			return true; // no schedule = always enforce
		}
		const d = new Date(now());
		const mins = d.getHours() * 60 + d.getMinutes();
		return quiet.from <= quiet.to
			? mins >= quiet.from && mins < quiet.to
			: mins >= quiet.from || mins < quiet.to; // overnight
	};
	/** call log: id -> call record (LRU-capped) */
	const calls = new Map();
	/** per-caller offer counter */
	const counts = new Map();
	const callCbs = new Set();
	const rejectedCbs = new Set();
	const errorCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const remember = (call) => {
		if (calls.has(call.id)) {
			calls.delete(call.id);
		}
		calls.set(call.id, call);
		while (calls.size > maxCalls) {
			const oldest = calls.keys().next().value;
			calls.delete(oldest);
		}
	};

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must never break call handling
			}
		}
	};

	const shouldReject = async (call) => {
		// denylist beats everything — even outside quiet hours
		if (denied.has(call.from) || denied.has(call.chatId)) {
			return true;
		}
		if (allowed.has(call.from) || allowed.has(call.chatId)) {
			return false;
		}
		if (!inQuietHours()) {
			return false;
		}
		if (typeof autoReject === 'function') {
			return !!(await autoReject(call));
		}
		return !!autoReject;
	};

	/**
	 * Handler for the `call` event. Pass the socket to enable auto-reject
	 * (bind() does this automatically).
	 */
	const handler = async (events, sock = boundSock) => {
		for (const call of events || []) {
			if (!call?.id) {
				continue;
			}
			const record = { ...call, rejected: false };
			if (call.status === 'offer') {
				counts.set(call.from, (counts.get(call.from) || 0) + 1);
				let reject = false;
				try {
					reject = await shouldReject(call);
				} catch (error) {
					emit(errorCbs, { call, error });
				}
				if (reject && sock) {
					try {
						await sock.rejectCall(call.id, call.from);
						record.rejected = true;
						if (rejectMessage) {
							const content = typeof rejectMessage === 'function'
								? rejectMessage(call)
								: { text: rejectMessage };
							if (content) {
								await sock.sendMessage(call.chatId, typeof content === 'string' ? { text: content } : content);
							}
						}
						emit(rejectedCbs, record);
					} catch (error) {
						emit(errorCbs, { call, error });
					}
				}
			}
			remember(record);
			emit(callCbs, record);
		}
	};

	return {
		handler,
		/** Attach to `sock.ev.on('call', ...)`. Returns an unbind function. */
		bind(sock) {
			boundSock = sock;
			boundHandler = (events) => {
				handler(events, sock).catch(() => { });
			};
			sock.ev.on('call', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('call', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		onCall(cb) {
			callCbs.add(cb);
			return () => callCbs.delete(cb);
		},
		onRejected(cb) {
			rejectedCbs.add(cb);
			return () => rejectedCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		/** Most recent calls, oldest first. */
		getCalls: () => [...calls.values()],
		getCall: (id) => calls.get(id),
		/** How many call offers this jid has made since start/clear. */
		getCallCount: (jid) => counts.get(jid) || 0,
		get size() {
			return calls.size;
		},
		clear() {
			calls.clear();
			counts.clear();
		}
	};
};
