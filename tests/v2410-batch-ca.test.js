/**
 * tests/v2410-batch-ca.test.js — batch CA (v2.4.10)
 *
 * §2.151 router matched the first-listed prefix, never the longest
 * §2.152 a voter's device suffix let one person vote several times
 * §2.153 duplicated option names double-counted a single vote
 * §2.154 normalizePhoneForPairing() manufactured a wrong number from a local one
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRouter } from '../lib/Utils/router.js';
import { createPollManager } from '../lib/Utils/poll-manager.js';
import { normalizePhoneForPairing, isValidPhoneForPairing } from '../lib/Utils/pairing-tools.js';

const sock = { sendMessage: async () => {}, ev: { on() {}, off() {} } };
const msg = text => ({ key: { remoteJid: 'x@s.whatsapp.net', id: '1', fromMe: false }, message: { conversation: text } });

test('§2.151 a longer prefix is reachable when a shorter one is also registered', async () => {
	const seen = [];
	const router = createRouter({ prefix: ['!', '!!'] });
	router.command('ping', async ctx => { seen.push(ctx.command); });

	assert.equal(await router.handle(sock, msg('!!ping')), true, '"!!ping" must match');
	assert.equal(await router.handle(sock, msg('!ping')), true);
	assert.deepEqual(seen, ['ping', 'ping']);
});

test('§2.151 declaration order still decides the prefix shown in help', async () => {
	let helpText = '';
	const router = createRouter({
		prefix: ['/', '!!!'],
		help: true
	});
	router.command('ping', async () => {}, { desc: 'p' });
	const spy = { ...sock, sendMessage: async (_jid, content) => { helpText = content.text; } };
	await router.handle(spy, msg('/help'));
	assert.match(helpText, /\/ping/, 'the menu renders with the first declared prefix');
});

test('§2.151 ordinary single-prefix routing is unchanged', async () => {
	const seen = [];
	const router = createRouter({ prefix: '!' });
	router.command('ping', async ctx => { seen.push(ctx.args); });
	assert.equal(await router.handle(sock, msg('!ping a b')), true);
	assert.equal(await router.handle(sock, msg('no prefix here')), false);
	assert.deepEqual(seen, [['a', 'b']]);
});

const registerPoll = (pm, id, names, selectableCount = 0) =>
	pm.register({ id, options: names, selectableCount });

test('§2.152 the same person voting from two devices counts once', () => {
	const pm = createPollManager();
	registerPoll(pm, 'P1', ['Pizza', 'Sushi']);
	pm.applyVote('P1', '628111@s.whatsapp.net', ['Pizza']);
	pm.applyVote('P1', '628111:12@s.whatsapp.net', ['Sushi']);

	assert.equal(pm.totalVoters('P1'), 1, 'one human, one vote');
	assert.deepEqual(pm.tally('P1').map(r => [r.name, r.count]), [['Pizza', 0], ['Sushi', 1]],
		'the later selection replaces the earlier one');
	assert.deepEqual(pm.getVoterChoice('P1', '628111@s.whatsapp.net'), ['Sushi'],
		'lookup works with or without the device suffix');
	assert.deepEqual(pm.getVoterChoice('P1', '628111:9@s.whatsapp.net'), ['Sushi']);
});

test('§2.152 applyUpdate dedupes the same way', () => {
	const pm = createPollManager();
	registerPoll(pm, 'P2', ['A', 'B']);
	pm.applyUpdate('P2', { pollUpdateMessageKey: { participant: '628999:3@s.whatsapp.net' }, vote: { selectedOptions: ['A'] } });
	pm.applyUpdate('P2', { pollUpdateMessageKey: { participant: '628999@s.whatsapp.net' }, vote: { selectedOptions: ['B'] } });
	assert.equal(pm.totalVoters('P2'), 1);
});

test('§2.152 genuinely different voters are still separate', () => {
	const pm = createPollManager();
	registerPoll(pm, 'P3', ['A', 'B']);
	pm.applyVote('P3', '628111@s.whatsapp.net', ['A']);
	pm.applyVote('P3', '628222@s.whatsapp.net', ['A']);
	assert.equal(pm.totalVoters('P3'), 2);
	assert.equal(pm.tally('P3')[0].count, 2);
});

test('§2.153 a duplicated option name does not double-count one vote', () => {
	const pm = createPollManager();
	registerPoll(pm, 'P4', ['Other', 'Other']);
	pm.applyVote('P4', 'a@s.whatsapp.net', ['Other']);

	const rows = pm.tally('P4');
	assert.equal(rows.reduce((s, r) => s + r.count, 0), 1, 'one voter contributes exactly one count');
	assert.deepEqual(rows.map(r => r.count), [1, 0], 'attributed to the first occurrence');
	assert.deepEqual(pm.getVoterChoice('P4', 'a@s.whatsapp.net'), ['Other'], 'one pick, not two');
});

test('§2.153 multi-select over distinct options still records every pick', () => {
	const pm = createPollManager();
	registerPoll(pm, 'P5', ['A', 'B', 'C'], 2);
	pm.applyVote('P5', 'a@s.whatsapp.net', ['A', 'C']);
	assert.deepEqual(pm.tally('P5').map(r => [r.name, r.count]), [['A', 1], ['B', 0], ['C', 1]]);
});

test('§2.154 a local number with a leading 0 is rejected, not silently rewritten', () => {
	assert.throws(() => normalizePhoneForPairing('08123456789'), /LOCAL number/);
	assert.throws(() => normalizePhoneForPairing('0812 3456 789'), /LOCAL number/);
	assert.equal(isValidPhoneForPairing('08123456789'), false);
});

test('§2.154 international forms are unaffected', () => {
	assert.equal(normalizePhoneForPairing('+62 812-3456-789'), '628123456789');
	assert.equal(normalizePhoneForPairing('0062812345678'), '62812345678', 'the 00 call prefix is still stripped');
	assert.equal(normalizePhoneForPairing('628123456789'), '628123456789');
	assert.equal(isValidPhoneForPairing('628123456789'), true);
});

test('§2.154 the rejection message says what to do instead', () => {
	try {
		normalizePhoneForPairing('08123456789');
		assert.fail('should have thrown');
	} catch (err) {
		assert.match(err.message, /628123456789/, 'shows the corrected form');
		assert.match(err.message, /silently ignored by the server/, 'explains why it matters');
	}
});
