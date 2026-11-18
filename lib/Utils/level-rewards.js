/**
 * Level rewards — glue that pays out when users level up: balance, tier
 * grants, shop items or anything custom, defined per level threshold.
 *
 * ```js
 * import { attachLevelRewards } from '@japofc/baileys'
 *
 * const detach = attachLevelRewards(levels, {
 *     5:  { balance: 1000 },
 *     10: { balance: 5000, tier: { name: 'silver', days: 30 } },
 *     20: { item: 'vip', custom: (user) => announce(user) }
 * }, { economy: eco, tiers, shop })
 *
 * // on every level-up, every UNCLAIMED threshold ≤ new level pays out
 * // exactly once per user (multi-level jumps included)
 * ```
 */

export const attachLevelRewards = (levels, rewards, managers = {}) => {
	if (typeof levels?.onLevelUp !== 'function') {
		throw new Error('attachLevelRewards(levels, …) needs a createLevelSystem() instance');
	}
	const { economy, tiers, shop } = managers;
	const thresholds = Object.keys(rewards || {})
		.map(Number)
		.filter(n => Number.isInteger(n) && n > 0)
		.sort((a, b) => a - b);
	if (!thresholds.length) {
		throw new Error('attachLevelRewards needs at least one { level: reward } entry');
	}

	/** user -> Set(claimed thresholds) */
	const claimed = new Map();
	const grantCbs = new Set();

	const emit = (payload) => {
		for (const cb of grantCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const detachLevelUp = levels.onLevelUp(({ user, level }) => {
		let mine = claimed.get(user);
		if (!mine) {
			mine = new Set();
			claimed.set(user, mine);
		}
		for (const threshold of thresholds) {
			if (threshold > level || mine.has(threshold)) {
				continue;
			}
			mine.add(threshold);
			const reward = rewards[threshold];
			const granted = {};
			try {
				if (reward.balance && economy) {
					economy.add(user, reward.balance, `level ${threshold} reward`);
					granted.balance = reward.balance;
				}
				if (reward.tier && tiers) {
					tiers.setTier(user, reward.tier.name, reward.tier.days ? { days: reward.tier.days } : undefined);
					granted.tier = reward.tier.name;
				}
				if (reward.item && shop) {
					shop.giveItem ? shop.giveItem('__rewards__', user, reward.item) : null;
					granted.item = reward.item;
				}
				if (typeof reward.custom === 'function') {
					reward.custom(user, threshold);
					granted.custom = true;
				}
			} catch (error) {
				emit({ user, level: threshold, error });
				continue;
			}
			emit({ user, level: threshold, granted });
		}
	});

	return Object.assign(() => detachLevelUp(), {
		onGrant(cb) {
			grantCbs.add(cb);
			return () => grantCbs.delete(cb);
		},
		hasClaimed: (user, threshold) => claimed.get(user)?.has(threshold) ?? false,
		toJSON() {
			return { entries: [...claimed].map(([u, set]) => [u, [...set]]) };
		},
		load(snapshot) {
			claimed.clear();
			for (const [user, list] of snapshot?.entries || []) {
				claimed.set(user, new Set(list));
			}
		}
	});
};
