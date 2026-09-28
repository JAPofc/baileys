// Tests for round: notes store, birthday manager, guess game engine, i18n,
// fancy text styler, join-request manager and the CLI sticker command.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createNotes,
	createBirthdayManager,
	createGuessGame,
	createI18n,
	styleText,
	listTextStyles,
	createJoinRequestManager,
	readStickerExif
} from '../lib/index.js';

const makeEv = () => {
	const handlers = {};
	return {
		on: (event, fn) => {
			(handlers[event] ||= []).push(fn);
		},
		off: (event, fn) => {
			handlers[event] = (handlers[event] || []).filter(f => f !== fn);
		},
		emit: (event, payload) => Promise.all((handlers[event] || []).map(fn => fn(payload)))
	};
};

// -------------------------------------------------------------------- notes

test('notes: set/get case-insensitive, search, rename, limits, persistence', () => {
	const notes = createNotes({ maxPerChat: 2 });
	notes.set('g@g.us', 'Rules', 'No spam here', 'adm@s.whatsapp.net');
	notes.set('g@g.us', 'link', { text: 'https://example.com' });
	assert.equal(notes.get('g@g.us', 'RULES').content, 'No spam here', 'names are case-insensitive');
	assert.equal(notes.get('g@g.us', 'rules').author, 'adm@s.whatsapp.net');
	assert.equal(notes.list('g@g.us').length, 2);
	assert.equal(notes.search('g@g.us', 'spam').length, 1);
	assert.deepEqual(notes.search('g@g.us', ''), []);
	assert.equal(notes.countIn('other@g.us'), 0);
	assert.throws(() => notes.set('g@g.us', 'third', 'x'), /limit/);
	assert.throws(() => notes.set('g@g.us', '  ', 'x'), /empty/);

	assert.equal(notes.rename('g@g.us', 'rules', 'peraturan'), true);
	assert.equal(notes.has('g@g.us', 'rules'), false);
	const restored = createNotes();
	restored.load(notes.toJSON());
	assert.equal(restored.get('g@g.us', 'peraturan').content, 'No spam here');
	assert.equal(restored.size, 2);
	assert.equal(restored.remove('g@g.us', 'link'), true);
	assert.equal(restored.size, 1);
});

// ----------------------------------------------------------------- birthday

test('birthday: today detection, once-per-year, upcoming list, persistence', () => {
	const fake = new Date('2026-09-27T08:00:00').getTime();
	const bdays = createBirthdayManager({ now: () => fake });
	bdays.set('a@s.whatsapp.net', { day: 27, month: 9, year: 2000, chat: 'g@g.us' });
	bdays.set('b@s.whatsapp.net', { day: 28, month: 9 });
	bdays.set('c@s.whatsapp.net', { day: 1, month: 1 });
	assert.throws(() => bdays.set('x', { day: 32, month: 1 }), /1-31/);

	const events = [];
	bdays.onBirthday(e => events.push(e));
	const fired = bdays.checkNow();
	assert.equal(fired.length, 1);
	assert.equal(fired[0].user, 'a@s.whatsapp.net');
	assert.equal(fired[0].age, 26);
	assert.equal(fired[0].chat, 'g@g.us');
	assert.equal(bdays.checkNow().length, 0, 'same year never fires twice');
	assert.equal(events.length, 1);
	assert.equal(bdays.getToday()[0].user, 'a@s.whatsapp.net');

	const upcoming = bdays.getUpcoming(2);
	assert.equal(upcoming.length, 2);
	assert.equal(upcoming[0].inDays, 0);
	assert.equal(upcoming[1].user, 'b@s.whatsapp.net');
	assert.equal(upcoming[1].inDays, 1);

	const restored = createBirthdayManager({ now: () => fake });
	restored.load(bdays.toJSON());
	assert.equal(restored.checkNow().length, 0, 'lastCelebratedYear survives persistence');
	assert.equal(restored.size, 3);
});

// --------------------------------------------------------------- guess game

