/**
 * Group operation guard — WhatsApp rate-limits group actions hard
 * (roughly ~3 participant-adds and ~2 group-creates per 10 minutes;
 * exceeding them triggers reachout restrictions). This guard keeps your
 * bot under those ceilings.
 *
 * ```js
 * import { createGroupOpGuard } from '@japofc/baileys'
 *
 * const ops = createGroupOpGuard()
 *
 * const check = ops.check('add')
 * if (!check.allowed) {
 *     console.log(`cooling down — retry in ${Math.ceil(check.retryInMs / 1000)}s`)
 * } else {
 *     await sock.groupParticipantsUpdate(jid, users, 'add')
 *     ops.record('add')
 * }
 *
 * // or wrap the calls so the guard is automatic (throws GroupOpLimitError):
 * const safe = ops.wrap(sock)
 * await safe.groupParticipantsUpdate(jid, users, 'add')
 * await safe.groupCreate('New group', users)
 * ```
 *
 * Limits are configurable per operation: `{ add, create, promote, … }`.
 */

export class GroupOpLimitError extends Error {
	constructor(op, retryInMs) {
		super(`group operation "${op}" rate-limited — retry in ${Math.ceil(retryInMs / 1000)}s`);
		this.name = 'GroupOpLimitError';
		this.op = op;
		this.retryInMs = retryInMs;
	}
}

export const DEFAULT_GROUP_OP_LIMITS = {
	add: { max: 3, windowMs: 10 * 60_000 },
	create: { max: 2, windowMs: 10 * 60_000 },
	remove: { max: 10, windowMs: 10 * 60_000 },
	promote: { max: 10, windowMs: 10 * 60_000 },
	demote: { max: 10, windowMs: 10 * 60_000 }
};

export const createGroupOpGuard = (options = {}) => {
	const { limits = {}, now = () => Date.now() } = options;
	const merged = { ...DEFAULT_GROUP_OP_LIMITS };
	for (const [op, limit] of Object.entries(limits)) {
		merged[op] = { ...merged[op], ...limit };
	}

	/** op -> timestamps[] */
	const history = new Map();
	const blockedCbs = new Set();

	const emit = (payload) => {
		for (const cb of blockedCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const prune = (op) => {
		const limit = merged[op];
		if (!limit) {
			return [];
		}
		const cutoff = now() - limit.windowMs;
		const list = (history.get(op) || []).filter(t => t > cutoff);
		history.set(op, list);
		return list;
	};

	/** Would this operation be allowed right now? */
	const check = (op, count = 1) => {
		const limit = merged[op];
		if (!limit) {
			return { allowed: true, used: 0, max: Infinity, retryInMs: 0 };
		}
		const list = prune(op);
		if (list.length + count > limit.max) {
			// JAP@Fix: to fit `count` more calls we must wait for `needed` of the
			// OLDEST calls to fall out of the window — not just one. The old code
			// always used list[0] (a single slot), so for count > 1 (or an
			// over-full history) it under-reported retryInMs and a caller that
			// waited exactly that long was still blocked. Wait for the
			// `needed`-th oldest entry to expire instead.
			const needed = list.length + count - limit.max;
			const freeAt = list[Math.min(needed - 1, list.length - 1)] ?? now();
			const retryInMs = Math.max(0, freeAt + limit.windowMs - now());
			return { allowed: false, used: list.length, max: limit.max, retryInMs };
		}
		return { allowed: true, used: list.length, max: limit.max, retryInMs: 0 };
	};

	/** Count an executed operation. */
	const record = (op, count = 1) => {
		const list = prune(op);
		for (let i = 0; i < count; i++) {
			list.push(now());
		}
		history.set(op, list);
	};

	return {
		check,
		record,
		/** JAP@Upgrade: change an operation's limit at runtime. */
		configure(op, limit) {
			merged[op] = { ...merged[op], ...limit };
		},
		/**
		 * JAP@Upgrade: wait until the operation is allowed, then record it.
		 * Caps the wait at `maxWaitMs` (throws GroupOpLimitError past it).
		 */
		async waitAndAssert(op, count = 1, { maxWaitMs = 15 * 60_000 } = {}) {
			const verdict = check(op, count);
			if (verdict.allowed) {
				record(op, count);
				return verdict;
			}
			if (verdict.retryInMs > maxWaitMs) {
				emit({ op, ...verdict });
				throw new GroupOpLimitError(op, verdict.retryInMs);
			}
			await new Promise(r => setTimeout(r, verdict.retryInMs + 5));
			return this.waitAndAssert(op, count, { maxWaitMs });
		},
		/** check + record + GroupOpLimitError on breach, in one call. */
		assert(op, count = 1) {
			const result = check(op, count);
			if (!result.allowed) {
				emit({ op, ...result });
				throw new GroupOpLimitError(op, result.retryInMs);
			}
			record(op, count);
			return result;
		},
		/**
		 * Wrap a socket: `groupParticipantsUpdate` (counts per participant,
		 * mapped to the action) and `groupCreate` go through the guard.
		 * Everything else passes straight through.
		 */
		wrap(sock) {
			const guard = this;
			return new Proxy(sock, {
				get(target, prop, receiver) {
					if (prop === 'groupParticipantsUpdate') {
						return async (jid, participants, action, ...rest) => {
							guard.assert(action, participants?.length || 1);
							return target.groupParticipantsUpdate(jid, participants, action, ...rest);
						};
					}
					if (prop === 'groupCreate') {
						return async (...args) => {
							guard.assert('create');
							return target.groupCreate(...args);
						};
					}
					return Reflect.get(target, prop, receiver);
				}
			});
		},
		onBlocked(cb) {
			blockedCbs.add(cb);
			return () => blockedCbs.delete(cb);
		},
		getUsage() {
			const out = {};
			for (const op of Object.keys(merged)) {
				const list = prune(op);
				out[op] = { used: list.length, max: merged[op].max };
			}
			return out;
		},
		/**
		 * JAP@Upgrade: persist the rate-limit history so a bot that restarts (or
		 * crash-loops) doesn't forget recent group ops and immediately blast past
		 * WhatsApp's ceilings again. Serializes the (pruned) timestamps per op.
		 */
		toJSON() {
			const entries = [];
			for (const op of history.keys()) {
				const list = prune(op);
				if (list.length) {
					entries.push([op, list]);
				}
			}
			return { history: entries };
		},
		load(snapshot) {
			history.clear();
			for (const [op, list] of snapshot?.history || []) {
				if (Array.isArray(list)) {
					history.set(op, list.filter(t => Number.isFinite(t)));
				}
			}
		},
		reset() {
			history.clear();
		}
	};
};
