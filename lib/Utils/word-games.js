/**
 * Word games — the text-game toolbox: word scrambles, math problems and
 * the "sambung kata" word-chain game.
 *
 * ```js
 * import { scrambleWord, generateMathProblem, createWordChain } from '@japofc/baileys'
 *
 * scrambleWord('bandung')          // 'ngdnaub' (never returns the original)
 * generateMathProblem('hard')      // { question: '17 × 8 - 24 = ?', answer: '112' }
 *
 * const chain = createWordChain()
 * chain.start(chat, { firstWord: 'makan' })
 * chain.play(chat, userA, 'nasi')  // ✅ starts with 'n'
 * chain.play(chat, userA, 'ikan')  // ❌ not-your-turn (same user twice)
 * chain.play(chat, userB, 'topi')  // ❌ wrong-letter (needs 'i')
 * chain.onEnd(({ scores, longestWord }) => announce(scores))
 * ```
 */

/** Shuffle a word's letters — guaranteed different from the input. */
export const scrambleWord = (word, { random = Math.random } = {}) => {
	const s = String(word ?? '');
	if (s.length < 2 || new Set(s).size < 2) {
		return s; // impossible to scramble
	}
	const letters = [...s];
	let out = s;
	let guard = 0;
	while (out === s && guard++ < 50) {
		for (let i = letters.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[letters[i], letters[j]] = [letters[j], letters[i]];
		}
		out = letters.join('');
	}
	return out;
};

const OPS = {
	easy: [['+', (a, b) => a + b], ['-', (a, b) => a - b]],
	medium: [['+', (a, b) => a + b], ['-', (a, b) => a - b], ['×', (a, b) => a * b]],
	hard: [['×', (a, b) => a * b], ['+', (a, b) => a + b], ['-', (a, b) => a - b]]
};

/**
 * Random arithmetic problem: `{ question, answer }` (answer is a string —
 * feed it straight into createGuessGame).
 */
export const generateMathProblem = (difficulty = 'easy', { random = Math.random } = {}) => {
	const int = (max) => 1 + Math.floor(random() * max);
	const pick = (arr) => arr[Math.floor(random() * arr.length)];
	if (difficulty === 'easy') {
		const [symbol, fn] = pick(OPS.easy);
		const a = int(20);
		const b = int(20);
		const [x, y] = symbol === '-' && b > a ? [b, a] : [a, b];
		return { question: `${x} ${symbol} ${y} = ?`, answer: String(fn(x, y)) };
	}
	if (difficulty === 'medium') {
		const [symbol, fn] = pick(OPS.medium);
		const a = int(50);
		const b = symbol === '×' ? int(12) : int(50);
		const [x, y] = symbol === '-' && b > a ? [b, a] : [a, b];
		return { question: `${x} ${symbol} ${y} = ?`, answer: String(fn(x, y)) };
	}
	// hard: a × b ± c
	const a = int(20);
	const b = int(12);
	const c = int(30);
	const plus = random() < 0.5;
	return {
		question: `${a} × ${b} ${plus ? '+' : '-'} ${c} = ?`,
		answer: String(plus ? a * b + c : a * b - c)
	};
};

/** JAP@Upgrade: reveal the first `n` letters: hintFor('bandung', 3) → 'ban____'. */
export const hintFor = (word, n = 1, { maskChar = '_' } = {}) => {
	const s = String(word ?? '');
	const keep = Math.max(0, Math.min(n, s.length));
	return s.slice(0, keep) + maskChar.repeat(s.length - keep);
};

export const createWordChain = (options = {}) => {
	const {
		minLength = 3,
		/** Optional dictionary check: (word) => boolean | Promise<boolean>. */
		validateWord,
		now = () => Date.now()
	} = options;

	/** chat -> { lastWord, lastPlayer, used:Set, scores:Map, turns } */
	const games = new Map();
	const cbs = { word: new Set(), end: new Set() };

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	return {
		/** Start a round. `firstWord` seeds the chain. */
		start(chat, { firstWord = '' } = {}) {
			if (games.has(chat)) {
				throw new Error('a word chain is already running in this chat');
			}
			const seed = String(firstWord).toLowerCase().trim();
			games.set(chat, {
				lastWord: seed,
				lastPlayer: null,
				used: new Set(seed ? [seed] : []),
				scores: new Map(),
				turns: 0,
				startedAt: now()
			});
			return { chat, firstWord: seed, nextLetter: seed ? seed.slice(-1) : null };
		},
		/**
		 * Play a word. Returns `{ ok: true, nextLetter, score }` or
		 * `{ ok: false, reason }`: no-game / not-your-turn / too-short /
		 * wrong-letter / already-used / not-a-word.
		 */
		async play(chat, user, word) {
			const game = games.get(chat);
			if (!game) {
				return { ok: false, reason: 'no-game' };
			}
			if (game.lastPlayer === user) {
				return { ok: false, reason: 'not-your-turn' };
			}
			const clean = String(word ?? '').toLowerCase().trim();
			if (clean.length < minLength || !/^\p{L}+$/u.test(clean)) {
				return { ok: false, reason: 'too-short' };
			}
			if (game.lastWord && clean[0] !== game.lastWord.slice(-1)) {
				return { ok: false, reason: 'wrong-letter', expected: game.lastWord.slice(-1) };
			}
			if (game.used.has(clean)) {
				return { ok: false, reason: 'already-used' };
			}
			if (validateWord) {
				let valid = false;
				try {
					valid = await validateWord(clean);
				} catch {
					valid = false;
				}
				if (!valid) {
					return { ok: false, reason: 'not-a-word' };
				}
			}
			game.used.add(clean);
			game.lastWord = clean;
			game.lastPlayer = user;
			game.turns++;
			const score = (game.scores.get(user) || 0) + clean.length;
			game.scores.set(user, score);
			emit(cbs.word, { chat, user, word: clean, nextLetter: clean.slice(-1), score });
			return { ok: true, nextLetter: clean.slice(-1), score };
		},
		/** End the round. Returns scores sorted best-first. */
		end(chat) {
			const game = games.get(chat);
			if (!game) {
				return null;
			}
			games.delete(chat);
			const scores = [...game.scores]
				.map(([user, score]) => ({ user, score }))
				.sort((a, b) => b.score - a.score);
			const longestWord = [...game.used].sort((a, b) => b.length - a.length)[0] || null;
			const result = { chat, scores, turns: game.turns, longestWord, words: game.used.size };
			emit(cbs.end, result);
			return result;
		},
		isActive: (chat) => games.has(chat),
		getState(chat) {
			const game = games.get(chat);
			if (!game) {
				return null;
			}
			return {
				lastWord: game.lastWord,
				nextLetter: game.lastWord ? game.lastWord.slice(-1) : null,
				lastPlayer: game.lastPlayer,
				turns: game.turns,
				words: game.used.size
			};
		},
		onWord(cb) {
			cbs.word.add(cb);
			return () => cbs.word.delete(cb);
		},
		onEnd(cb) {
			cbs.end.add(cb);
			return () => cbs.end.delete(cb);
		},
		get size() {
			return games.size;
		}
	};
};
