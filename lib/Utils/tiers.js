/**
 * Tier manager — premium/VIP memberships with expiry: the "premium user"
 * system every rental bot runs on.
 *
 * ```js
 * import { createTierManager } from '@japofc/baileys'
 *
 * const tiers = createTierManager({ sweepIntervalMs: 60_000 })
 * tiers.setTier(user, 'premium', { days: 30 })
 * tiers.extend(user, { days: 7 })              // renewals stack
 *
 * tiers.isActive(user)                          // true
 * tiers.isActive(user, 'vip')                   // tier-name check
 * tiers.getTier(user)                           // { name, expiresAt, remainingMs }
 *
 * tiers.onExpire(({ user, name }) =>
 *     sock.sendMessage(user, { text: `Your ${name} expired — renew with !premium` }))
 * tiers.startSweeper()                          // fires onExpire automatically
 * ```
 */

export const createTierManager = (options = {}) => {
	const { sweepIntervalMs = 60_000, now = () => Date.now() } = options;

	/** user -> { name, expiresAt (0 = lifetime), since } */
	const members = new Map();
	const expireCbs = new Set();
	const grantCbs = new Set();
	let timer = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const msOf = ({ days = 0, hours = 0, ms = 0 } = {}) =>
		days * 86_400_000 + hours * 3_600_000 + ms;

	const isExpired = (entry) => entry.expiresAt !== 0 && entry.expiresAt <= now();

	/** Fire expiries and drop stale entries. Returns the expired list. */
	const sweep = () => {
		const expired = [];
		for (const [user, entry] of members) {
			if (isExpired(entry)) {
				members.delete(user);
				expired.push({ user, name: entry.name, since: entry.since, expiredAt: entry.expiresAt });
			}
		}
		for (const e of expired) {
			emit(expireCbs, e);
		}
		return expired;
	};

	return {
		/**
		 * Grant a tier. Duration `{ days, hours, ms }` — omit for lifetime.
		 * Regranting replaces the tier and resets the clock.
		 */
		setTier(user, name, duration) {
			if (!user || !name) {
				throw new Error('setTier(user, name) required');
			}
			const length = duration ? msOf(duration) : 0;
			const entry = {
				name,
				since: now(),
				expiresAt: length ? now() + length : 0
			};
			members.set(user, entry);
			emit(grantCbs, { user, name, expiresAt: entry.expiresAt });
			return { user, ...entry };
		},
		/** Add time to an existing (or just-expired) membership. */
		extend(user, duration) {
			const entry = members.get(user);
			if (!entry) {
				throw new Error('user has no tier — use setTier first');
			}
			if (entry.expiresAt === 0) {
				return { user, ...entry }; // lifetime — nothing to extend
			}
			const base = Math.max(entry.expiresAt, now());
			entry.expiresAt = base + msOf(duration);
			return { user, ...entry };
		},
		revoke(user) {
			return members.delete(user);
		},
		isActive(user, name) {
			const entry = members.get(user);
			if (!entry || isExpired(entry)) {
				return false;
			}
			return name ? entry.name === name : true;
		},
		getTier(user) {
			const entry = members.get(user);
			if (!entry || isExpired(entry)) {
				return null;
			}
			return {
				name: entry.name,
				since: entry.since,
				expiresAt: entry.expiresAt,
				lifetime: entry.expiresAt === 0,
				remainingMs: entry.expiresAt === 0 ? Infinity : entry.expiresAt - now()
			};
		},
		/** All active members, optionally of one tier. */
		list(name) {
			const out = [];
			for (const [user, entry] of members) {
				if (isExpired(entry)) {
					continue;
				}
				if (name && entry.name !== name) {
					continue;
				}
				out.push({ user, name: entry.name, expiresAt: entry.expiresAt });
			}
			return out;
		},
		/**
		 * JAP@Upgrade: active memberships expiring within `withinMs` —
		 * perfect for renewal-reminder crons.
		 */
		getExpiring(withinMs) {
			const cutoff = now() + withinMs;
			const out = [];
			for (const [user, entry] of members) {
				if (entry.expiresAt !== 0 && !isExpired(entry) && entry.expiresAt <= cutoff) {
					out.push({ user, name: entry.name, expiresAt: entry.expiresAt, remainingMs: entry.expiresAt - now() });
				}
			}
			return out.sort((a, b) => a.expiresAt - b.expiresAt);
		},
		sweep,
		startSweeper() {
			if (timer) {
				return () => this.stopSweeper();
			}
			timer = setInterval(sweep, sweepIntervalMs);
			if (timer.unref) {
				timer.unref();
			}
			return () => this.stopSweeper();
		},
		stopSweeper() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		onExpire(cb) {
			expireCbs.add(cb);
			return () => expireCbs.delete(cb);
		},
		onGrant(cb) {
			grantCbs.add(cb);
			return () => grantCbs.delete(cb);
		},
		get size() {
			return members.size;
		},
		toJSON() {
			return { entries: [...members] };
		},
		load(snapshot) {
			members.clear();
			for (const [user, entry] of snapshot?.entries || []) {
				members.set(user, { ...entry });
			}
		},
		clear() {
			members.clear();
		}
	};
};
