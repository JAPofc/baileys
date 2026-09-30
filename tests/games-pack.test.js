// Tests for the games pack: TicTacToe, RPS ("suit"), word games (scramble,
// math problems, word chain), economy rob and the CLI `wa` command.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
	createTicTacToe,
	createRPS,
	normalizeRpsChoice,
	scrambleWord,
	generateMathProblem,
	createWordChain,
	createEconomy
} from '../lib/index.js';

// ---------------------------------------------------------------- tictactoe

test('tictactoe: challenge/accept flow, turns, win, draw, forfeit, render', () => {
	const ttt = createTicTacToe();
	const ends = [];
	ttt.onEnd(e => ends.push(e));

	ttt.challenge('c', 'A', 'B');
	assert.throws(() => ttt.challenge('c', 'X', 'Y'), /already running/);
	assert.throws(() => ttt.challenge('z', 'A', 'A'), /yourself/);
	assert.equal(ttt.play('c', 'A', 1).reason, 'no-game', 'pending games are not playable');
	assert.equal(ttt.accept('c', 'C'), false, 'only the challenged user may accept');
	assert.equal(ttt.accept('c', 'B'), true);

	assert.equal(ttt.play('c', 'B', 1).reason, 'not-your-turn', 'challenger (x) moves first');
	assert.equal(ttt.play('c', 'Z', 1).reason, 'not-a-player');
	assert.equal(ttt.play('c', 'A', 99).reason, 'bad-square');
	ttt.play('c', 'A', 1);
	ttt.play('c', 'B', 4);
	ttt.play('c', 'A', 2);
	assert.equal(ttt.play('c', 'B', 2).reason, 'taken');
	ttt.play('c', 'B', 5);
	const win = ttt.play('c', 'A', 3); // row 1-2-3
	assert.equal(win.status, 'win');
	assert.equal(win.winner, 'A');
	assert.equal(win.loser, 'B');
	assert.equal(ends.length, 1);
	assert.equal(ttt.isActive('c'), false);

	// draw
	ttt.challenge('d', 'A', 'B');
	ttt.accept('d', 'B');
	for (const [user, square] of [['A', 1], ['B', 2], ['A', 3], ['B', 5], ['A', 4], ['B', 7], ['A', 8], ['B', 9], ['A', 6]]) {
		ttt.play('d', user, square);
	}
	assert.equal(ends[1].status, 'draw');

	// render + forfeit
	ttt.challenge('e', 'A', 'B');
	assert.ok(ttt.render('e').includes('Waiting for @B'));
	ttt.accept('e', 'B');
	ttt.play('e', 'A', 5);
	const board = ttt.render('e');
	assert.ok(board.includes('❌') && board.includes('Turn: @B') && board.includes('1️⃣'));
	const forfeit = ttt.forfeit('e', 'A');
	assert.equal(forfeit.winner, 'B');
	assert.equal(forfeit.forfeit, true);
	assert.equal(ttt.forfeit('e', 'A'), null);
});

// ---------------------------------------------------------------------- rps

test('rps: aliases, hidden picks, resolution, draws, bets', () => {
	assert.equal(normalizeRpsChoice('BATU'), 'rock');
	assert.equal(normalizeRpsChoice('kertas'), 'paper');
	assert.equal(normalizeRpsChoice('✌️'), 'scissors');
	assert.equal(normalizeRpsChoice('ngawur'), null);

	const rps = createRPS();
	const results = [];
	rps.onResult(r => results.push(r));

	rps.challenge('c', 'A', 'B', { bet: 5000 });
	assert.throws(() => rps.challenge('c', 'X', 'Y'), /already running/);
	assert.equal(rps.pick('c', 'A', 'batu'), 'not-accepted');
	assert.equal(rps.accept('c', 'B'), true);
	assert.equal(rps.pick('c', 'X', 'batu'), 'not-a-player');
	assert.equal(rps.pick('c', 'A', 'apaan'), 'bad-choice');
	assert.equal(rps.pick('c', 'A', 'batu'), 'waiting');
	assert.equal(rps.pick('c', 'A', 'kertas'), 'already-picked');
	assert.deepEqual(rps.getDuel('c').picked, ['A'], 'reveals WHO picked, never WHAT');

	const result = rps.pick('c', 'B', 'gunting'); // rock beats scissors
	assert.equal(result.winner, 'A');
	assert.equal(result.loser, 'B');
	assert.equal(result.bet, 5000);
	assert.equal(result.picks.A.emoji, '🪨');
	assert.equal(results.length, 1);
	assert.equal(rps.isActive('c'), false);
	assert.equal(rps.pick('c', 'A', 'batu'), 'no-duel');

	rps.challenge('d', 'A', 'B');
	rps.accept('d', 'B');
	rps.pick('d', 'A', 'paper');
	const draw = rps.pick('d', 'B', 'kertas');
	assert.equal(draw.draw, true);
	assert.equal(draw.winner, null);
});