test('guess game: rounds, case-insensitive wins, rewards, one per chat', async () => {
	const game = createGuessGame({ timeoutMs: 0 });
	const sock = { ev: makeEv() };
	game.bind(sock);
	const wins = [];
	const wrongs = [];
	game.onCorrect(w => wins.push(w));
	game.onWrong(w => wrongs.push(w.text));

	game.start('g@g.us', { answer: 'Jakarta', hint: 'ibukota', reward: 500 });
	assert.throws(() => game.start('g@g.us', { answer: 'x' }), /already running/);
	assert.throws(() => game.start('g@g.us2', {}), /answer/);

	const mk = (text, user) => ({ key: { remoteJid: 'g@g.us', id: `${Math.random()}`, participant: user }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [mk('Bandung', 'u1@s.whatsapp.net')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('  jakarta ', 'u2@s.whatsapp.net')] });
	assert.equal(wins.length, 1);
	assert.equal(wins[0].user, 'u2@s.whatsapp.net');
	assert.equal(wins[0].answer, 'Jakarta');
	assert.equal(wins[0].reward, 500);
	assert.equal(wins[0].attempts, 2);
	assert.deepEqual(wrongs, ['Bandung']);
	assert.equal(game.isActive('g@g.us'), false);

	game.start('dm@s.whatsapp.net', { answer: 'rahasia', hint: 'x' });
	const round = game.getRound('dm@s.whatsapp.net');
	assert.ok(!('answer' in round) && !('matchAnswer' in round), 'round info never leaks the answer');
	assert.equal(game.end('dm@s.whatsapp.net'), 'rahasia', 'end() reveals and clears');
	assert.equal(game.guess('dm@s.whatsapp.net', 'u@s', 'rahasia'), null, 'no round → null');
});

test('guess game: timeout reveals the answer', async () => {
	const game = createGuessGame({ timeoutMs: 100 });
	const timeouts = [];
	game.onTimeout(t => timeouts.push(t));
	game.start('g@g.us', { answer: '42', hint: 'everything' });
	await new Promise(r => setTimeout(r, 200));
	assert.equal(timeouts.length, 1);
	assert.equal(timeouts[0].answer, '42');
	assert.equal(game.size, 0);
});

// --------------------------------------------------------------------- i18n

test('i18n: dictionaries, interpolation, per-chat langs, fallbacks', () => {
	const i18n = createI18n({ defaultLang: 'en' });
	i18n.addLanguage('en', { greet: 'Hello {name}!', menu: { title: 'Menu' }, onlyEn: 'yes' });
	i18n.addLanguage('id', { greet: 'Halo {name}!', menu: { title: 'Menu Bot' } });

	assert.equal(i18n.t('greet', { name: 'Budi' }), 'Hello Budi!');
	assert.equal(i18n.t('menu.title', {}, 'id'), 'Menu Bot', 'nested keys flatten to dot-paths');
	assert.equal(i18n.t('greet', {}), 'Hello {name}!', 'missing vars left as-is');
	assert.equal(i18n.t('missing.key'), 'missing.key', 'falls back to the key');

	i18n.setChatLang('g@g.us', 'id');
	assert.equal(i18n.tFor('g@g.us', 'greet', { name: 'Budi' }), 'Halo Budi!');
	assert.equal(i18n.tFor('g@g.us', 'onlyEn'), 'yes', 'missing in id → default lang');
	assert.equal(i18n.getChatLang('g@g.us'), 'id');
	assert.equal(i18n.getChatLang('other@g.us'), 'en');
	assert.throws(() => i18n.setChatLang('x', 'fr'), /unknown language/);
	assert.deepEqual(i18n.getMissingKeys('id'), ['onlyEn']);

	const restored = createI18n();
	restored.load(i18n.toJSON());
	assert.equal(restored.tFor('g@g.us', 'greet', { name: 'X' }), 'Halo X!');
	assert.deepEqual(restored.getLanguages().sort(), ['en', 'id']);
});

// --------------------------------------------------------------- fancy text

test('fancy text: unicode restyling with pass-through for unknown chars', () => {
	const bold = styleText('Bot Menu 26', 'bold');
	const cps = [...bold].map(c => c.codePointAt(0).toString(16));
	assert.deepEqual(cps, ['1d5d5', '1d5fc', '1d601', '20', '1d5e0', '1d5f2', '1d5fb', '1d602', '20', '1d7ee', '1d7f2']);
	assert.equal(styleText('hello', 'smallcaps'), 'ʜᴇʟʟᴏ');
	assert.equal(styleText('AbZ', 'fullwidth'), 'ＡｂＺ');
	assert.equal(styleText('a1', 'circled'), 'ⓐ①', 'circled digits via special map');
	assert.equal([...styleText('BE', 'script')][0], '\u212c', 'script B uses the irregular code point');
	assert.equal(styleText('🔥 ok!', 'bold'), '🔥 \ud835\uddfc\ud835\uddf8!', 'emoji and punctuation pass through');
	assert.equal(styleText('abc', 'monospace'), '\ud835\ude8a\ud835\ude8b\ud835\ude8c');
	assert.equal(listTextStyles().length, 15); // + negativeSquared + boldFraktur + upsideDown
	assert.ok(listTextStyles().includes('smallcaps'));
	assert.throws(() => styleText('x', 'nope'), /unknown style/);
});

// ------------------------------------------------------------ join requests

