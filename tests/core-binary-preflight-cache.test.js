// Tests for the core upgrade round: WABinary deep search, socket config
// preflight (wired into makeWASocket), the group metadata cache, the WA
// version bump and the peripheral updates.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as B from '../lib/index.js';

const makeEv = () => {
	const h = {};
	return {
		on: (e, f) => { (h[e] ||= []).push(f); },
		off: (e, f) => { h[e] = (h[e] || []).filter(x => x !== f); },
		emit: (e, p) => Promise.all((h[e] || []).map(f => f(p)))
	};
};

test('WABinary deep search: findAllBinaryNodes + getBinaryNodePath', () => {
	const tree = {
		tag: 'iq', attrs: {}, content: [
			{ tag: 'sync', attrs: {}, content: [
				{ tag: 'collection', attrs: { n: '1' }, content: [{ tag: 'patch', attrs: { v: 'a' }, content: undefined }] },
				{ tag: 'collection', attrs: { n: '2' }, content: [{ tag: 'patch', attrs: { v: 'b' }, content: undefined }] }
			] }
		]
	};
	const all = B.findAllBinaryNodes(tree, 'patch');
	assert.equal(all.length, 2);
	assert.equal(all[0].attrs.v, 'a');
	assert.equal(all[1].attrs.v, 'b');
	assert.deepEqual(B.findAllBinaryNodes(tree, 'ghost'), []);
	assert.deepEqual(B.findAllBinaryNodes(null, 'x'), []);

	assert.equal(B.getBinaryNodePath(tree, ['sync', 'collection', 'patch']).attrs.v, 'a');
	assert.equal(B.getBinaryNodePath(tree, ['sync', 'nope']), undefined);
	assert.equal(B.getBinaryNodePath(tree, []), tree);
});

test('socket preflight: every error and warning class', () => {
	const missing = B.validateSocketConfig({});
	assert.equal(missing.ok, false);
	assert.ok(missing.errors.some(e => e.includes('auth is missing')));

	const wholeState = B.validateSocketConfig({ auth: { state: {}, saveCreds: () => { } } });
	assert.ok(wholeState.errors.some(e => e.includes('whole { state, saveCreds }')), 'classic mistake detected');

	const goodAuth = { auth: { creds: {}, keys: { get: () => { }, set: () => { } } } };
	assert.equal(B.validateSocketConfig(goodAuth).ok, true);

	const noisy = B.validateSocketConfig({
		...goodAuth,
		version: [2, 2000, 5],
		browser: ['x', 'y', 'WIN32'],
		connectTimeoutMs: 30
	});
	assert.equal(noisy.ok, true, 'warnings never block');
	assert.equal(noisy.warnings.length, 3);
	assert.ok(noisy.warnings.some(w => w.includes('WIN32')));
	assert.ok(noisy.warnings.some(w => w.includes('legacy')));
	assert.ok(noisy.warnings.some(w => w.includes('milliseconds')));

	assert.equal(B.validateSocketConfig({ ...goodAuth, version: [2, 3000] }).ok, false, 'short version array');
	assert.equal(B.validateSocketConfig({ ...goodAuth, browser: ['only-two', 'parts'] }).ok, false);
	assert.ok(
		B.validateSocketConfig({ ...goodAuth, syncFullHistory: true, browser: ['Ubuntu', 'Chrome', '1.0'] })
			.warnings.some(w => w.includes('Desktop')),
		'full-history needs a desktop identity'
	);
	assert.ok(B.validateSocketConfig({ ...goodAuth, logger: {} }).errors.some(e => e.includes('pino-compatible')));

	// wired into makeWASocket
	const src = readFileSync(new URL('../lib/Socket/index.js', import.meta.url), 'utf8');
	assert.ok(src.includes('validateSocketConfig(config)'));
	assert.ok(src.includes('[socket preflight]'));
});

test('group metadata cache: TTL, hits, event invalidation, stale-on-error', async () => {
	let t = 0;
	let fetches = 0;
	const cache = B.createGroupMetadataCache({ ttlMs: 1000, now: () => t });
	const sock = { ev: makeEv(), groupMetadata: async (jid) => { fetches++; return { id: jid, subject: `S${fetches}` }; } };
	cache.bind(sock);

	assert.equal((await cache.cachedGroupMetadata('g@g.us')).subject, 'S1');
	assert.equal((await cache.cachedGroupMetadata('g@g.us')).subject, 'S1', 'served from cache');
	assert.equal(fetches, 1);
	assert.deepEqual(cache.stats, { hits: 1, misses: 1, invalidations: 0, size: 1 });

	t = 2000;
	assert.equal((await cache.cachedGroupMetadata('g@g.us')).subject, 'S2', 'TTL expiry refetches');

	await sock.ev.emit('group-participants.update', { id: 'g@g.us', action: 'add', participants: ['x@s'] });
	assert.equal(cache.stats.invalidations, 1);
	assert.equal(cache.get('g@g.us'), null);
	await sock.ev.emit('groups.update', [{ id: 'lain@g.us', subject: 'x' }]);
	assert.equal(cache.stats.invalidations, 1, 'uncached groups are a no-op');

	assert.equal((await cache.cachedGroupMetadata('g@g.us')).subject, 'S3');
	sock.groupMetadata = async () => { throw new Error('offline'); };
	t = 5000;
	assert.equal((await cache.cachedGroupMetadata('g@g.us')).subject, 'S3', 'stale beats nothing when the fetch fails');

	cache.set('manual@g.us', { subject: 'seeded' });
	assert.equal(cache.get('manual@g.us').subject, 'seeded');
	cache.unbind();
	assert.equal(await B.createGroupMetadataCache().cachedGroupMetadata('x@g.us'), null, 'cold + unbound → null');
});

test('core update: WA version current, upstream parity documented, peripherals', () => {
	const defaults = readFileSync(new URL('../lib/Defaults/index.js', import.meta.url), 'utf8');
	// version-watchdog bumps this weekly — assert the shape, not a soon-stale literal.
	assert.match(defaults, /const version\s*=\s*\[2, 3000, \d{9,}\]/);

	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	assert.ok(pkg.keywords.includes('anti-ban') && pkg.keywords.includes('termux'));
	assert.equal(pkg.scripts['wa:check'], 'node lib/cli.js wa');

	// example bot exists and is syntactically valid ES (checked by the
	// sweep); here we assert it wires the flagship modules together.
	const example = readFileSync(new URL('../examples/full-bot.js', import.meta.url), 'utf8');
	for (const needle of ['makeWASocketAuto', 'createGroupMetadataCache', 'autoPersist', 'createShutdownManager', 'classifyDisconnect', 'opGuard.wrap(sock)']) {
		assert.ok(example.includes(needle), `example wires ${needle}`);
	}
});
