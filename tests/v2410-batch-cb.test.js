/**
 * tests/v2410-batch-cb.test.js — batch CB (v2.4.10)
 *
 * §2.155 stop() did not stop a connection that was still being built
 * §2.156 chunkText() hung forever on a non-positive size
 * §2.157 progressBar() rendered an empty bar and " NaN%" for a bad value
 * §2.158 truncate() cut emoji and ZWJ sequences in half
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { autoReconnect } from '../lib/Utils/auto-reconnect.js';
import { chunkText, progressBar, truncate } from '../lib/Utils/text-extras.js';

const quiet = { child() { return quiet; }, trace() {}, debug() {}, info() {}, warn() {}, error() {} };

test('§2.155 stop() during the factory call closes the socket that arrives late', async () => {
	let created = 0;
	let ended = 0;
	let release;
	const factory = () => new Promise(resolve => {
		release = () => { created++; resolve({ ev: new EventEmitter(), end: async () => { ended++; } }); };
	});

	const manager = autoReconnect(factory, { logger: quiet });
	const starting = manager.start();
	await new Promise(r => setImmediate(r));   // let start() reach the factory await

	await manager.stop();                       // user cancels mid-flight
	assert.equal(manager.getStatus().stopped, true);

	release();                                  // the factory finally answers
	await starting;
	await new Promise(r => setTimeout(r, 20));

	assert.equal(created, 1, 'the factory did produce a socket');
	assert.equal(ended, 1, 'and the manager closed it instead of adopting it');
	assert.equal(manager.socket, null, 'a stopped manager must not hold a live socket');
});

test('§2.155 the ordinary start/stop path still works', async () => {
	let ended = 0;
	const factory = async () => ({ ev: new EventEmitter(), end: async () => { ended++; } });
	const manager = autoReconnect(factory, { logger: quiet });
	const sock = await manager.start();
	assert.ok(sock, 'start() returns the socket');
	assert.equal(manager.socket, sock);
	await manager.stop();
	assert.equal(ended, 1);
});

test('§2.156 a non-positive chunk size is rejected instead of hanging', () => {
	for (const bad of [0, -1, NaN, 0.4, 'x', null]) {
		assert.throws(() => chunkText('abcdef', bad), /positive integer/,
			`size ${JSON.stringify(bad)} must be refused`);
	}
});

test('§2.156 ordinary chunking is unchanged', () => {
	assert.deepEqual(chunkText('a b c d e', 3), ['a b', 'c d', 'e']);
	assert.deepEqual(chunkText('', 10), []);
	assert.deepEqual(chunkText('short', 100), ['short']);
	// every chunk respects the limit and nothing is lost beyond the separators
	const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
	const chunks = chunkText(long, 40);
	assert.ok(chunks.every(c => c.length <= 40), 'no chunk exceeds the size');
	assert.equal(chunks.join(' '), long, 'the text round-trips');
});

test('§2.157 a non-numeric progress value renders an empty bar, not NaN', () => {
	for (const bad of [NaN, 'x', undefined, null, {}]) {
		const out = progressBar(bad, 100);
		assert.doesNotMatch(out, /NaN/, `value ${JSON.stringify(bad)} must not leak NaN`);
		assert.match(out, /^░{10} 0%$/, 'a full-width empty bar at 0%');
	}
});

test('§2.157 real values are unaffected', () => {
	assert.equal(progressBar(50, 100), '█████░░░░░ 50%');
	assert.equal(progressBar(0, 100), '░░░░░░░░░░ 0%');
	assert.equal(progressBar(100, 100), '██████████ 100%');
	assert.equal(progressBar(200, 100), '██████████ 100%', 'still clamped');
	assert.equal(progressBar(-5, 100), '░░░░░░░░░░ 0%');
	assert.equal(progressBar(50, 100, { showPercent: false }), '█████░░░░░');
});

test('§2.158 truncate keeps a multi-codepoint emoji whole', () => {
	const family = '👨‍👩‍👧‍👦';
	const out = truncate(`${family}abc`, 3);
	assert.ok(out.startsWith(family), 'the family emoji survives intact');
	assert.ok(!out.includes('\u200D…'), 'no orphan zero-width joiner before the ellipsis');
	assert.equal(out, `${family}a…`);
});

test('§2.158 plain text truncation is unchanged', () => {
	assert.equal(truncate('halo dunia', 6), 'halo …');
	assert.equal(truncate('short', 20), 'short');
	assert.equal(truncate('abc', 3), 'abc', 'exactly at the limit is not trimmed');
	assert.equal(truncate(null, 5), '');
});
