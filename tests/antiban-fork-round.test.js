// Tests for the anti-ban round: account warmup ramps, disconnect
// classification, group operation guard, Gaussian jitter and the opt-in
// presence cycler.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	createAccountWarmup,
	DEFAULT_WARMUP_RAMP,
	classifyDisconnect,
	explainDisconnect,
	createGroupOpGuard,
	GroupOpLimitError,
	DEFAULT_GROUP_OP_LIMITS,
	randomGaussian,
	gaussianDelayMs,
	createPresenceCycler,
	DisconnectReason
} from '../lib/index.js';

// ------------------------------------------------------------------ warmup

test('account warmup: daily caps ramp, midnight rollover, graduation, persistence', () => {
	let t = new Date('2026-09-27T10:00:00').getTime();
	const start = t;
	const warmup = createAccountWarmup({ startedAt: start, ramp: [2, 5], now: () => t });
	const limits = [];
	warmup.onLimit(l => limits.push([l.day, l.cap]));

	assert.equal(warmup.getStatus().day, 1);
	assert.equal(warmup.getStatus().cap, 2);
	assert.equal(warmup.canSend(), true);
	warmup.recordSend();
	warmup.recordSend();
	assert.equal(warmup.canSend(), false);
	assert.deepEqual(limits, [[1, 2]], 'onLimit fires once per day');
	assert.equal(warmup.trySend().allowed, false);
	assert.ok(warmup.nextResetAt() > t);

	t += 86_400_000; // day 2
	assert.equal(warmup.canSend(), true, 'fresh allowance after midnight');
	assert.equal(warmup.getStatus().day, 2);
	assert.equal(warmup.getStatus().cap, 5);
	assert.equal(warmup.getStatus().sentToday, 0);

	t += 2 * 86_400_000; // day 4 — past the 2-step ramp
	const graduated = warmup.getStatus();
	assert.equal(graduated.graduated, true);
	assert.equal(graduated.cap, Infinity);
	assert.equal(warmup.trySend().allowed, true);

	const restored = createAccountWarmup({ startedAt: start, ramp: [2, 5], now: () => t });
	restored.load(warmup.toJSON());
	assert.equal(restored.getStatus().sentToday, 1, 'same-day counter survives restarts');

	assert.equal(DEFAULT_WARMUP_RAMP.length, 6);
	assert.equal(DEFAULT_WARMUP_RAMP[0], 20);
});

// -------------------------------------------------------------- classifier

test('disconnect classifier: categories, actions and reconnect advice', () => {
	const mk = (code) => ({ error: { output: { statusCode: code } } });

	const restart = classifyDisconnect(mk(DisconnectReason.restartRequired));
	assert.equal(restart.category, 'transient');
	assert.equal(restart.action, 'reconnect-now');
	assert.equal(restart.shouldReconnect, true);
	assert.equal(restart.reason, 'restartRequired');

	const loggedOut = classifyDisconnect(mk(DisconnectReason.loggedOut));
	assert.equal(loggedOut.category, 'auth');
	assert.equal(loggedOut.action, 're-pair');
	assert.equal(loggedOut.shouldReconnect, false);

	assert.equal(classifyDisconnect(mk(DisconnectReason.forbidden)).category, 'banned');
	assert.equal(classifyDisconnect(mk(DisconnectReason.forbidden)).action, 'stop');
	assert.equal(classifyDisconnect(mk(DisconnectReason.connectionReplaced)).category, 'conflict');
	assert.equal(classifyDisconnect(mk(DisconnectReason.badSession)).action, 're-pair');
	assert.equal(classifyDisconnect(mk(DisconnectReason.unavailableService)).action, 'reconnect-backoff');

	const unknown = classifyDisconnect(mk(999));
	assert.equal(unknown.category, 'unknown');
	assert.equal(unknown.shouldReconnect, true, 'unknown codes default to retrying');
	assert.equal(classifyDisconnect(428).category, 'transient', 'bare status codes accepted');
	assert.equal(classifyDisconnect(undefined).code, null);

	assert.ok(explainDisconnect(mk(401)).startsWith('🔑 [auth 401]'));
	assert.ok(explainDisconnect(mk(515)).startsWith('🔄'));
	assert.ok(explainDisconnect(mk(403)).startsWith('⛔'));
});

// ------------------------------------------------------------ group op guard

