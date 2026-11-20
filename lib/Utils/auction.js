/**
 * Auction ("lelang") — timed bidding rounds in a chat with minimum
 * increments and anti-snipe extensions.
 *
 * ```js
 * import { createAuction } from '@japofc/baileys'
 *
 * const auction = createAuction()
 * auction.start(chat, {
 *     item: 'Akun ML Sultan',
 *     startBid: 50_000,
 *     minIncrement: 5_000,
 *     durationMs: 10 * 60_000,
 *     antiSnipeMs: 30_000            // late bids extend the clock
 * })
 *
 * const bid = auction.bid(chat, user, 60_000)
 * // { accepted: true, amount, leader } or { accepted: false, reason, minNext }
 *
 * auction.onOutbid(({ user, by, amount }) => notify(user, `outbid! now ${amount}`))
 * auction.onEnd(({ item, winner, amount }) =>
 *     sock.sendMessage(chat, { text: winner ? `🔨 SOLD: ${item} → @${winner.split('@')[0]} (${amount})` : 'No bids 😢', mentions: winner ? [winner] : [] }))
 *
 * auction.render(chat)   // live status card
 * ```
 */

export const createAuction = (options = {}) => {
	const { now = () => Date.now() } = options;

	/** chat -> round */
	const rounds = new Map();
	const history = [];
	const cbs = { bid: new Set(), outbid: new Set(), end: new Set() };

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the auction
			}
		}
	};

	const finish = (chat, reason) => {
		const round = rounds.get(chat);
		if (!round) {
			return null;
		}
		if (round.timer) {
			clearTimeout(round.timer);
		}
		rounds.delete(chat);
		const result = {
			chat,
			item: round.item,
			winner: round.leader || null,
			amount: round.leader ? round.currentBid : null,
			bids: round.bidCount,
			reason
		};
		history.push(result);
		while (history.length > 50) {
			history.shift();
		}
		emit(cbs.end, result);
		return result;
	};

	const armTimer = (chat, round) => {
		if (round.timer) {
			clearTimeout(round.timer);
		}
		const delay = Math.max(0, round.endsAt - now());
		round.timer = setTimeout(() => finish(chat, 'deadline'), delay);
		if (round.timer.unref) {
			round.timer.unref();
		}
	};

	return {
		/** Open an auction. Throws when one is already running in the chat. */
		start(chat, { item = '🎁', startBid = 0, minIncrement = 1, buyNow = 0, durationMs = 10 * 60_000, antiSnipeMs = 0, startedBy } = {}) {
			if (rounds.has(chat)) {
				throw new Error('an auction is already running in this chat');
			}
			const round = {
				item,
				startBid,
				minIncrement,
				buyNow,
				antiSnipeMs,
				currentBid: null,
				leader: null,
				bidCount: 0,
				startedAt: now(),
				endsAt: now() + durationMs,
				startedBy,
				timer: null
			};
			rounds.set(chat, round);
			armTimer(chat, round);
			return { chat, item, startBid, minIncrement, endsAt: round.endsAt };
		},
		/**
		 * Place a bid. Returns `{ accepted, amount?, leader?, extended?,
		 * reason?, minNext? }` — never throws on a bad bid.
		 */
		bid(chat, user, amount) {
			const round = rounds.get(chat);
			if (!round) {
				return { accepted: false, reason: 'no-auction' };
			}
			const minNext = round.currentBid === null
				? round.startBid
				: round.currentBid + round.minIncrement;
			if (!Number.isFinite(amount) || amount < minNext) {
				return { accepted: false, reason: 'too-low', minNext };
			}
			if (round.leader === user) {
				return { accepted: false, reason: 'already-leading', minNext };
			}
			const previousLeader = round.leader;
			round.currentBid = amount;
			round.leader = user;
			round.bidCount++;
			// JAP@Upgrade: buy-now price ends the auction instantly.
			if (round.buyNow && amount >= round.buyNow) {
				emit(cbs.bid, { chat, user, amount, extended: false, buyNow: true });
				if (previousLeader) {
					emit(cbs.outbid, { chat, user: previousLeader, by: user, amount });
				}
				const result = finish(chat, 'buy-now');
				return { accepted: true, amount, leader: user, extended: false, buyNow: true, result };
			}
			let extended = false;
			// anti-snipe: bids near the deadline push it out
			if (round.antiSnipeMs && round.endsAt - now() < round.antiSnipeMs) {
				round.endsAt = now() + round.antiSnipeMs;
				armTimer(chat, round);
				extended = true;
			}
			emit(cbs.bid, { chat, user, amount, extended });
			if (previousLeader) {
				emit(cbs.outbid, { chat, user: previousLeader, by: user, amount });
			}
			return { accepted: true, amount, leader: user, extended };
		},
		/** Hammer down now. Returns the result, or null. */
		end(chat) {
			return finish(chat, 'manual');
		},
		cancel(chat) {
			const round = rounds.get(chat);
			if (!round) {
				return false;
			}
			if (round.timer) {
				clearTimeout(round.timer);
			}
			rounds.delete(chat);
			return true;
		},
		isActive: (chat) => rounds.has(chat),
		getStatus(chat) {
			const round = rounds.get(chat);
			if (!round) {
				return null;
			}
			return {
				item: round.item,
				currentBid: round.currentBid,
				leader: round.leader,
				minNext: round.currentBid === null ? round.startBid : round.currentBid + round.minIncrement,
				bids: round.bidCount,
				endsAt: round.endsAt,
				remainingMs: Math.max(0, round.endsAt - now())
			};
		},
		/** Ready-to-send live card. */
		render(chat) {
			const status = this.getStatus(chat);
			if (!status) {
				return null;
			}
			return [
				`🔨 *LELANG: ${status.item}*`,
				status.leader
					? `Tertinggi: ${status.currentBid} — @${String(status.leader).split('@')[0]}`
					: `Buka mulai: ${status.minNext}`,
				`Bid berikutnya: ≥ ${status.minNext}`,
				`Sisa waktu: ${Math.ceil(status.remainingMs / 60_000)} min · ${status.bids} bid`
			].join('\n');
		},
		/** JAP@Upgrade: last N finished auctions, newest first. */
		getHistory(limit = 10) {
			return history.slice(-limit).reverse().map(r => ({ ...r }));
		},
		onBid(cb) {
			cbs.bid.add(cb);
			return () => cbs.bid.delete(cb);
		},
		onOutbid(cb) {
			cbs.outbid.add(cb);
			return () => cbs.outbid.delete(cb);
		},
		onEnd(cb) {
			cbs.end.add(cb);
			return () => cbs.end.delete(cb);
		},
		get size() {
			return rounds.size;
		}
	};
};
