/**
 * TicTacToe — the classic XO duel every group bot ships: challenge,
 * accept, play by number, emoji board.
 *
 * ```js
 * import { createTicTacToe } from '@japofc/baileys'
 *
 * const ttt = createTicTacToe()
 * ttt.challenge(chat, challenger, opponent)   // waiting for accept
 * ttt.accept(chat, opponent)                  // game on — challenger is ❌
 *
 * const move = ttt.play(chat, user, 5)        // squares 1-9
 * // { status: 'next', board } | { status: 'win', winner } | { status: 'draw' }
 * // or 'invalid' reasons: not-your-turn / taken / no-game
 *
 * await sock.sendMessage(chat, { text: ttt.render(chat) })
 * // ❌⭕3️⃣
 * // 4️⃣❌6️⃣
 * // 7️⃣8️⃣❌
 *
 * ttt.onEnd(({ winner, loser, draw }) => payout(winner))
 * ```
 */

const LINES = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
	[0, 4, 8], [2, 4, 6] // diagonals
];

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

export const createTicTacToe = (options = {}) => {
	const { now = () => Date.now() } = options;

	/** chat -> game { x, o, board[9], turn, startedAt, pendingAccept } */
	const games = new Map();
	const endCbs = new Set();

	const emit = (payload) => {
		for (const cb of endCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const finish = (chat, result) => {
		games.delete(chat);
		emit({ chat, ...result });
		return result;
	};

	const winnerOf = (board) => {
		for (const [a, b, c] of LINES) {
			if (board[a] && board[a] === board[b] && board[b] === board[c]) {
				return board[a];
			}
		}
		return null;
	};

	return {
		/** Issue a challenge. The game starts when the opponent accepts. */
		challenge(chat, challenger, opponent) {
			if (games.has(chat)) {
				throw new Error('a game is already running in this chat');
			}
			if (challenger === opponent) {
				throw new Error('cannot challenge yourself');
			}
			games.set(chat, {
				x: challenger,
				o: opponent,
				board: Array(9).fill(null),
				turn: 'x',
				startedAt: now(),
				pendingAccept: true
			});
			return { chat, challenger, opponent };
		},
		/** Opponent accepts. Returns false for wrong user / no challenge. */
		accept(chat, user) {
			const game = games.get(chat);
			if (!game || !game.pendingAccept || game.o !== user) {
				return false;
			}
			game.pendingAccept = false;
			return true;
		},
		/** Decline or abandon. Fires onEnd({ cancelled: true }). */
		cancel(chat, reason = 'cancelled') {
			const game = games.get(chat);
			if (!game) {
				return false;
			}
			finish(chat, { cancelled: true, reason, x: game.x, o: game.o });
			return true;
		},
		/** Give up — the other player wins. */
		forfeit(chat, user) {
			const game = games.get(chat);
			if (!game || game.pendingAccept || (user !== game.x && user !== game.o)) {
				return null;
			}
			const winner = user === game.x ? game.o : game.x;
			return finish(chat, { status: 'win', winner, loser: user, forfeit: true });
		},
		/**
		 * Play square 1-9. Returns `{ status: 'next'|'win'|'draw', … }` or
		 * `{ status: 'invalid', reason }` — never throws mid-game.
		 */
		play(chat, user, square) {
			const game = games.get(chat);
			if (!game || game.pendingAccept) {
				return { status: 'invalid', reason: 'no-game' };
			}
			const mark = user === game.x ? 'x' : user === game.o ? 'o' : null;
			if (!mark) {
				return { status: 'invalid', reason: 'not-a-player' };
			}
			if (game.turn !== mark) {
				return { status: 'invalid', reason: 'not-your-turn' };
			}
			const index = square - 1;
			if (!Number.isInteger(index) || index < 0 || index > 8) {
				return { status: 'invalid', reason: 'bad-square' };
			}
			if (game.board[index]) {
				return { status: 'invalid', reason: 'taken' };
			}
			game.board[index] = mark;
			const winner = winnerOf(game.board);
			if (winner) {
				const winnerJid = winner === 'x' ? game.x : game.o;
				const loserJid = winner === 'x' ? game.o : game.x;
				return finish(chat, { status: 'win', winner: winnerJid, loser: loserJid, board: [...game.board] });
			}
			if (game.board.every(Boolean)) {
				return finish(chat, { status: 'draw', x: game.x, o: game.o, board: [...game.board] });
			}
			game.turn = game.turn === 'x' ? 'o' : 'x';
			return { status: 'next', turn: game.turn === 'x' ? game.x : game.o, board: [...game.board] };
		},
		/** Emoji board + whose turn. */
		render(chat) {
			const game = games.get(chat);
			if (!game) {
				return null;
			}
			const cell = (i) => (game.board[i] === 'x' ? '❌' : game.board[i] === 'o' ? '⭕' : NUMBER_EMOJI[i]);
			const rows = [0, 3, 6].map(r => `${cell(r)}${cell(r + 1)}${cell(r + 2)}`);
			const header = game.pendingAccept
				? `⏳ Waiting for @${String(game.o).split('@')[0]} to accept`
				: `Turn: @${String(game.turn === 'x' ? game.x : game.o).split('@')[0]} (${game.turn === 'x' ? '❌' : '⭕'})`;
			return [header, '', ...rows].join('\n');
		},
		isActive: (chat) => games.has(chat),
		getGame(chat) {
			const game = games.get(chat);
			return game ? { x: game.x, o: game.o, board: [...game.board], turn: game.turn, pendingAccept: game.pendingAccept } : null;
		},
		onEnd(cb) {
			endCbs.add(cb);
			return () => endCbs.delete(cb);
		},
		get size() {
			return games.size;
		}
	};
};