test('group op guard: sliding windows, assert throws, socket wrap', async () => {
	let t = 0;
	const guard = createGroupOpGuard({ now: () => t });
	const blocked = [];
	guard.onBlocked(b => blocked.push(b.op));

	assert.equal(DEFAULT_GROUP_OP_LIMITS.add.max, 3);
	assert.equal(guard.check('add').allowed, true);
	guard.record('add');
	guard.record('add');
	guard.record('add');
	const capped = guard.check('add');
	assert.equal(capped.allowed, false);
	assert.equal(capped.retryInMs, 600_000);
	assert.equal(guard.getUsage().add.used, 3);

	let thrown = null;
	try {
		guard.assert('add');
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof GroupOpLimitError);
	assert.equal(thrown.op, 'add');
	assert.deepEqual(blocked, ['add']);

	t = 601_000; // window slid
	assert.equal(guard.check('add').allowed, true);
	assert.equal(guard.getUsage().add.used, 0);

	const calls = [];
	const sock = {
		groupParticipantsUpdate: async (_j, participants, action) => {
			calls.push([action, participants.length]);
			return [];
		},
		groupCreate: async () => {
			calls.push(['create']);
			return {};
		},
		other: 'passthrough'
	};
	const safe = guard.wrap(sock);
	await safe.groupParticipantsUpdate('g@g.us', ['a', 'b'], 'add'); // counts 2
	await safe.groupCreate('New', ['a']);
	await assert.rejects(
		() => safe.groupParticipantsUpdate('g@g.us', ['c', 'd'], 'add'), // 2+2 > 3
		GroupOpLimitError
	);
	assert.deepEqual(calls, [['add', 2], ['create']]);
	assert.equal(safe.other, 'passthrough', 'non-guarded members untouched');

	const custom = createGroupOpGuard({ limits: { add: { max: 1 } }, now: () => 0 });
	custom.record('add');
	assert.equal(custom.check('add').allowed, false, 'custom limits merge over defaults');
	custom.reset();
	assert.equal(custom.check('add').allowed, true);
	assert.equal(custom.check('unknown-op').allowed, true, 'unlimited ops pass');
});

// ---------------------------------------------------------------- gaussian

test('gaussian jitter: distribution centers on the mean, clamps hold', () => {
	const samples = Array.from({ length: 3000 }, () => randomGaussian(100, 10));
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	assert.ok(Math.abs(mean - 100) < 2, `sample mean ${mean} near 100`);
	const spread = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
	assert.ok(spread > 7 && spread < 13, `sample stddev ${spread} near 10`);

	const clamped = Array.from({ length: 500 }, () => randomGaussian(0, 100, { clamp: [-50, 50] }));
	assert.ok(clamped.every(v => v >= -50 && v <= 50));

	const delay = gaussianDelayMs(2000, 600);
	assert.ok(Number.isInteger(delay) && delay >= 0 && delay <= 6000);
});

// ---------------------------------------------------------- presence cycler

test('presence cycler: opt-in composing bursts, guardrails, failure counting', async () => {
	const presences = [];
	const sock = { sendPresenceUpdate: async (presence, jid) => presences.push([presence, jid]) };
	const cycler = createPresenceCycler(sock, { chats: ['owner@s.whatsapp.net'], typingMs: 10 });
	await cycler.cycleOnce();
	assert.deepEqual(presences, [
		['composing', 'owner@s.whatsapp.net'],
		['paused', 'owner@s.whatsapp.net']
	]);
	assert.equal(cycler.stats.cycles, 1);

	assert.throws(() => createPresenceCycler(sock, {}), /chats/, 'refuses to run without an explicit chat list');
	assert.throws(() => createPresenceCycler(null, { chats: ['x'] }), /socket/);

	const stop = cycler.start();
	assert.equal(cycler.isRunning, true);
	stop();
	assert.equal(cycler.isRunning, false);

	const failing = createPresenceCycler(
		{ sendPresenceUpdate: async () => { throw new Error('mid-reconnect'); } },
		{ chats: ['a@s'], typingMs: 1 }
	);
	await failing.cycleOnce(); // must not throw
	assert.equal(failing.stats.failures, 1);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the anti-ban round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['warmup', 'disconnect-classifier', 'group-op-guard']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare/, `${mod}.d.ts declares its API`);
	}
	const randomDts = readFileSync(new URL('../lib/Utils/random-tools.d.ts', import.meta.url), 'utf8');
	assert.ok(randomDts.includes('randomGaussian') && randomDts.includes('gaussianDelayMs'));
	const onlineDts = readFileSync(new URL('../lib/Utils/always-online.d.ts', import.meta.url), 'utf8');
	assert.ok(onlineDts.includes('createPresenceCycler'));
});
