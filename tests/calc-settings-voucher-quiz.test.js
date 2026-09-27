// Tests for the round: safe math eval + terbilang + Roman numerals,
// per-chat settings, voucher codes, quiz sessions, kv autoPersist glue,
// per-chat word-filter lists, optional flow steps and 3 new CLI commands.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as B from '../lib/index.js';

const makeEv = () => {
	const h = {};
	return {
		on: (e, f) => { (h[e] ||= []).push(f); },
		off: (e, f) => { h[e] = (h[e] || []).filter(x => x !== f); },
		emit: (e, p) => Promise.all((h[e] || []).map(f => f(p)))
	};
};

test('evaluateMath: precedence, parens, unary, right-assoc power, guards', () => {
	assert.equal(B.evaluateMath('2 + 3 * 4'), 14);
	assert.equal(B.evaluateMath('(1+2)^3 / 9'), 3);
	assert.equal(B.evaluateMath('10 % 3'), 1);
	assert.equal(B.evaluateMath('-5 + 3'), -2);
	assert.equal(B.evaluateMath('2 * (-3)'), -6);
	assert.equal(B.evaluateMath('1,5 + 0.5'), 2, 'comma decimals accepted');
	assert.equal(B.evaluateMath('2^3^2'), 512, 'power is right-associative');
	assert.throws(() => B.evaluateMath('1/0'), /division by zero/);
	assert.throws(() => B.evaluateMath('2+abc'), /unexpected character/);
	assert.throws(() => B.evaluateMath('(1+2'), /parentheses/);
	assert.throws(() => B.evaluateMath(''), /empty/);
	assert.throws(() => B.evaluateMath('1+'.repeat(150)), /too long/);
});

test('terbilang and Roman numerals', () => {
	assert.equal(B.terbilang(0), 'nol');
	assert.equal(B.terbilang(11), 'sebelas');
	assert.equal(B.terbilang(111), 'seratus sebelas');
	assert.equal(B.terbilang(1250), 'seribu dua ratus lima puluh');
	assert.equal(B.terbilang(2_500_000), 'dua juta lima ratus ribu');
	assert.equal(B.terbilang(-17), 'minus tujuh belas');
	assert.equal(B.toRoman(2026), 'MMXXVI');
	assert.equal(B.toRoman(3999), 'MMMCMXCIX');
	assert.equal(B.fromRoman('XIV'), 14);
	assert.equal(B.fromRoman('mmxxvi'), 2026);
	assert.throws(() => B.fromRoman('IIII'), /canonical/);
	assert.throws(() => B.toRoman(0), /1\.\.3999/);
});

test('chat settings: defaults, overrides, toggle, render, persistence', () => {
	const settings = B.createChatSettings({ defaults: { welcome: true, antilink: false, language: 'id' } });
	const changes = [];
	settings.onChange(c => changes.push(c.key));

	assert.equal(settings.isEnabled('g', 'welcome'), true, 'default applies');
	settings.set('g', 'antilink', true);
	assert.equal(settings.toggle('g', 'welcome'), false);
	assert.equal(settings.isEnabled('lain', 'welcome'), true, 'other chats untouched');
	assert.equal(settings.all('g').antilink, true);
	assert.deepEqual(Object.keys(settings.getOverrides('g')).sort(), ['antilink', 'welcome']);
	assert.ok(settings.render('g').includes('❌ welcome'));
	assert.ok(settings.render('g').includes('✅ antilink'));
	assert.throws(() => settings.get('g', 'ghost'), /unknown setting/);

	const restored = B.createChatSettings({ defaults: { welcome: true, antilink: false, language: 'id' } });
	restored.load(settings.toJSON());
	assert.equal(restored.isEnabled('g', 'antilink'), true);
	assert.equal(restored.reset('g', 'antilink'), true);
	assert.equal(restored.isEnabled('g', 'antilink'), false, 'reset falls back to default');
});

