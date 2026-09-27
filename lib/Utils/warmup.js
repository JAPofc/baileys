/**
 * Account warmup — fresh WhatsApp numbers get banned for acting like bots
 * on day one. This ramps your daily send volume gradually until the
 * account has history.
 *
 * ```js
 * import { createAccountWarmup } from '@japofc/baileys'
 *
 * const warmup = createAccountWarmup({ startedAt: firstLoginTs })
 * // default ramp: day 1 → 20 msgs, then 50, 100, 200, 400, 800, unlimited
 *
 * if (!warmup.canSend()) {
 *     console.log(`warmup cap hit — resumes ${new Date(warmup.nextResetAt())}`)
 * } else {
 *     await sock.sendMessage(jid, content)
 *     warmup.recordSend()
 * }
 *
 * warmup.getStatus() // { day, cap, sentToday, remaining, graduated }
 * warmup.onLimit(({ day, cap }) => notifyOwner(`day ${day} cap (${cap}) reached`))
 * ```
 *
 * State survives restarts via toJSON()/load(). Days roll at local midnight.
 */

export const DEFAULT_WARMUP_RAMP = [20, 50, 100, 200, 400, 800];

export const createAccountWarmup = (options = {}) => {
	const {
		startedAt = Date.now(),
		ramp = DEFAULT_WARMUP_RAMP,
		now = () => Date.now()
	} = options;

	let sentToday = 0;
	let countedDay = null;
	const limitCbs = new Set();
	let limitFiredForDay = null;

	const dayKey = (t) => {
		const d = new Date(t);
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	};

	/** 1-based warmup day. */
	const dayOf = () => Math.max(1, Math.floor((now() - startedAt) / 86_400_000) + 1);

	/** Today's cap — Infinity once past the ramp ("graduated"). */
	const capOf = () => {
		const day = dayOf();
		return day > ramp.length ? Infinity : ramp[day - 1];
	};

	const rollover = () => {
		const key = dayKey(now());
		if (countedDay !== key) {
			countedDay = key;
			sentToday = 0;
			limitFiredForDay = null;
		}
	};

	const emit = (payload) => {
		for (const cb of limitCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	return {
		/** May we send another message right now? */
		canSend() {
			rollover();
			return sentToday < capOf();
		},
		/** Count one sent message. Returns remaining allowance for today. */
		recordSend(count = 1) {
			rollover();
			sentToday += count;
			const cap = capOf();
			if (sentToday >= cap && limitFiredForDay !== countedDay) {
				limitFiredForDay = countedDay;
				emit({ day: dayOf(), cap, sentToday });
			}
			return cap === Infinity ? Infinity : Math.max(0, cap - sentToday);
		},
		/**
		 * Convenience: check + record in one call. Returns
		 * `{ allowed, remaining, cap, day }`.
		 */
		trySend() {
			rollover();
			const cap = capOf();
			if (sentToday >= cap) {
				return { allowed: false, remaining: 0, cap, day: dayOf() };
			}
			const remaining = this.recordSend();
			return { allowed: true, remaining, cap, day: dayOf() };
		},
		getStatus() {
			rollover();
			const cap = capOf();
			const day = dayOf();
			return {
				day,
				cap,
				sentToday,
				remaining: cap === Infinity ? Infinity : Math.max(0, cap - sentToday),
				graduated: day > ramp.length
			};
		},
		/** Next local midnight (when the counter resets). */
		nextResetAt() {
			const d = new Date(now());
			d.setHours(24, 0, 0, 0);
			return d.getTime();
		},
		onLimit(cb) {
			limitCbs.add(cb);
			return () => limitCbs.delete(cb);
		},
		toJSON() {
			rollover();
			return { startedAt, sentToday, countedDay };
		},
		load(snapshot) {
			if (snapshot?.countedDay === dayKey(now())) {
				sentToday = snapshot.sentToday || 0;
				countedDay = snapshot.countedDay;
			}
		}
	};
};
