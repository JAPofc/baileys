/**
 * Quota manager — daily usage limits per user with tier support:
 * "free users get 20 commands a day, premium 200".
 *
 * ```js
 * import { createQuotaManager } from '@japofc/baileys'
 *
 * const quota = createQuotaManager({ defaultLimit: 20, limits: { premium: 200, vip: Infinity } })
 *
 * // in your command handler:
 * const check = quota.consume(sender, tiers.getTier(sender)?.name)
 * if (!check.allowed) return ctx.reply(`Jatah harian habis! Reset ${new Date(check.resetAt).toLocaleTimeString()}`)
 * // check.remaining left today
 *
 * quota.remaining(sender)          // peek without consuming
 * quota.onExhausted(({ user }) => console.log(user, 'hit the daily cap'))
 * ```
 *
 * Counters reset automatically at local midnight (clock injectable for tests).
 */

export const createQuotaManager = (options = {}) => {
	const {
		defaultLimit = 20,
		limits = {},
		now = () => Date.now()
	} = options;

	/** user -> { used, day } */
	const usage = new Map();
	const exhaustedCbs = new Set();
	const bonuses = new Map(); // user -> extra allowance today { amount, day }

	const emit = (payload) => {
		for (const cb of exhaustedCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const dayOf = (t) => {
		const d = new Date(t);
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	};

	const nextMidnight = (t) => {
		const d = new Date(t);
		d.setHours(24, 0, 0, 0);
		return d.getTime();
	};

	const limitFor = (user, tier) => {
		const base = tier && tier in limits ? limits[tier] : defaultLimit;
		const bonus = bonuses.get(user);
		return base + (bonus && bonus.day === dayOf(now()) ? bonus.amount : 0);
	};

	const entryOf = (user) => {
		const day = dayOf(now());
		let entry = usage.get(user);
		if (!entry || entry.day !== day) {
			entry = { used: 0, day };
			usage.set(user, entry);
		}
		return entry;
	};

	return {
		/**
		 * Try to spend `amount` from today's quota. Returns
		 * `{ allowed, used, limit, remaining, resetAt }`.
		 */
		consume(user, tier, amount = 1) {
			const entry = entryOf(user);
			const limit = limitFor(user, tier);
			const resetAt = nextMidnight(now());
			if (entry.used + amount > limit) {
				emit({ user, tier, used: entry.used, limit, resetAt });
				return { allowed: false, used: entry.used, limit, remaining: Math.max(0, limit - entry.used), resetAt };
			}
			entry.used += amount;
			return { allowed: true, used: entry.used, limit, remaining: limit === Infinity ? Infinity : limit - entry.used, resetAt };
		},
		/** Peek without spending. */
		remaining(user, tier) {
			const entry = entryOf(user);
			const limit = limitFor(user, tier);
			return limit === Infinity ? Infinity : Math.max(0, limit - entry.used);
		},
		getUsed: (user) => entryOf(user).used,
		/** Grant extra allowance for today only (rewards, promos). */
		grantBonus(user, amount) {
			bonuses.set(user, { amount: Math.max(0, amount), day: dayOf(now()) });
		},
		/** Reset one user (or everyone) immediately. */
		reset(user) {
			if (user) {
				usage.delete(user);
				bonuses.delete(user);
			} else {
				usage.clear();
				bonuses.clear();
			}
		},
		onExhausted(cb) {
			exhaustedCbs.add(cb);
			return () => exhaustedCbs.delete(cb);
		},
		toJSON() {
			return { entries: [...usage], bonuses: [...bonuses] };
		},
		load(snapshot) {
			usage.clear();
			bonuses.clear();
			for (const [user, entry] of snapshot?.entries || []) {
				usage.set(user, { ...entry });
			}
			for (const [user, bonus] of snapshot?.bonuses || []) {
				bonuses.set(user, { ...bonus });
			}
		}
	};
};