test('voucher manager: mint, redeem paths, revoke, prune', () => {
	let t = 0;
	const vouchers = B.createVoucherManager({ now: () => t });
	const { code } = vouchers.create({ payload: { balance: 50_000 }, maxUses: 2, expiresInMs: 1000 });
	assert.match(code, /^JAP-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/, 'unambiguous alphabet');

	const first = vouchers.redeem('a@s', code.toLowerCase());
	assert.equal(first.ok, true);
	assert.equal(first.payload.balance, 50_000);
	assert.equal(first.usesLeft, 1);
	assert.equal(vouchers.redeem('a@s', code).reason, 'already-redeemed');
	assert.equal(vouchers.redeem('b@s', code).ok, true);
	assert.equal(vouchers.redeem('c@s', code).reason, 'exhausted');

	t = 2000;
	const { code: expiring } = vouchers.create({ expiresInMs: 500 });
	t = 3000;
	assert.equal(vouchers.redeem('x@s', expiring).reason, 'expired');
	assert.equal(vouchers.redeem('x@s', 'JAP-ZZZZ-ZZZZ').reason, 'not-found');

	const { code: revoked } = vouchers.create({});
	vouchers.revoke(revoked);
	assert.equal(vouchers.redeem('x@s', revoked).reason, 'revoked');
	assert.equal(vouchers.getInfo(code).usesLeft, 0);
	assert.equal(vouchers.getInfo('nope'), null);
	assert.ok(vouchers.prune() >= 2);

	const restored = B.createVoucherManager({ now: () => t });
	restored.load(vouchers.toJSON());
	assert.equal(restored.size, vouchers.size, 'persistence roundtrip');
});

test('quiz session: sequential questions, scoring, skip, ranking', async () => {
	const sock = { ev: makeEv() };
	const quiz = B.createQuizSession({ perQuestionMs: 0 });
	quiz.bind(sock);
	const asked = [];
	const corrects = [];
	const skips = [];
	const ends = [];
	quiz.onQuestion(q => asked.push(`${q.index}/${q.total}`));
	quiz.onCorrect(c => corrects.push([c.user, c.points]));
	quiz.onTimeout(s => skips.push(!!s.skipped));
	quiz.onEnd(e => ends.push(e));

	quiz.start('c', [
		{ question: 'Ibukota Jepang?', answer: 'Tokyo', points: 15 },
		{ question: '2+2?', answer: 4 },
		{ question: 'sulit', answer: 'xyz' }
	]);
	assert.throws(() => quiz.start('c', [{ question: 'x', answer: 'y' }]), /already running/);

	const mk = (u, text) => ({ key: { remoteJid: 'c', id: `${Math.random()}`, participant: u }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [mk('a@s', 'salah')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('a@s', 'tokyo')] }); // case-insensitive, +15
	await sock.ev.emit('messages.upsert', { messages: [mk('b@s', '4')] }); // +10
	assert.equal(quiz.skip('c'), true); // Q3 → completed

	assert.deepEqual(asked, ['1/3', '2/3', '3/3']);
	assert.deepEqual(corrects, [['a@s', 15], ['b@s', 10]]);
	assert.deepEqual(skips, [true]);
	assert.equal(ends[0].ranking[0].user, 'a@s');
	assert.equal(ends[0].winner.score, 15);
	assert.equal(ends[0].reason, 'completed');
	assert.equal(quiz.isActive('c'), false);
	assert.throws(() => quiz.start('x', []), /at least one/);
	assert.equal(quiz.answer('ghost', 'u', 'x'), null);
});