test('join requests: allow/deny lists, manual routing, sweep, modes', async () => {
	const calls = [];
	const sock = {
		ev: makeEv(),
		groupRequestParticipantsUpdate: async (_jid, participants, action) => {
			calls.push([participants[0], action]);
			return [];
		},
		groupRequestParticipantsList: async () => [{ jid: 'allow@s.whatsapp.net' }, { jid: 'deny@s.whatsapp.net' }, { jid: 'baru@s.whatsapp.net' }]
	};
	const joins = createJoinRequestManager({
		mode: 'manual',
		allowlist: ['allow@s.whatsapp.net'],
		denylist: ['deny@s.whatsapp.net']
	});
	joins.bind(sock);
	const manual = [];
	const processed = [];
	joins.onRequest(r => manual.push(r.user));
	joins.onProcessed(p => processed.push(p.action));

	await sock.ev.emit('group.join-request', { id: 'g@g.us', participant: 'allow@s.whatsapp.net', action: 'created', method: 'invite_link' });
	await sock.ev.emit('group.join-request', { id: 'g@g.us', participant: 'deny@s.whatsapp.net', action: 'created' });
	await sock.ev.emit('group.join-request', { id: 'g@g.us', participant: 'unknown@s.whatsapp.net', action: 'created' });
	await sock.ev.emit('group.join-request', { id: 'g@g.us', participant: 'gone@s.whatsapp.net', action: 'revoked' });
	assert.deepEqual(calls, [['allow@s.whatsapp.net', 'approve'], ['deny@s.whatsapp.net', 'reject']]);
	assert.deepEqual(manual, ['unknown@s.whatsapp.net'], 'undecided go to onRequest; revoked ignored');
	assert.deepEqual(processed, ['approve', 'reject']);

	const sweep = await joins.sweep(sock, 'g@g.us');
	assert.deepEqual(sweep.approved, ['allow@s.whatsapp.net']);
	assert.deepEqual(sweep.rejected, ['deny@s.whatsapp.net']);
	assert.deepEqual(sweep.pending, ['baru@s.whatsapp.net']);
	assert.equal(joins.processedCount, 4);

	// manual approve() callback wiring (listeners are fire-and-forget:
	// capture the promise and await it explicitly)
	let approvePromise = null;
	const manual2 = createJoinRequestManager();
	manual2.onRequest((r) => {
		approvePromise = r.approve();
	});
	await manual2.handler({ id: 'g@g.us', participant: 'x@s.whatsapp.net', action: 'created' }, sock);
	assert.equal(await approvePromise, true);
	assert.equal(calls[calls.length - 1][1], 'approve');

	assert.equal(createJoinRequestManager({ mode: 'approve-all' }).decide('anyone'), 'approve');
	assert.equal(createJoinRequestManager({ mode: 'reject-all' }).decide('anyone'), 'reject');
	// denylist beats approve-all
	assert.equal(createJoinRequestManager({ mode: 'approve-all', denylist: ['bad@s'] }).decide('bad@s'), 'reject');
});

// ---------------------------------------------------------------- CLI + exports

test('CLI sticker command brands a webp end-to-end', () => {
	const input = join(tmpdir(), `jap-cli-test-${Date.now()}.webp`);
	const output = join(tmpdir(), `jap-cli-test-out-${Date.now()}.webp`);
	// minimal 1x1 VP8L webp
	const vp8l = Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00]);
	const chunk = Buffer.concat([Buffer.from('VP8L'), Buffer.from([5, 0, 0, 0]), vp8l, Buffer.from([0])]);
	const body = Buffer.concat([Buffer.from('WEBP'), chunk]);
	writeFileSync(input, Buffer.concat([Buffer.from('RIFF'), Buffer.from([body.length, 0, 0, 0]), body]));

	const stdout = execFileSync(process.execPath, [
		new URL('../lib/cli.js', import.meta.url).pathname,
		'sticker', input, output, '--pack', 'CLI Pack', '--author', 'japofc', '--emoji', '🔥'
	], { encoding: 'utf8' });
	assert.ok(stdout.includes('CLI Pack'));

	const meta = readStickerExif(readFileSync(output));
	assert.equal(meta['sticker-pack-name'], 'CLI Pack');
	assert.equal(meta['sticker-pack-publisher'], 'japofc');
	assert.deepEqual(meta.emojis, ['🔥']);

	// invalid input → non-zero exit
	assert.throws(() => execFileSync(process.execPath, [
		new URL('../lib/cli.js', import.meta.url).pathname, 'sticker', input + '.missing'
	], { encoding: 'utf8', stdio: 'pipe' }));
});

test('barrel and type definitions export the new modules', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['notes', 'birthday', 'guess-game', 'i18n', 'fancy-text', 'join-requests']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const cli = readFileSync(new URL('../lib/cli.js', import.meta.url), 'utf8');
	assert.ok(cli.includes("case 'sticker'"), 'CLI has the sticker command');
	assert.ok(cli.includes('sticker <in.webp>'), 'CLI help documents it');
});
