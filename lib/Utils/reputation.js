/**
 * Reputation — the +rep/-rep social credit system: praise or shame, with
 * per-giver cooldowns so nobody farms it.
 *
 * ```js
 * import { createReputation } from '@japofc/baileys'
 *
 * const rep = createReputation({ cooldownMs: 3_600_000 })
 * rep.give(fromUser, targetUser, +1, 'helped me fix pairing')
 * // { ok: true, total: 12 } or { ok: false, reason: 'cooldown' | 'self' | 'bad-amount' }
 *
 * rep.getRep(user)              // { total, given, received, history: last 10 }
 * rep.getLeaderboard(10)        // most respected first
 * rep.renderCard(user)          // '⭐ @user — rep 12 (👍 14 / 👎 2)'
 * ```
 */

export const createReputation = (options = {}) => {
	const {
		cooldownMs = 60 * 60_000,
		maxHistory = 10,
		now = () => Date.now()
	} = options;

	/** user -> { total, up, down, given, history: [{from, amount, reason, at}] } */
	const users = new Map();
	/** `${from}:${to}` -> lastGiveAt */
	const cooldowns = new Map();
	const giveCbs = new Set();

	const emit = (payload) => {
		for (const cb of giveCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const ensure = (user) => {
		let entry = users.get(user);
		if (!entry) {
			entry = { total: 0, up: 0, down: 0, given: 0, history: [] };
			users.set(user, entry);
		}
		return entry;
	};

	return {
		/**
		 * Give reputation: amount +1 or -1. Returns `{ ok, total }` or a
		 * refusal `{ ok: false, reason, remainingMs? }` — never throws on
		 * user input.
		 */
		give(from, to, amount, reason = '') {
			if (from === to) {
				return { ok: false, reason: 'self' };
			}
			if (amount !== 1 && amount !== -1) {
				return { ok: false, reason: 'bad-amount' };
			}
			const key = `${from}:${to}`;
			// undefined sentinel — a clock starting at 0 must not block give #1
			const last = cooldowns.get(key);
			const t = now();
			if (last !== undefined && t - last < cooldownMs) {
				return { ok: false, reason: 'cooldown', remainingMs: cooldownMs - (t - last) };
			}
			cooldowns.set(key, t);
			const target = ensure(to);
			target.total += amount;
			if (amount > 0) {
				target.up++;
			} else {
				target.down++;
			}
			target.history.push({ from, amount, reason, at: t });
			while (target.history.length > maxHistory) {
				target.history.shift();
			}
			ensure(from).given++;
			emit({ from, to, amount, reason, total: target.total });
			return { ok: true, total: target.total };
		},
		getRep(user) {
			const entry = users.get(user);
			if (!entry) {
				return { total: 0, up: 0, down: 0, given: 0, history: [] };
			}
			return { ...entry, history: entry.history.map(h => ({ ...h })) };
		},
		getLeaderboard(limit = 10) {
			return [...users]
				.map(([user, e]) => ({ user, total: e.total, up: e.up, down: e.down }))
				.filter(r => r.up + r.down > 0)
				.sort((a, b) => b.total - a.total)
				.slice(0, limit);
		},
		/** Ready-to-send rep card. */
		renderCard(user) {
			const rep = this.getRep(user);
			return `⭐ @${String(user).split('@')[0]} — rep ${rep.total} (👍 ${rep.up} / 👎 ${rep.down})`;
		},
		onGive(cb) {
			giveCbs.add(cb);
			return () => giveCbs.delete(cb);
		},
		get size() {
			return users.size;
		},
		toJSON() {
			// persist cooldowns too — otherwise a reload wipes the per-giver
			// timers and the anti-farm guarantee is lost across restarts.
			return {
				entries: [...users].map(([u, e]) => [u, { ...e }]),
				cooldowns: [...cooldowns]
			};
		},
		load(snapshot) {
			users.clear();
			cooldowns.clear();
			for (const [user, e] of snapshot?.entries || []) {
				users.set(user, { ...e, history: [...(e.history || [])] });
			}
			for (const [key, at] of snapshot?.cooldowns || []) {
				cooldowns.set(key, at);
			}
		}
	};
};