test('kv autoPersist glue + per-chat word filter + optional flow steps', async () => {
	const db = await B.createKVStore();
	const eco = B.createEconomy();
	eco.add('u', 777);
	B.autoPersist(db.namespace('eco'), eco, { intervalMs: 60_000 })(); // stop = final flush
	const eco2 = B.createEconomy();
	const stop = B.autoPersist(db.namespace('eco'), eco2, { intervalMs: 60_000 });
	assert.equal(eco2.getBalance('u'), 777, 'state restored on attach');
	stop();
	assert.throws(() => B.autoPersist(db, {}), /toJSON/);

	const filter = B.createWordFilter({ words: ['global'] });
	filter.addChatWords('g@g.us', 'lokal', 'khusus');
	const hits = [];
	filter.onMatch(h => hits.push([h.chat, h.matched]));
	const mk = (chat, text) => ({ key: { remoteJid: chat, id: `${Math.random()}`, participant: 'u@s' }, message: { conversation: text } });
	await filter.handler({ messages: [mk('g@g.us', 'kata LOKAL nih'), mk('lain@g.us', 'kata lokal disini'), mk('lain@g.us', 'global everywhere')] });
	assert.equal(hits.length, 2, 'chat words only fire in their chat');
	assert.equal(hits[0][1], 'LOKAL');
	assert.equal(hits[1][1], 'global');
	filter.removeChatWords('g@g.us', 'lokal', 'khusus');
	assert.deepEqual(filter.getChatWords('g@g.us'), []);

	const sock = { ev: makeEv(), sendMessage: async () => ({}) };
	const flows = B.createConversationFlow({ timeoutMs: 0 });
	flows.define('reg', [
		{ id: 'nama', prompt: 'Nama?' },
		{ id: 'email', prompt: 'Email?', optional: true, default: '-' },
		{ id: 'kota', prompt: 'Kota?' }
	]);
	flows.bind(sock);
	const done = [];
	flows.onComplete(e => done.push(e.answers));
	await flows.start(sock, 'c', 'c', 'reg');
	const fmk = (t) => ({ key: { remoteJid: 'c', id: `${Math.random()}` }, message: { conversation: t } });
	await sock.ev.emit('messages.upsert', { messages: [fmk('Budi')] });
	await sock.ev.emit('messages.upsert', { messages: [fmk('LEWATI')] });
	await sock.ev.emit('messages.upsert', { messages: [fmk('Bandung')] });
	assert.deepEqual(done[0], { nama: 'Budi', email: '-', kota: 'Bandung' });
	await flows.start(sock, 'c', 'c', 'reg');
	await sock.ev.emit('messages.upsert', { messages: [fmk('skip')] });
	assert.equal(flows.getSession('c', 'c').answers.nama, 'skip', 'skip words only work on optional steps');
	flows.cancel('c', 'c');
});

test('CLI links / jid / backup commands', async () => {
	const cli = new URL('../lib/cli.js', import.meta.url).pathname;
	const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

	const links = JSON.parse(run('links', 'https://chat.whatsapp.com/AbCdEfGh1234567890'));
	assert.equal(links.type, 'group-invite');
	assert.equal(links.code, 'AbCdEfGh1234567890');

	const jid = run('jid', '+62 812-3456-7890');
	assert.ok(jid.includes('6281234567890@s.whatsapp.net'));
	assert.ok(jid.includes('+62 812-3456-7890'));
	assert.ok(jid.includes('https://wa.me/6281234567890'));

	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const dir = await mkdtemp(join(tmpdir(), 'jap-clibk-'));
	await writeFile(join(dir, 'creds.json'), '{"registered":true}');
	const out = join(tmpdir(), `jap-clibk-${Date.now()}.japbak`);
	const backup = run('backup', dir, out, '--password', 'rahasia');
	assert.ok(backup.includes('1 file(s)'));
	assert.ok(readFileSync(out, 'utf8').includes('JAPBACKUP1'));

	// missing password → non-zero exit
	assert.throws(() => execFileSync(process.execPath, [cli, 'backup', dir, out], { encoding: 'utf8', stdio: 'pipe' }));
});

test('barrel and type definitions export the round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	for (const mod of ['math-eval', 'chat-settings', 'voucher', 'quiz']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts`);
	}
	const kv = readFileSync(new URL('../lib/Utils/kv-store.d.ts', import.meta.url), 'utf8');
	assert.ok(kv.includes('autoPersist'));
	const wf = readFileSync(new URL('../lib/Utils/word-filter.d.ts', import.meta.url), 'utf8');
	assert.ok(wf.includes('addChatWords'));
	const flow = readFileSync(new URL('../lib/Utils/conversation-flow.d.ts', import.meta.url), 'utf8');
	assert.ok(flow.includes('optional?:') && flow.includes('skipWords'));
});
