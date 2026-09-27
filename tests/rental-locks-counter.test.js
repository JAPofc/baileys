// Tests for the rental/ops round: per-chat bot rentals ("sewa"), daily
// message counters with digests, command locks + maintenance mode, and
// conversation-flow choice steps.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createRentalManager,
	createMessageCounter,
	createCommandLock,
	createConversationFlow,
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

const msg = (chat, user, text) => ({
	key: { remoteJid: chat, id: `${Math.random()}`, participant: user },
	message: { conversation: text }
});

// ------------------------------------------------------------------- rental

test('rental: grants, one-trial-ever, filter, expiring warning, expiry', () => {
	let t = 0;
	const rental = createRentalManager({ now: () => t, expiringThresholdMs: 86_400_000 });
	const expired = [];
	const expiring = [];
	rental.onExpire(e => expired.push(e.chat));
	rental.onExpiring(e => expiring.push(e.chat));

	rental.add('g1@g.us', { days: 30, by: 'buyer@s' });
	assert.equal(rental.isActive('g1@g.us'), true);
	assert.equal(rental.getRental('g1@g.us').remainingMs, 30 * 86_400_000);
	assert.throws(() => rental.add('x@g.us', {}), /duration/);

	assert.notEqual(rental.startTrial('g2@g.us', { days: 3 }), false);
	assert.equal(rental.startTrial('g2@g.us', { days: 3 }), false, 'one trial per chat, ever');
	assert.equal(rental.getRental('g2@g.us').trial, true);

	const seen = [];
	const wrapped = rental.filter(({ messages }) => seen.push(...messages.map(m => m.key.id)));
	wrapped({ messages: [
		{ key: { remoteJid: 'g1@g.us', id: '1' } },
		{ key: { remoteJid: 'unrented@g.us', id: '2' } },
		{ key: { remoteJid: 'dm@s.whatsapp.net', id: '3' } }
	] });
	assert.deepEqual(seen, ['1', '3'], 'unrented groups dropped, DMs pass');
	const strict = createRentalManager({ allowDms: false, now: () => t });
	const seen2 = [];
	strict.filter(({ messages }) => seen2.push(...messages))({ messages: [{ key: { remoteJid: 'dm@s.whatsapp.net', id: 'x' } }] });
	assert.equal(seen2.length, 0, 'allowDms:false drops DMs too');

	t = 29.5 * 86_400_000;
	rental.sweep();
	rental.sweep();
	assert.deepEqual(expiring, ['g1@g.us'], 'expiring warning fires once');

	rental.extend('g1@g.us', { days: 10 });
	assert.equal(rental.getRental('g1@g.us').remainingMs, 10.5 * 86_400_000, 'extend stacks from current expiry');

	t = 41 * 86_400_000;
	rental.sweep();
	assert.ok(expired.includes('g1@g.us') && expired.includes('g2@g.us'));
	assert.equal(rental.isActive('g1@g.us'), false);
	assert.equal(rental.startTrial('g2@g.us'), false, 'trial stays burned after expiry');

	const restored = createRentalManager({ now: () => t });
	restored.load(rental.toJSON());
	assert.equal(restored.startTrial('g2@g.us'), false, 'trial burn survives persistence');

	rental.add('life@g.us', { lifetime: true });
	assert.ok(rental.renderStatus('life@g.us').includes('lifetime'));
	assert.equal(rental.getRental('life@g.us').remainingMs, Infinity);
	assert.ok(rental.renderStatus('unrented@g.us').includes('Tidak aktif'));
	assert.equal(rental.getExpiring(86_400_000).length, 0);
});

// ---------------------------------------------------------- message counter

test('message counter: daily counts, digests, day roll into history', async () => {
	let t = new Date('2026-09-28T10:00:00').getTime();
	const counter = createMessageCounter({ historyDays: 2, now: () => t });
	const sock = { ev: makeEv() };
	counter.bind(sock);

	await sock.ev.emit('messages.upsert', {
		type: 'notify',
		messages: [msg('g@g.us', 'a@s', '1'), msg('g@g.us', 'a@s', '2'), msg('g@g.us', 'b@s', '3'), msg('g@g.us', 'c@s', '4')]
	});
	await sock.ev.emit('messages.upsert', { type: 'append', messages: [msg('g@g.us', 'a@s', 'old')] });
	assert.equal(counter.getUserCount('g@g.us', 'a@s'), 2);
	assert.equal(counter.getChatTotal('g@g.us'), 4);
	assert.equal(counter.getTopChatters('g@g.us', 1)[0].user, 'a@s');

	const digest = counter.renderDigest('g@g.us');
	assert.ok(digest.includes('Total: 4 pesan'));
	assert.ok(digest.includes('🥇 @a — 2 pesan'));
	assert.ok(counter.renderDigest('kosong@g.us').includes('sepi'));

	t += 86_400_000; // next day
	await sock.ev.emit('messages.upsert', { type: 'notify', messages: [msg('g@g.us', 'c@s', 'baru')] });
	const history = counter.getHistory('g@g.us');
	assert.equal(history.length, 1);
	assert.equal(history[0].total, 4);
	assert.equal(history[0].topUser, 'a@s');
	assert.equal(counter.getChatTotal('g@g.us'), 1, 'today restarted');

	const restored = createMessageCounter({ now: () => t });
	restored.load(counter.toJSON());
	assert.equal(restored.getChatTotal('g@g.us'), 1);
	assert.equal(restored.getHistory('g@g.us')[0].total, 4);
});

