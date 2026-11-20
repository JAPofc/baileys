// Tests for the pure-JS sticker EXIF muxer (node-webpmux dependency removed),
// the router guard upgrade, and the second community pack: economy,
// group scheduler and member verifier.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	isWebP,
	parseWebPChunks,
	getWebPDimensions,
	buildStickerExif,
	readStickerExif,
	setStickerExif,
	createEconomy,
	createGroupScheduler,
	createVerifier,
	createRouter
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

/** Minimal 1x1 lossless WebP (VP8L) for container tests. */
const makeTinyWebP = () => {
	const vp8l = Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00]); // sig + w-1=0, h-1=0
	const chunk = Buffer.concat([Buffer.from('VP8L'), Buffer.from([5, 0, 0, 0]), vp8l, Buffer.from([0])]);
	const body = Buffer.concat([Buffer.from('WEBP'), chunk]);
	return Buffer.concat([Buffer.from('RIFF'), Buffer.from([body.length, 0, 0, 0]), body]);
};

// ------------------------------------------------------------- sticker exif

test('sticker exif: write + read roundtrip on a plain VP8L webp', () => {
	const webp = makeTinyWebP();
	assert.equal(isWebP(webp), true);
	assert.equal(isWebP(Buffer.from('not a webp')), false);
	assert.deepEqual(getWebPDimensions(webp), { width: 1, height: 1 });
	assert.equal(readStickerExif(webp), null, 'no EXIF before writing');

	const branded = setStickerExif(webp, { packName: 'JAP Pack', author: 'japofc', emojis: ['🔥'] });
	const meta = readStickerExif(branded);
	assert.equal(meta['sticker-pack-name'], 'JAP Pack');
	assert.equal(meta['sticker-pack-publisher'], 'japofc');
	assert.deepEqual(meta.emojis, ['🔥']);
	assert.match(meta['sticker-pack-id'], /^com\.jap\.sticker\./);

	const ids = parseWebPChunks(branded).map(c => c.id);
	assert.equal(ids[0], 'VP8X', 'VP8X synthesized as the first chunk');
	assert.ok(ids.includes('VP8L') && ids.includes('EXIF'));
	const vp8x = parseWebPChunks(branded).find(c => c.id === 'VP8X');
	assert.ok(vp8x.payload[0] & 0x08, 'EXIF flag set');
	assert.equal(vp8x.payload.length, 10);
	assert.equal(branded.readUInt32LE(4), branded.length - 8, 'RIFF size correct');
	assert.equal(readStickerExif(makeTinyWebP()), null, 'input buffer untouched');
});

test('sticker exif: replaces existing EXIF, accepts prebuilt payloads, keeps one VP8X', () => {
	const first = setStickerExif(makeTinyWebP(), { packName: 'First' });
	const second = setStickerExif(first, { packName: 'Second' });
	const chunks = parseWebPChunks(second);
	assert.equal(chunks.filter(c => c.id === 'EXIF').length, 1, 'old EXIF replaced, not duplicated');
	assert.equal(chunks.filter(c => c.id === 'VP8X').length, 1, 'VP8X not duplicated');
	assert.equal(readStickerExif(second)['sticker-pack-name'], 'Second');

	const viaBuffer = setStickerExif(makeTinyWebP(), buildStickerExif({ packName: 'Raw', packId: 'custom.id' }));
	const meta = readStickerExif(viaBuffer);
	assert.equal(meta['sticker-pack-name'], 'Raw');
	assert.equal(meta['sticker-pack-id'], 'custom.id');
	assert.throws(() => setStickerExif(Buffer.from('junk'), { packName: 'x' }), /WebP/);
});

test('sticker exif: MediaManager and dependency cleanup source contract', () => {
	const mm = readFileSync(new URL('../lib/Framework/MediaManager.js', import.meta.url), 'utf8');
	assert.ok(mm.includes("import('../Utils/sticker-exif.js')"), 'MediaManager uses the pure-JS muxer');
	assert.ok(!mm.includes("import('node-webpmux')"), 'node-webpmux import removed');
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	const all = JSON.stringify(pkg);
	assert.ok(!all.includes('node-webpmux'), 'node-webpmux gone from package.json');
	const doctor = readFileSync(new URL('../lib/Utils/doctor.js', import.meta.url), 'utf8');
	assert.ok(!doctor.includes('node-webpmux'), 'doctor no longer lists it as an optional unlock');
});

