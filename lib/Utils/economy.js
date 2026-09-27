/**
 * Economy system — balances, transfers and daily rewards with streaks: the
 * backbone of "balance / daily / pay" bot commands.
 *
 * ```js
 * import { createEconomy } from '@japofc/baileys'
 *
 * const eco = createEconomy({ dailyAmount: [100, 200], streakBonus: 25 })
 *
 * eco.add(user, 500, 'quest reward')
 * eco.getBalance(user)                    // 500
 * eco.transfer(userA, userB, 100)         // { sent: 100, fee: 0 }
 *
 * const claim = eco.claimDaily(user)
 * claim.claimed
 *     ? `+${claim.amount} (streak ${claim.streak}🔥)`
 *     : `wait ${Math.ceil(claim.remainingMs / 3600_000)}h`
 *
 * eco.getLeaderboard(10)                  // richest users
 * fs.writeFileSync('eco.json', JSON.stringify(eco.toJSON()))
 * ```
 *
 * Balances never go negative unless `allowNegative: true`. All mutations
 * fire `onTransaction` for audit logs.
 */

export const createEconomy = (options = {}) => {
	const {
		startingBalance = 0,
		dailyAmount = [100, 200],
		dailyCooldownMs = 24 * 60 * 60 * 1000,
		streakBonus = 0,
		maxStreakBonus = Infinity,
		streakGraceMs = 24 * 60 * 60 * 1000,
		transferFee = 0, // fraction, e.g. 0.05 = 5%
		allowNegative = false,
		now = () => Date.now(),
		random = Math.random
	} = options;

	const [dailyMin, dailyMax] = Array.isArray(dailyAmount) ? dailyAmount : [dailyAmount, dailyAmount];

	/** user -> { balance, lastDailyAt, streak } */
	const accounts = new Map();
	const txCbs = new Set();

	const emit = (tx) => {
		for (const cb of txCbs) {
			try {
				cb(tx);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const ensure = (user) => {
		let acc = accounts.get(user);
		if (!acc) {
			acc = { balance: startingBalance, lastDailyAt: null, streak: 0 };
			accounts.set(user, acc);
		}
		return acc;
	};

	const add = (user, amount, reason = '') => {
		if (!Number.isFinite(amount)) {
			throw new Error('amount must be a finite number');
		}
		const acc = ensure(user);
		acc.balance += amount;
		emit({ type: amount >= 0 ? 'add' : 'deduct', user, amount, balance: acc.balance, reason, at: now() });
		return acc.balance;
	};

	return {
		getBalance: (user) => accounts.get(user)?.balance ?? 0,
		has: (user, amount) => (accounts.get(user)?.balance ?? 0) >= amount,
		/** Credit (or debit with a negative amount). Returns the new balance. */
		add,
		/**
		 * Debit. Throws when funds are insufficient (unless allowNegative).
		 * Returns the new balance.
		 */
		deduct(user, amount, reason = '') {
			if (!Number.isFinite(amount) || amount < 0) {
				throw new Error('amount must be a non-negative number');
			}
			const acc = ensure(user);
			if (!allowNegative && acc.balance < amount) {
				throw new Error(`insufficient balance: has ${acc.balance}, needs ${amount}`);
			}
			return add(user, -amount, reason);
		},
		/**
		 * Move funds between users. The fee (if configured) is deducted from
		 * the sender on top. Returns `{ sent, fee }`.
		 */
		transfer(from, to, amount, reason = '') {
			if (!Number.isFinite(amount) || amount <= 0) {
				throw new Error('transfer amount must be positive');
			}
			if (from === to) {
				throw new Error('cannot transfer to yourself');
			}
			const fee = Math.ceil(amount * transferFee);
			const total = amount + fee;
			const sender = ensure(from);
			if (!allowNegative && sender.balance < total) {
				throw new Error(`insufficient balance: has ${sender.balance}, needs ${total} (incl. fee ${fee})`);
			}
			sender.balance -= total;
			ensure(to).balance += amount;
			emit({ type: 'transfer', user: from, to, amount, fee, balance: sender.balance, reason, at: now() });
			return { sent: amount, fee };
		},
		/**
		 * Claim the daily reward. Returns `{ claimed: true, amount, streak,
		 * balance, nextClaimAt }` or `{ claimed: false, remainingMs }`.
		 */
		claimDaily(user) {
			const acc = ensure(user);
			const t = now();
			const neverClaimed = acc.lastDailyAt === null || acc.lastDailyAt === undefined;
			const sinceLast = neverClaimed ? Infinity : t - acc.lastDailyAt;
			if (!neverClaimed && sinceLast < dailyCooldownMs) {
				return { claimed: false, remainingMs: dailyCooldownMs - sinceLast };
			}
			// streak continues when claimed within cooldown + grace window
			acc.streak = !neverClaimed && sinceLast <= dailyCooldownMs + streakGraceMs ? acc.streak + 1 : 1;
			acc.lastDailyAt = t;
			const base = dailyMin + Math.floor(random() * (dailyMax - dailyMin + 1));
			const bonus = Math.min((acc.streak - 1) * streakBonus, maxStreakBonus);
			const amount = base + bonus;
			acc.balance += amount;
			emit({ type: 'daily', user, amount, streak: acc.streak, balance: acc.balance, at: t });
			return { claimed: true, amount, streak: acc.streak, balance: acc.balance, nextClaimAt: t + dailyCooldownMs };
		},
		/**
		 * Gamble: win pays `amount * (multiplier - 1)`, lose costs `amount`.
		 * Returns `{ won, payout, balance }`. Throws on insufficient funds.
		 */
		bet(user, amount, { winChance = 0.5, multiplier = 2 } = {}) {
			if (!Number.isFinite(amount) || amount <= 0) {
				throw new Error('bet amount must be positive');
			}
			const acc = ensure(user);
			if (!allowNegative && acc.balance < amount) {
				throw new Error(`insufficient balance: has ${acc.balance}, betting ${amount}`);
			}
			const won = random() < winChance;
			const delta = won ? Math.floor(amount * (multiplier - 1)) : -amount;
			acc.balance += delta;
			emit({ type: won ? 'bet-win' : 'bet-loss', user, amount: delta, balance: acc.balance, at: now() });
			return { won, payout: delta, balance: acc.balance };
		},
		getStreak: (user) => accounts.get(user)?.streak ?? 0,
		getLeaderboard(limit = 10) {
			return [...accounts]
				.map(([user, acc]) => ({ user, balance: acc.balance }))
				.sort((a, b) => b.balance - a.balance)
				.slice(0, limit)
				.map((row, i) => ({ rank: i + 1, ...row }));
		},
		onTransaction(cb) {
			txCbs.add(cb);
			return () => txCbs.delete(cb);
		},
		/** Serialize for persistence. */
		toJSON() {
			return { entries: [...accounts].map(([user, acc]) => [user, { ...acc }]) };
		},
		/** Restore a previous toJSON() snapshot. */
		load(snapshot) {
			accounts.clear();
			for (const [user, acc] of snapshot?.entries || []) {
				accounts.set(user, { balance: acc.balance || 0, lastDailyAt: acc.lastDailyAt ?? null, streak: acc.streak || 0 });
			}
		},
		get size() {
			return accounts.size;
		},
		clear() {
			accounts.clear();
		}
	};
};