// --------------------------------------------------------------- word games

test('word games: scramble, math generation, word chain rules', async () => {
	const scrambled = scrambleWord('bandung');
	assert.notEqual(scrambled, 'bandung');
	assert.equal([...scrambled].sort().join(''), [...'bandung'].sort().join(''), 'same letters');
	assert.equal(scrambleWord('aa'), 'aa', 'unscrambleable words pass through');

	for (const difficulty of ['easy', 'medium', 'hard']) {
		const { question, answer } = generateMathProblem(difficulty);
		const evaluated = eval(question.replace('= ?', '').replace(/×/g, '*')); // fixture arithmetic only
		assert.equal(String(evaluated), answer, `${difficulty}: ${question} = ${answer}`);
	}
	assert.match(generateMathProblem('hard').question, /×/);

	const chain = createWordChain();
	const spoken = [];
	const ends = [];
	chain.onWord(w => spoken.push(w.word));
	chain.onEnd(e => ends.push(e));

	chain.start('c', { firstWord: 'makan' });
	assert.throws(() => chain.start('c', {}), /already running/);
	assert.equal((await chain.play('c', 'A', 'topi')).reason, 'wrong-letter');
	assert.equal((await chain.play('c', 'A', 'topi')).expected, 'n');
	assert.equal((await chain.play('c', 'A', 'nasi')).ok, true);
	assert.equal((await chain.play('c', 'A', 'ikan')).reason, 'not-your-turn');
	assert.equal((await chain.play('c', 'B', 'ikan')).ok, true);
	assert.equal((await chain.play('c', 'A', 'nasi')).reason, 'already-used');
	assert.equal((await chain.play('c', 'A', 'no')).reason, 'too-short');
	assert.deepEqual(spoken, ['nasi', 'ikan']);
	assert.equal(chain.getState('c').nextLetter, 'n');

	const result = chain.end('c');
	assert.equal(result.turns, 2);
	assert.equal(result.longestWord, 'makan');
	assert.equal(result.scores[0].score, 4);
	assert.equal(ends.length, 1);
	assert.equal(chain.end('c'), null);

	const strict = createWordChain({ validateWord: w => w !== 'zzz' });
	strict.start('d', {});
	assert.equal((await strict.play('d', 'A', 'zzz')).reason, 'not-a-word');
	assert.equal((await strict.play('d', 'A', 'kata')).ok, true);
});

// ------------------------------------------------------------- economy rob

test('economy rob: wallet-only theft, fines on failure, guards', () => {
	const lucky = createEconomy({ random: () => 0.2 }); // < 0.35 → success
	lucky.add('victim', 1000);
	lucky.add('thief', 100);
	const tx = [];
	lucky.onTransaction(t => tx.push(t.type));
	const heist = lucky.rob('thief', 'victim');
	assert.equal(heist.success, true);
	assert.equal(heist.amount, 60, 'floor(1000 * 0.3 * 0.2)');
	assert.equal(lucky.getBalance('thief'), 160);
	assert.equal(lucky.getBalance('victim'), 940);
	assert.deepEqual(tx, ['rob-success']);

	const unlucky = createEconomy({ random: () => 0.9 });
	unlucky.add('victim', 1000);
	unlucky.add('thief', 100);
	unlucky.deposit('victim', 500);
	const bust = unlucky.rob('thief', 'victim');
	assert.equal(bust.success, false);
	assert.ok(bust.amount > 0, 'fine charged');
	assert.equal(unlucky.getBalance('thief'), 100 - bust.amount);
	assert.equal(unlucky.getBankBalance('victim'), 500, 'bank money is untouchable');

	assert.throws(() => lucky.rob('a', 'a'), /yourself/);
	assert.throws(() => lucky.rob('thief', 'ghost'), /nothing to steal/);
});

// ------------------------------------------------------------ CLI + exports

test('CLI wa command prints package + baked WA versions', () => {
	const cli = new URL('../lib/cli.js', import.meta.url).pathname;
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	const out = execFileSync(process.execPath, [cli, 'wa'], { encoding: 'utf8' });
	assert.ok(out.includes(`@japofc/baileys v${pkg.version}`));
	assert.match(out, /WA Web client version: 2\.3000\.\d+/);
});

test('barrel and type definitions export the games pack', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['tictactoe', 'rps', 'word-games']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const eco = readFileSync(new URL('../lib/Utils/economy.d.ts', import.meta.url), 'utf8');
	assert.ok(eco.includes('rob(') && eco.includes('rob-success'));
	const cli = readFileSync(new URL('../lib/cli.js', import.meta.url), 'utf8');
	assert.ok(cli.includes("case 'wa'"));
});