// ------------------------------------------------------------- command lock

test('command lock: per-chat, global, wildcard, maintenance with owner bypass', async () => {
	const locks = createCommandLock({ owners: ['boss@s.whatsapp.net'] });
	locks.lock('g@g.us', 'slot');
	locks.lockGlobal('rob');
	assert.equal(locks.isLocked('g@g.us', 'slot'), true);
	assert.equal(locks.isLocked('lain@g.us', 'slot'), false);
	assert.equal(locks.isLocked('anywhere@g.us', 'rob'), true);
	assert.equal(locks.isLocked('g@g.us', 'menu'), false);
	assert.deepEqual(locks.getLocks('g@g.us'), { chat: ['slot'], global: ['rob'] });

	locks.lock('all@g.us'); // '*'
	assert.equal(locks.isLocked('all@g.us', 'apapun'), true);
	assert.equal(locks.unlock('all@g.us'), true);
	assert.equal(locks.isLocked('all@g.us', 'apapun'), false);

	locks.setMaintenance(true, { message: 'Lagi maintenance 🛠️' });
	assert.equal(locks.isMaintenance, true);
	assert.equal(locks.check('g@g.us', 'menu', 'user@s').reason, 'maintenance');
	assert.equal(locks.isLocked('g@g.us', 'menu', 'boss:2@s.whatsapp.net'), false, 'owner device suffix tolerated');

	// router integration
	const replies = [];
	const blocked = [];
	locks.onBlocked(b => blocked.push(b.reason));
	const router = createRouter({ prefix: '!' });
	router.use(locks.middleware());
	const ran = [];
	router.command('menu', () => ran.push('menu'));
	const sock = { sendMessage: async (_jid, content) => replies.push(content.text) };
	const mk = (text, participant) => ({ key: { remoteJid: 'g@g.us', id: `${Math.random()}`, participant }, message: { conversation: text } });

	await router.handle(sock, mk('!menu', 'user@s'));
	await router.handle(sock, mk('!menu', 'user@s')); // silent second time
	await router.handle(sock, mk('!menu', 'boss@s.whatsapp.net'));
	assert.deepEqual(ran, ['menu'], 'only the owner ran it');
	assert.equal(replies.filter(r => r.includes('maintenance')).length, 1, 'notice once per user');
	assert.equal(blocked.length, 2);

	locks.setMaintenance(false);
	locks.lock('g@g.us', 'menu');
	await router.handle(sock, mk('!menu', 'user@s'));
	await router.handle(sock, mk('!menu', 'user@s'));
	assert.equal(replies.filter(r => r.includes('disabled')).length, 2, 'chat locks reply every time');
	assert.equal(ran.length, 1);

	const restored = createCommandLock();
	restored.load(locks.toJSON());
	assert.equal(restored.isLocked('g@g.us', 'menu'), true);
	assert.equal(restored.isMaintenance, false);
});

// -------------------------------------------------- conversation-flow choices

test('conversation flow choices: numbered prompts, text/number answers, canonical storage', async () => {
	const sent = [];
	const sock = { ev: makeEv(), sendMessage: async (_jid, content) => sent.push(content.text) };
	const flows = createConversationFlow({ timeoutMs: 0 });
	flows.define('order', [
		{ id: 'size', prompt: 'Pilih ukuran:', choices: ['Kecil', 'Sedang', 'Besar'] },
		{ id: 'qty', prompt: 'Berapa?' }
	]);
	flows.bind(sock);
	const done = [];
	flows.onComplete(e => done.push(e.answers));

	await flows.start(sock, 'c@s', 'c@s', 'order');
	assert.equal(sent[0], 'Pilih ukuran:\n1. Kecil\n2. Sedang\n3. Besar', 'choices render numbered');

	const mk = (text) => ({ key: { remoteJid: 'c@s', id: `${Math.random()}` }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [mk('jumbo')] });
	assert.ok(sent.some(s => s.includes('Pilih salah satu')), 'invalid choice re-prompts');
	await sock.ev.emit('messages.upsert', { messages: [mk('2')] }); // by number
	await sock.ev.emit('messages.upsert', { messages: [mk('5')] }); // free-text step
	assert.equal(done.length, 1);
	assert.equal(done[0].size, 'Sedang', 'number resolves to canonical text');
	assert.equal(done[0].qty, '5');

	await flows.start(sock, 'c@s', 'c@s', 'order');
	await sock.ev.emit('messages.upsert', { messages: [mk('BESAR')] }); // case-insensitive text
	await sock.ev.emit('messages.upsert', { messages: [mk('1')] });
	assert.equal(done[1].size, 'Besar');
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['rental', 'message-counter', 'command-lock']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const flowDts = readFileSync(new URL('../lib/Utils/conversation-flow.d.ts', import.meta.url), 'utf8');
	assert.ok(flowDts.includes('choices?: string[]'));
});