// ------------------------------------------------------------ router guards

test('router guards: adminOnly, ownerOnly, cooldown, groupOnly/dmOnly', async () => {
	const denied = [];
	const ran = [];
	const meta = { participants: [{ id: 'adm@s.whatsapp.net', admin: 'admin' }, { id: 'usr@s.whatsapp.net', admin: null }] };
	const sock = { groupMetadata: async () => meta, sendMessage: async () => ({}) };
	const router = createRouter({
		prefix: '!',
		owners: ['boss@s.whatsapp.net'],
		onDenied: (_ctx, d) => denied.push(d.reason)
	});
	router.command('kick', () => ran.push('kick'), { adminOnly: true });
	router.command('shutdown', () => ran.push('shutdown'), { ownerOnly: true });
	router.command('daily', () => ran.push('daily'), { cooldownMs: 60_000 });
	router.command('private', () => ran.push('private'), { dmOnly: true });
	router.command('tagall', () => ran.push('tagall'), { groupOnly: true });

	const mk = (text, participant, jid = 'g@g.us') => ({
		key: { remoteJid: jid, participant, id: `${Math.random()}` },
		message: { conversation: text }
	});
	assert.equal(await router.handle(sock, mk('!kick x', 'usr@s.whatsapp.net')), true, 'denied still counts as handled');
	await router.handle(sock, mk('!kick x', 'adm@s.whatsapp.net'));
	await router.handle(sock, mk('!shutdown', 'usr@s.whatsapp.net'));
	await router.handle(sock, mk('!shutdown', 'boss:3@s.whatsapp.net')); // device suffix tolerated
	await router.handle(sock, mk('!daily', 'usr@s.whatsapp.net'));
	await router.handle(sock, mk('!daily', 'usr@s.whatsapp.net'));
	await router.handle(sock, mk('!private', 'usr@s.whatsapp.net'));
	await router.handle(sock, mk('!private', undefined, 'dm@s.whatsapp.net'));
	await router.handle(sock, mk('!tagall', undefined, 'dm@s.whatsapp.net'));

	assert.deepEqual(ran, ['kick', 'shutdown', 'daily', 'private']);
	assert.deepEqual(denied, ['adminOnly', 'ownerOnly', 'cooldown', 'dmOnly', 'groupOnly']);
});

test('router help menu groups by category and badges guarded commands', async () => {
	const sent = [];
	const sock = { groupMetadata: async () => ({ participants: [] }), sendMessage: async (_jid, content) => sent.push(content.text) };
	const router = createRouter({ prefix: '!' });
	router.command('kick', () => { }, { adminOnly: true, category: 'Admin', desc: 'Kick a member' });
	router.command('daily', () => { }, { category: 'Economy' });
	await router.handle(sock, { key: { remoteJid: 'dm@s.whatsapp.net', id: '1' }, message: { conversation: '!help' } });
	assert.equal(sent.length, 1);
	assert.ok(sent[0].includes('*Admin*'));
	assert.ok(sent[0].includes('*Economy*'));
	assert.ok(sent[0].includes('🛡️'), 'admin badge shown');
	assert.ok(sent[0].includes('Kick a member'));
	const listed = router.list().find(c => c.names[0] === 'kick');
	assert.equal(listed.category, 'Admin');
	assert.equal(listed.adminOnly, true);
});

// ----------------------------------------------------------------- economy

