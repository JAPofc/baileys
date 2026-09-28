/**
 * Rental manager ("sewa bot") — per-CHAT subscriptions: groups rent the
 * bot for N days, expired groups get ignored (and optionally left).
 *
 * ```js
 * import { createRentalManager } from '@japofc/baileys'
 *
 * const rental = createRentalManager()
 * rental.add(groupJid, { days: 30, by: buyerJid })
 * rental.startTrial(newGroupJid, { days: 3 })       // one trial per chat, ever
 *
 * // bot ignores unrented groups (DMs pass by default):
 * sock.ev.on('messages.upsert', rental.filter(async ({ messages }) => { … }))
 *
 * rental.onExpiring(({ chat, remainingMs }) =>      // renewal reminder
 *     sock.sendMessage(chat, { text: '⏰ Sewa bot habis besok! Ketik !sewa' }))
 * rental.onExpire(async ({ chat }) => {
 *     await sock.sendMessage(chat, { text: 'Sewa habis — bot pamit 👋' })
 *     await sock.groupLeave(chat)
 * })
 * rental.startSweeper()
 *
 * rental.renderStatus(groupJid)  // '✅ Aktif — 12d 4h tersisa'
 * ```
 */

export const createRentalManager = (options = {}) => {
	const {
		sweepIntervalMs = 60_000,
		/** Fire onExpiring when this much time is left. Default 24h. */
		expiringThresholdMs = 24 * 60 * 60 * 1000,
		/** Unrented DMs pass filter() by default. */
		allowDms = true,
		now = () => Date.now()
	} = options;

	/** chat -> { expiresAt (0 = lifetime), since, by, trial, warned } */
	const rentals = new Map();
	/** chats that ever used a trial (survives expiry) */
	const trialUsed = new Set();
	const cbs = { expire: new Set(), expiring: new Set(), grant: new Set() };
	let timer = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				const result = cb(payload);
				if (result && typeof result.catch === 'function') {
					result.catch(() => { });
				}
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const msOf = ({ days = 0, hours = 0, ms = 0 } = {}) =>
		days * 86_400_000 + hours * 3_600_000 + ms;

	const isExpired = (entry) => entry.expiresAt !== 0 && entry.expiresAt <= now();

	/** Fire expiries + renewal warnings. Returns expired chats. */
	const sweep = () => {
		const expired = [];
		for (const [chat, entry] of rentals) {
			if (isExpired(entry)) {
				rentals.delete(chat);
				expired.push(chat);
				emit(cbs.expire, { chat, since: entry.since, trial: entry.trial, expiredAt: entry.expiresAt });
				continue;
			}
			if (entry.expiresAt !== 0 && !entry.warned) {
				const remainingMs = entry.expiresAt - now();
				if (remainingMs <= expiringThresholdMs) {
					entry.warned = true;
					emit(cbs.expiring, { chat, remainingMs, expiresAt: entry.expiresAt });
				}
			}
		}
		return expired;
	};

	return {
		/** Grant/replace a rental. Omit duration for lifetime. */
		add(chat, { days, hours, ms, by, lifetime = false } = {}) {
			const length = lifetime ? 0 : msOf({ days, hours, ms });
			if (!lifetime && length <= 0) {
				throw new Error('rental needs a duration ({ days/hours/ms }) or lifetime: true');
			}
			const entry = {
				expiresAt: lifetime ? 0 : now() + length,
				since: now(),
				by,
				trial: false,
				warned: false
			};
			rentals.set(chat, entry);
			emit(cbs.grant, { chat, expiresAt: entry.expiresAt, by, trial: false });
			return { chat, expiresAt: entry.expiresAt };
		},
		/** Stack time onto an active (or just-expired) rental. */
		extend(chat, duration) {
			const entry = rentals.get(chat);
			if (!entry) {
				return this.add(chat, duration);
			}
			if (entry.expiresAt === 0) {
				return { chat, expiresAt: 0 };
			}
			entry.expiresAt = Math.max(entry.expiresAt, now()) + msOf(duration);
			entry.warned = false;
			return { chat, expiresAt: entry.expiresAt };
		},
		/** One free trial per chat, forever. Returns false when already used. */
		startTrial(chat, { days = 3 } = {}) {
			if (trialUsed.has(chat) || rentals.has(chat)) {
				return false;
			}
			trialUsed.add(chat);
			const entry = {
				expiresAt: now() + msOf({ days }),
				since: now(),
				by: undefined,
				trial: true,
				warned: false
			};
			rentals.set(chat, entry);
			emit(cbs.grant, { chat, expiresAt: entry.expiresAt, trial: true });
			return { chat, expiresAt: entry.expiresAt };
		},
		revoke(chat) {
			return rentals.delete(chat);
		},
		isActive(chat) {
			const entry = rentals.get(chat);
			return !!entry && !isExpired(entry);
		},
		getRental(chat) {
			const entry = rentals.get(chat);
			if (!entry || isExpired(entry)) {
				return null;
			}
			return {
				chat,
				since: entry.since,
				expiresAt: entry.expiresAt,
				lifetime: entry.expiresAt === 0,
				trial: entry.trial,
				remainingMs: entry.expiresAt === 0 ? Infinity : entry.expiresAt - now()
			};
		},
		/**
		 * Wrap a `messages.upsert` handler: messages from unrented GROUPS
		 * are dropped (DMs pass unless allowDms: false).
		 */
		filter(handlerFn) {
			return (upsert, ...rest) => {
				const messages = (upsert?.messages || []).filter(msg => {
					const chat = msg?.key?.remoteJid;
					if (!chat) {
						return false;
					}
					if (!chat.endsWith('@g.us')) {
						return allowDms;
					}
					return this.isActive(chat);
				});
				if (!messages.length && (upsert?.messages || []).length) {
					return undefined;
				}
				return handlerFn({ ...upsert, messages }, ...rest);
			};
		},
		/** Ready-to-send status line. */
		renderStatus(chat) {
			const rental = this.getRental(chat);
			if (!rental) {
				return '❌ Tidak aktif — chat ini belum menyewa bot';
			}
			if (rental.lifetime) {
				return '✅ Aktif — lifetime';
			}
			const days = Math.floor(rental.remainingMs / 86_400_000);
			const hours = Math.floor((rental.remainingMs % 86_400_000) / 3_600_000);
			const label = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
			return `${rental.trial ? '🎁 Trial' : '✅ Aktif'} — ${label} tersisa`;
		},
		/** Active rentals expiring within `withinMs`, soonest first. */
		getExpiring(withinMs) {
			const cutoff = now() + withinMs;
			return [...rentals]
				.filter(([, e]) => e.expiresAt !== 0 && !isExpired(e) && e.expiresAt <= cutoff)
				.map(([chat, e]) => ({ chat, expiresAt: e.expiresAt, remainingMs: e.expiresAt - now() }))
				.sort((a, b) => a.expiresAt - b.expiresAt);
		},
		/** JAP@Upgrade: owner overview of every active rental. */
		renderList({ title = '📋 *Daftar Sewa*' } = {}) {
			const rows = this.list();
			if (!rows.length) {
				return `${title}\n(tidak ada sewa aktif)`;
			}
			const lines = rows.map((r, i) => {
				const label = r.expiresAt === 0
					? 'lifetime'
					: `${Math.max(0, Math.ceil((r.expiresAt - now()) / 86_400_000))}d`;
				return `${i + 1}. ${r.chat.split('@')[0]} — ${r.trial ? '🎁 trial ' : ''}${label}`;
			});
			return `${title}\n${lines.join('\n')}`;
		},
		list() {
			return [...rentals]
				.filter(([, e]) => !isExpired(e))
				.map(([chat, e]) => ({ chat, expiresAt: e.expiresAt, trial: e.trial }));
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
			cbs.expire.add(cb);
			return () => cbs.expire.delete(cb);
		},
		/** Fires once per rental when it crosses the expiring threshold. */
		onExpiring(cb) {
			cbs.expiring.add(cb);
			return () => cbs.expiring.delete(cb);
		},
		onGrant(cb) {
			cbs.grant.add(cb);
			return () => cbs.grant.delete(cb);
		},
		get size() {
			return rentals.size;
		},
		toJSON() {
			return { entries: [...rentals], trialUsed: [...trialUsed] };
		},
		load(snapshot) {
			rentals.clear();
			trialUsed.clear();
			for (const [chat, entry] of snapshot?.entries || []) {
				rentals.set(chat, { ...entry });
			}
			for (const chat of snapshot?.trialUsed || []) {
				trialUsed.add(chat);
			}
		}
	};
};
