/**
 * Voucher manager — generate & redeem codes: giveaway prizes, balance
 * top-ups, premium grants ("!redeem JAP-X7K2-9QMD").
 *
 * ```js
 * import { createVoucherManager } from '@japofc/baileys'
 *
 * const vouchers = createVoucherManager()
 * const { code } = vouchers.create({ payload: { balance: 50_000 }, maxUses: 10, expiresInMs: 86_400_000 })
 * // 'JAP-X7K2-9QMD'
 *
 * const res = vouchers.redeem(user, code)
 * if (res.ok) eco.add(user, res.payload.balance, 'voucher')
 * // { ok: false, reason: 'expired' | 'exhausted' | 'already-redeemed' | 'not-found' | 'revoked' }
 *
 * vouchers.getInfo(code)      // uses left, expiry — never exposes who redeemed
 * ```
 *
 * One redeem per user per code (default). Codes use the unambiguous
 * Crockford alphabet (no 0/O/1/I confusion over voice or handwriting).
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const createVoucherManager = (options = {}) => {
	const {
		prefix = 'JAP',
		oncePerUser = true,
		random = Math.random,
		now = () => Date.now()
	} = options;

	/** code -> { payload, maxUses, uses, expiresAt, revoked, redeemedBy:Set, createdAt, note } */
	const vouchers = new Map();
	const redeemCbs = new Set();

	const emit = (payload) => {
		for (const cb of redeemCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const randomBlock = (n) =>
		Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');

	const generateCode = () => {
		for (let attempt = 0; attempt < 50; attempt++) {
			const code = `${prefix}-${randomBlock(4)}-${randomBlock(4)}`;
			if (!vouchers.has(code)) {
				return code;
			}
		}
		throw new Error('could not generate a unique code');
	};

	const normalize = (code) => String(code ?? '').toUpperCase().trim();

	return {
		/**
		 * Mint a voucher. `payload` is whatever your redeem handler needs
		 * (balance amount, tier name, item id…). Returns `{ code, expiresAt }`.
		 */
		create({ payload = {}, maxUses = 1, expiresInMs, note } = {}) {
			if (!Number.isInteger(maxUses) || maxUses < 1) {
				throw new Error('maxUses must be a positive integer');
			}
			const code = generateCode();
			const voucher = {
				payload,
				maxUses,
				uses: 0,
				expiresAt: expiresInMs ? now() + expiresInMs : 0,
				revoked: false,
				redeemedBy: new Set(),
				createdAt: now(),
				note
			};
			vouchers.set(code, voucher);
			return { code, expiresAt: voucher.expiresAt };
		},
		/** JAP@Upgrade: mint N codes with the same payload in one call. */
		createMany(count, options = {}) {
			if (!Number.isInteger(count) || count < 1 || count > 1000) {
				throw new Error('createMany count must be 1..1000');
			}
			return Array.from({ length: count }, () => this.create(options).code);
		},
		/**
		 * Redeem for a user. Returns `{ ok: true, payload, usesLeft }` or
		 * `{ ok: false, reason }` — never throws on user input.
		 */
		redeem(user, code) {
			const clean = normalize(code);
			const voucher = vouchers.get(clean);
			if (!voucher) {
				return { ok: false, reason: 'not-found' };
			}
			if (voucher.revoked) {
				return { ok: false, reason: 'revoked' };
			}
			if (voucher.expiresAt && voucher.expiresAt <= now()) {
				return { ok: false, reason: 'expired' };
			}
			if (voucher.uses >= voucher.maxUses) {
				return { ok: false, reason: 'exhausted' };
			}
			if (oncePerUser && voucher.redeemedBy.has(user)) {
				return { ok: false, reason: 'already-redeemed' };
			}
			voucher.uses++;
			voucher.redeemedBy.add(user);
			const result = {
				ok: true,
				payload: voucher.payload,
				usesLeft: voucher.maxUses - voucher.uses,
				code: clean
			};
			emit({ user, code: clean, payload: voucher.payload, usesLeft: result.usesLeft });
			return result;
		},
		/** Public info about a code (never exposes the redeemer list). */
		getInfo(code) {
			const voucher = vouchers.get(normalize(code));
			if (!voucher) {
				return null;
			}
			return {
				code: normalize(code),
				usesLeft: Math.max(0, voucher.maxUses - voucher.uses),
				maxUses: voucher.maxUses,
				expiresAt: voucher.expiresAt,
				expired: !!voucher.expiresAt && voucher.expiresAt <= now(),
				revoked: voucher.revoked,
				note: voucher.note
			};
		},
		revoke(code) {
			const voucher = vouchers.get(normalize(code));
			if (!voucher) {
				return false;
			}
			voucher.revoked = true;
			return true;
		},
		/** Drop expired + exhausted codes. Returns how many were removed. */
		prune() {
			let removed = 0;
			for (const [code, v] of vouchers) {
				if (v.revoked || (v.expiresAt && v.expiresAt <= now()) || v.uses >= v.maxUses) {
					vouchers.delete(code);
					removed++;
				}
			}
			return removed;
		},
		onRedeem(cb) {
			redeemCbs.add(cb);
			return () => redeemCbs.delete(cb);
		},
		get size() {
			return vouchers.size;
		},
		toJSON() {
			return {
				entries: [...vouchers].map(([code, v]) => [code, { ...v, redeemedBy: [...v.redeemedBy] }])
			};
		},
		load(snapshot) {
			vouchers.clear();
			for (const [code, v] of snapshot?.entries || []) {
				vouchers.set(code, { ...v, redeemedBy: new Set(v.redeemedBy || []) });
			}
		}
	};
};
