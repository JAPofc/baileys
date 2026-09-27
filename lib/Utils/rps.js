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
		const pickA = duel.picks.get(duel.a);
		const pickB = duel.picks.get(duel.b);
		const picks = {
			[duel.a]: { choice: pickA, emoji: EMOJI[pickA] },
			[duel.b]: { choice: pickB, emoji: EMOJI[pickB] }
		};
		// JAP@Upgrade: best-of-N series — draws replay the round.
		const roundResult = pickA === pickB
			? { draw: true, winner: null, loser: null }
			: BEATS[pickA] === pickB
				? { draw: false, winner: duel.a, loser: duel.b }
				: { draw: false, winner: duel.b, loser: duel.a };
		if (!roundResult.draw) {
			duel.score[roundResult.winner]++;
		}
		const need = Math.ceil(duel.rounds / 2);
		const seriesOver = duel.score[duel.a] >= need || duel.score[duel.b] >= need;
		duel.picks = new Map();
		if (!seriesOver) {
			duel.round++;
			const result = {
				chat,
				...roundResult,
				picks,
				bet: duel.bet,
				series: { round: duel.round - 1, of: duel.rounds, score: { ...duel.score }, over: false }
			};
			emit(result);
			return result;
		}
		duels.delete(chat);
		const seriesWinner = duel.score[duel.a] >= need ? duel.a : duel.b;
		const result = {
			chat,
			draw: false,
			winner: seriesWinner,
			loser: seriesWinner === duel.a ? duel.b : duel.a,
			lastRound: roundResult,
			picks,
			bet: duel.bet,
			series: { round: duel.round, of: duel.rounds, score: { ...duel.score }, over: true }
		};
		emit(result);
		return result;
	};

	return {
		normalizeChoice: normalizeRpsChoice,
		challenge(chat, challenger, opponent, { bet = 0, rounds = 1 } = {}) {
			if (duels.has(chat)) {
				throw new Error('a duel is already running in this chat');
			}
			if (challenger === opponent) {
				throw new Error('cannot challenge yourself');
			}
			if (!Number.isInteger(rounds) || rounds < 1 || rounds % 2 === 0) {
				throw new Error('rounds must be an odd positive integer (1, 3, 5, …)');
			}
			duels.set(chat, {
				a: challenger,
				b: opponent,
				picks: new Map(),
				bet,
				rounds,
				score: { [challenger]: 0, [opponent]: 0 },
				round: 1,
				pendingAccept: true,
				startedAt: now()
			});
			return { chat, challenger, opponent, bet, rounds };
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
				rounds: duel.rounds,
				round: duel.round,
				score: { ...duel.score },
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