test('economy: balances, transfers with fees, insufficient funds', () => {
	const eco = createEconomy();
	eco.add('a@s.whatsapp.net', 500, 'seed');
	assert.equal(eco.getBalance('a@s.whatsapp.net'), 500);
	assert.equal(eco.getBalance('ghost@s.whatsapp.net'), 0);
	assert.equal(eco.has('a@s.whatsapp.net', 500), true);

	const tx = [];
	eco.onTransaction(t => tx.push(t.type));
	const result = eco.transfer('a@s.whatsapp.net', 'b@s.whatsapp.net', 200);
	assert.deepEqual(result, { sent: 200, fee: 0 });
	assert.equal(eco.getBalance('b@s.whatsapp.net'), 200);
	assert.throws(() => eco.deduct('b@s.whatsapp.net', 999), /insufficient/);
	assert.throws(() => eco.transfer('a@s.whatsapp.net', 'a@s.whatsapp.net', 10), /yourself/);
	assert.deepEqual(tx, ['transfer']);

	const feeEco = createEconomy({ transferFee: 0.1 });
	feeEco.add('x', 110);
	assert.deepEqual(feeEco.transfer('x', 'y', 100), { sent: 100, fee: 10 });
	assert.equal(feeEco.getBalance('x'), 0, 'fee charged to sender');
	assert.throws(() => feeEco.transfer('y', 'x', 100), /insufficient/, 'fee counted in funds check');
	assert.equal(feeEco.getLeaderboard(1)[0].user, 'y');
});

test('economy: daily rewards, streaks, grace window and persistence', () => {
	let t = 0;
	const eco = createEconomy({ dailyAmount: 100, dailyCooldownMs: 1000, streakBonus: 10, now: () => t });
	const first = eco.claimDaily('u');
	assert.equal(first.claimed, true, 'brand-new account can claim at t=0');
	assert.equal(first.amount, 100);
	assert.equal(first.streak, 1);
	t += 500;
	const early = eco.claimDaily('u');
	assert.equal(early.claimed, false);
	assert.equal(early.remainingMs, 500);
	t += 600;
	const second = eco.claimDaily('u');
	assert.equal(second.streak, 2);
	assert.equal(second.amount, 110, 'streak bonus applied');

	const restored = createEconomy({ now: () => t });
	restored.load(eco.toJSON());
	assert.equal(restored.getBalance('u'), eco.getBalance('u'));
	assert.equal(restored.getStreak('u'), 2);

	let t2 = 1_000_000;
	const strict = createEconomy({ dailyAmount: 100, dailyCooldownMs: 1000, streakGraceMs: 500, streakBonus: 10, now: () => t2 });
	strict.claimDaily('u');
	t2 += 5000; // way past cooldown + grace
	const late = strict.claimDaily('u');
	assert.equal(late.streak, 1, 'missed grace window resets the streak');
	assert.equal(late.amount, 100);
});

// --------------------------------------------------------- group scheduler

test('group scheduler: fires due rules once, advances to the next day', async () => {
	let fake = new Date('2026-09-27T21:59:00').getTime();
	const scheduler = createGroupScheduler({ now: () => fake });
	const calls = [];
	const sock = { groupSettingUpdate: async (jid, setting) => calls.push([jid, setting]) };
	const actions = [];
	scheduler.onAction(a => actions.push(a.action));

	scheduler.add({ group: 'g@g.us', action: 'close', at: '22:00' });
	scheduler.add({ group: 'g@g.us', action: 'open', at: '06:00' });
	assert.equal(scheduler.size, 2);

	await scheduler.tick(sock);
	assert.equal(calls.length, 0, 'nothing due yet');
	fake = new Date('2026-09-27T22:00:30').getTime();
	await scheduler.tick(sock);
	await scheduler.tick(sock);
	assert.equal(calls.length, 1, 'due rule fires exactly once');
	assert.deepEqual(calls[0], ['g@g.us', 'announcement']);
	assert.deepEqual(actions, ['close']);
	fake = new Date('2026-09-28T06:00:10').getTime();
	await scheduler.tick(sock);
	assert.deepEqual(calls[1], ['g@g.us', 'not_announcement']);
	assert.ok(scheduler.list().every(rule => rule.nextRun > fake), 'rules rescheduled into the future');
});

