/**
 * Marriage system — the beloved "nikah bot": propose, accept, divorce,
 * anniversaries.
 *
 * ```js
 * import { createMarriageRegistry } from '@japofc/baileys'
 *
 * const nikah = createMarriageRegistry()
 * nikah.propose(a, b)          // { ok: true } — pending until b answers
 * nikah.accept(b, a)           // { ok: true, marriedAt } 💍
 * nikah.getPartner(a)          // b
 * nikah.getMarriage(a)         // { partner, marriedAt, days }
 * nikah.divorce(a)             // { ok: true, partner: b, lastedDays }
 * nikah.renderCouples()        // 💕 list with day counts
 * ```
 *
 * Strictly monogamous: proposing while married (or to someone married)
 * is refused with a clear reason.
 */

export const createMarriageRegistry = (options = {}) => {
	const { proposalTtlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = options;

	/** user -> { partner, marriedAt } (stored on BOTH sides) */
	const marriages = new Map();
	/** `${from}:${to}` -> proposedAt */
	const proposals = new Map();
	const cbs = { married: new Set(), divorced: new Set() };

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const pruneProposals = () => {
		const cutoff = now() - proposalTtlMs;
		for (const [key, at] of proposals) {
			if (at < cutoff) {
				proposals.delete(key);
			}
		}
	};

	return {
		propose(from, to) {
			pruneProposals();
			if (from === to) {
				return { ok: false, reason: 'self' };
			}
			if (marriages.has(from)) {
				return { ok: false, reason: 'you-are-married' };
			}
			if (marriages.has(to)) {
				return { ok: false, reason: 'target-married' };
			}
			if (proposals.has(`${from}:${to}`)) {
				return { ok: false, reason: 'already-proposed' };
			}
			proposals.set(`${from}:${to}`, now());
			return { ok: true, expiresAt: now() + proposalTtlMs };
		},
		/** Accept a proposal FROM `from` — the order matters. */
		accept(user, from) {
			pruneProposals();
			if (!proposals.has(`${from}:${user}`)) {
				return { ok: false, reason: 'no-proposal' };
			}
			if (marriages.has(user) || marriages.has(from)) {
				proposals.delete(`${from}:${user}`);
				return { ok: false, reason: 'someone-married-meanwhile' };
			}
			proposals.delete(`${from}:${user}`);
			const marriedAt = now();
			// proposer inserted first so couples render '@proposer 💍 @accepter'
			marriages.set(from, { partner: user, marriedAt });
			marriages.set(user, { partner: from, marriedAt });
			emit(cbs.married, { a: from, b: user, marriedAt });
			return { ok: true, marriedAt };
		},
		reject(user, from) {
			return proposals.delete(`${from}:${user}`);
		},
		divorce(user) {
			const marriage = marriages.get(user);
			if (!marriage) {
				return { ok: false, reason: 'not-married' };
			}
			marriages.delete(user);
			marriages.delete(marriage.partner);
			const lastedDays = Math.floor((now() - marriage.marriedAt) / 86_400_000);
			emit(cbs.divorced, { a: user, b: marriage.partner, lastedDays });
			return { ok: true, partner: marriage.partner, lastedDays };
		},
		isMarried: (user) => marriages.has(user),
		getPartner: (user) => marriages.get(user)?.partner ?? null,
		getMarriage(user) {
			const marriage = marriages.get(user);
			if (!marriage) {
				return null;
			}
			return {
				partner: marriage.partner,
				marriedAt: marriage.marriedAt,
				days: Math.floor((now() - marriage.marriedAt) / 86_400_000)
			};
		},
		/** Every couple once (not twice), longest marriage first. */
		listCouples() {
			const seen = new Set();
			const couples = [];
			for (const [user, m] of marriages) {
				if (seen.has(user) || seen.has(m.partner)) {
					continue;
				}
				seen.add(user);
				seen.add(m.partner);
				couples.push({ a: user, b: m.partner, marriedAt: m.marriedAt, days: Math.floor((now() - m.marriedAt) / 86_400_000) });
			}
			return couples.sort((x, y) => x.marriedAt - y.marriedAt);
		},
		renderCouples({ title = '💕 *Pasangan*' } = {}) {
			const couples = this.listCouples();
			if (!couples.length) {
				return `${title}\n(belum ada yang menikah)`;
			}
			const lines = couples.map((c, i) =>
				`${i + 1}. @${c.a.split('@')[0]} 💍 @${c.b.split('@')[0]} — ${c.days} hari`);
			return `${title}\n${lines.join('\n')}`;
		},
		onMarried(cb) {
			cbs.married.add(cb);
			return () => cbs.married.delete(cb);
		},
		onDivorced(cb) {
			cbs.divorced.add(cb);
			return () => cbs.divorced.delete(cb);
		},
		get size() {
			return marriages.size / 2;
		},
		toJSON() {
			return { entries: [...marriages] };
		},
		load(snapshot) {
			marriages.clear();
			for (const [user, m] of snapshot?.entries || []) {
				marriages.set(user, { ...m });
			}
		}
	};
};
