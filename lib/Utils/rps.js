/**
 * RPS ("suit") — rock–paper–scissors duels: challenge someone, both pick
 * secretly, the reveal decides it. Indonesian aliases built in
 * (batu/gunting/kertas).
 *
 * ```js
 * import { createRPS } from '@japofc/baileys'
 *
 * const suit = createRPS()
 * suit.challenge(chat, challenger, opponent, { bet: 5000 })
 * suit.accept(chat, opponent)
 *
 * suit.pick(chat, challenger, 'batu')      // picks stay hidden
 * suit.pick(chat, opponent, 'scissors')    // second pick resolves the duel
 *
 * suit.onResult(({ winner, loser, draw, picks, bet }) =>
 *     draw ? rematch() : eco.transfer(loser, winner, bet))
 * ```
 */

const NORMALIZE = {
	rock: 'rock', batu: 'rock', '🪨': 'rock', '✊': 'rock',
	paper: 'paper', kertas: 'paper', '📄': 'paper', '✋': 'paper',
	scissors: 'scissors', gunting: 'scissors', '✂️': 'scissors', '✌️': 'scissors'
};

const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

/** Normalize any alias/emoji to 'rock'|'paper'|'scissors', or null. */
export const normalizeRpsChoice = (input) =>
	NORMALIZE[String(input ?? '').trim().toLowerCase()] ?? null;

export const createRPS = (options = {}) => {
	const { now = () => Date.now() } = options;

	/** chat -> duel { a, b, picks: Map, bet, pendingAccept, startedAt } */
	const duels = new Map();
	const resultCbs = new Set();

	const emit = (payload) => {
		for (const cb of resultCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const resolve = (chat, duel) => {
		duels.delete(chat);
		const pickA = duel.picks.get(duel.a);
		const pickB = duel.picks.get(duel.b);
		const picks = {
			[duel.a]: { choice: pickA, emoji: EMOJI[pickA] },
			[duel.b]: { choice: pickB, emoji: EMOJI[pickB] }
		};
		let result;
		if (pickA === pickB) {
			result = { chat, draw: true, winner: null, loser: null, picks, bet: duel.bet };
		} else {
			const aWins = BEATS[pickA] === pickB;
			result = {
				chat,
				draw: false,
				winner: aWins ? duel.a : duel.b,
				loser: aWins ? duel.b : duel.a,
				picks,
				bet: duel.bet
			};
		}
		emit(result);
		return result;
	};

	return {
		normalizeChoice: normalizeRpsChoice,
		challenge(chat, challenger, opponent, { bet = 0 } = {}) {
			if (duels.has(chat)) {
				throw new Error('a duel is already running in this chat');
			}
			if (challenger === opponent) {
				throw new Error('cannot challenge yourself');
			}
			duels.set(chat, {
				a: challenger,
				b: opponent,
				picks: new Map(),
				bet,
				pendingAccept: true,
				startedAt: now()
			});
			return { chat, challenger, opponent, bet };
		},
		accept(chat, user) {
			const duel = duels.get(chat);
			if (!duel || !duel.pendingAccept || duel.b !== user) {
				return false;
			}
			duel.pendingAccept = false;
			return true;
		},
		cancel(chat) {
			return duels.delete(chat);
		},
		/**
		 * Register a pick. Returns 'waiting' (first pick in),
		 * a result object (second pick resolves), or an 'invalid' string:
		 * 'no-duel' / 'not-accepted' / 'not-a-player' / 'bad-choice' /
		 * 'already-picked'.
		 */
		pick(chat, user, choice) {
			const duel = duels.get(chat);
			if (!duel) {
				return 'no-duel';
			}
			if (duel.pendingAccept) {
				return 'not-accepted';
			}
			if (user !== duel.a && user !== duel.b) {
				return 'not-a-player';
			}
			const normalized = normalizeRpsChoice(choice);
			if (!normalized) {
				return 'bad-choice';
			}
			if (duel.picks.has(user)) {
				return 'already-picked';
			}
			duel.picks.set(user, normalized);
			if (duel.picks.size === 2) {
				return resolve(chat, duel);
			}
			return 'waiting';
		},
		isActive: (chat) => duels.has(chat),
		getDuel(chat) {
			const duel = duels.get(chat);
			if (!duel) {
				return null;
			}
			return {
				a: duel.a,
				b: duel.b,
				bet: duel.bet,
				pendingAccept: duel.pendingAccept,
				picked: [...duel.picks.keys()] // WHO picked, never WHAT
			};
		},
		onResult(cb) {
			resultCbs.add(cb);
			return () => resultCbs.delete(cb);
		},
		get size() {
			return duels.size;
		}
	};
};