test('group scheduler: day filters, validation, error surfacing', async () => {
	const sunday = new Date('2026-09-27T12:00:00');
	assert.equal(sunday.getDay(), 0, 'fixture sanity: 2026-09-27 is a Sunday');
	const scheduler = createGroupScheduler({ now: () => sunday.getTime() });
	scheduler.add({ group: 'g@g.us', action: 'close', at: '13:00', days: [5] });
	assert.equal(new Date(scheduler.list()[0].nextRun).getDay(), 5, 'skips to the next Friday');

	assert.throws(() => scheduler.add({ group: 'g@g.us', action: 'close', at: '25:00' }), /invalid time/);
	assert.throws(() => scheduler.add({ group: 'g@g.us', action: 'nuke', at: '10:00' }), /action/);
	assert.throws(() => scheduler.add({ group: 'g@g.us', action: 'open', at: '10:00', days: [] }), /days/);

	let fake = new Date('2026-09-27T09:59:00').getTime();
	const failing = createGroupScheduler({ now: () => fake });
	const errors = [];
	failing.onError(e => errors.push(e));
	failing.add({ group: 'g@g.us', action: 'open', at: '10:00' });
	fake = new Date('2026-09-27T10:00:05').getTime();
	await failing.tick({ groupSettingUpdate: async () => { throw new Error('not admin'); } });
	assert.equal(errors.length, 1, 'groupSettingUpdate failure surfaces via onError');
	assert.equal(String(errors[0].error.message), 'not admin');
});

// ----------------------------------------------------------------- verifier

test('verifier: auto-challenge on join, verify via messages, attempt limit', async () => {
	const sock = { ev: makeEv() };
	const verifier = createVerifier({
		timeoutMs: 0, // no timers in this test
		maxAttempts: 2,
		generateChallenge: () => ({ question: '2+2=?', answer: 4 })
	});
	verifier.bind(sock);
	const challenged = [];
	const verified = [];
	const failed = [];
	verifier.onChallenge(c => challenged.push(c.user));
	verifier.onVerified(v => verified.push(v.user));
	verifier.onFailed(f => failed.push([f.user, f.reason]));

	await sock.ev.emit('group-participants.update', {
		id: 'g@g.us',
		action: 'add',
		participants: ['n1@s.whatsapp.net', 'n2@s.whatsapp.net']
	});
	assert.equal(challenged.length, 2);
	assert.equal(verifier.isPending('n1@s.whatsapp.net', 'g@g.us'), true);

	const msg = (user, text) => ({ key: { remoteJid: 'g@g.us', id: `${Math.random()}`, participant: user }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [msg('n1@s.whatsapp.net', ' 4 ')] });
	assert.deepEqual(verified, ['n1@s.whatsapp.net'], 'whitespace-tolerant answer check');
	await sock.ev.emit('messages.upsert', { messages: [msg('n2@s.whatsapp.net', '5')] });
	await sock.ev.emit('messages.upsert', { messages: [msg('n2@s.whatsapp.net', '7')] });
	assert.deepEqual(failed, [['n2@s.whatsapp.net', 'attempts']]);
	assert.equal(verifier.size, 0);
	// verified/removed users are not re-checked
	assert.equal(verifier.verify('n1@s.whatsapp.net', 'g@g.us', '4'), null);
});

test('verifier: timeout kicks in, cancel clears, group scoping respected', async () => {
	const verifier = createVerifier({ timeoutMs: 100, groups: ['watched@g.us'] });
	const failed = [];
	verifier.onFailed(f => failed.push(f.reason));

	verifier.participantsHandler({ id: 'other@g.us', action: 'add', participants: ['x@s.whatsapp.net'] });
	assert.equal(verifier.size, 0, 'unwatched group ignored');
	verifier.participantsHandler({ id: 'watched@g.us', action: 'add', participants: ['x@s.whatsapp.net', 'y@s.whatsapp.net'] });
	assert.equal(verifier.size, 2);
	assert.equal(verifier.cancel('y@s.whatsapp.net', 'watched@g.us'), true, 'cancel clears silently');
	await new Promise(r => setTimeout(r, 200));
	assert.deepEqual(failed, ['timeout'], 'only the un-cancelled challenge times out');
	assert.equal(verifier.size, 0);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the new modules', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['sticker-exif', 'economy', 'group-scheduler', 'verifier']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const routerDts = readFileSync(new URL('../lib/Utils/router.d.ts', import.meta.url), 'utf8');
	for (const bit of ['RouterCommandOptions', 'RouterDenial', 'owners', 'onDenied', 'adminOnly', 'cooldownMs']) {
		assert.ok(routerDts.includes(bit), `router.d.ts declares ${bit}`);
	}
});
