/**
 * tests/v247-media-conn-devices.test.js — batch R (v2.4.7)
 *
 * Covers BUGREPORT §2.45–§2.46: the `media_conn` handshake that could never expire once
 * its `ttl` parsed to NaN, and the USync device fan-out that enumerated a repeated user's
 * devices twice.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	parseMediaConnNode,
	isMediaConnExpired,
	MEDIA_CONN_DEFAULT_TTL,
	dedupeDeviceList,
	dedupeJidsByUser
} from '../lib/Utils/index.js';

const host = (attrs) => ({ tag: 'host', attrs });
const mediaConn = (attrs = {}, hosts = []) => ({ tag: 'media_conn', attrs, content: hosts });

describe('§2.45 the media connection can always expire', () => {
	it('a NaN ttl no longer reports "not expired" forever (the regression)', () => {
		const dayOld = Date.now() - 24 * 60 * 60 * 1000;
		// the old inline expression: now - fetchDate > ttl * 1000, with ttl = +undefined
		assert.equal(Date.now() - dayOld > NaN * 1000, false, 'sanity: NaN comparison is false');
		assert.equal(isMediaConnExpired({ ttl: NaN, fetchDate: new Date(dayOld) }), true);
	});

	it('treats every unusable record as expired', () => {
		const now = 1_000_000_000;
		for (const media of [
			undefined,
			null,
			{},
			{ ttl: 300 },
			{ ttl: undefined, fetchDate: new Date(now) },
			{ ttl: 0, fetchDate: new Date(now) },
			{ ttl: -5, fetchDate: new Date(now) },
			{ ttl: 'abc', fetchDate: new Date(now) },
			{ ttl: Infinity, fetchDate: new Date(now) },
			{ ttl: 300, fetchDate: new Date('nope') }
		]) {
			assert.equal(isMediaConnExpired(media, now), true, `expected expired for ${JSON.stringify(media)}`);
		}
	});

	it('respects a valid ttl in both directions', () => {
		const now = 1_000_000_000;
		const fresh = { ttl: 300, fetchDate: new Date(now - 299_000) };
		const stale = { ttl: 300, fetchDate: new Date(now - 301_000) };
		assert.equal(isMediaConnExpired(fresh, now), false);
		assert.equal(isMediaConnExpired(stale, now), true);
		// epoch-ms fetchDate works too
		assert.equal(isMediaConnExpired({ ttl: 300, fetchDate: now - 10_000 }, now), false);
	});

	it('parseMediaConnNode never produces NaN', () => {
		for (const attrs of [{}, { ttl: 'abc' }, { ttl: '' }, { ttl: '0' }, { ttl: '-1' }]) {
			const parsed = parseMediaConnNode(mediaConn(attrs));
			assert.equal(Number.isNaN(parsed.ttl), false);
			assert.equal(parsed.ttl, MEDIA_CONN_DEFAULT_TTL, `expected the default ttl for ${JSON.stringify(attrs)}`);
		}
		assert.equal(parseMediaConnNode(mediaConn({ ttl: '600' })).ttl, 600);
	});

	it('omits an unusable maxContentLengthBytes instead of storing NaN', () => {
		const parsed = parseMediaConnNode(mediaConn({ ttl: '300', auth: 'tok' }, [
			host({ hostname: 'a.example', maxContentLengthBytes: '1048576' }),
			host({ hostname: 'b.example' }),
			host({ hostname: 'c.example', maxContentLengthBytes: 'junk' })
		]));
		assert.equal(parsed.auth, 'tok');
		assert.deepEqual(parsed.hosts, [
			{ hostname: 'a.example', maxContentLengthBytes: 1048576 },
			{ hostname: 'b.example' },
			{ hostname: 'c.example' }
		]);
		assert.equal(JSON.stringify(parsed.hosts).includes('null'), false, 'NaN must not persist as null');
	});

	it('a freshly parsed node is not immediately expired, and a default-ttl one expires on time', () => {
		const now = 1_000_000_000;
		const parsed = parseMediaConnNode(mediaConn({}), { now });
		assert.equal(isMediaConnExpired(parsed, now), false);
		assert.equal(isMediaConnExpired(parsed, now + MEDIA_CONN_DEFAULT_TTL * 1000 + 1), true);
	});

	it('survives a missing node entirely', () => {
		const parsed = parseMediaConnNode(undefined);
		assert.deepEqual(parsed.hosts, []);
		assert.equal(parsed.auth, undefined);
		assert.equal(parsed.ttl, MEDIA_CONN_DEFAULT_TTL);
	});

	it('messages-send uses the helpers rather than the raw coercions', async () => {
		const fs = await import('node:fs');
		const source = await fs.promises.readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
		assert.match(source, /isMediaConnExpired\(media\)/);
		assert.match(source, /parseMediaConnNode\(mediaConnNode\)/);
		// full-line regexes: the old expressions are quoted in the fix comments on purpose
		assert.doesNotMatch(source, /^\s*if \(.*media\.ttl \* 1000.*$/m);
		assert.doesNotMatch(source, /^\s*ttl: \+mediaConnNode\.attrs\.ttl,?\s*$/m);
		assert.doesNotMatch(source, /^\s*maxContentLengthBytes: \+attrs\.maxContentLengthBytes\s*$/m);
	});
});

describe('§2.46 the USync device fan-out deduplicates', () => {
	it('collapses the same user listed twice (the "message yourself" path)', () => {
		const entries = [
			{ jid: '628111@s.whatsapp.net', user: '628111' },
			{ jid: '628111@s.whatsapp.net', user: '628111' }
		];
		assert.deepEqual(dedupeJidsByUser(entries), [entries[0]]);
	});

	it('keeps distinct users and preserves order', () => {
		const entries = [
			{ jid: '1@s.whatsapp.net', user: '1' },
			{ jid: '2@s.whatsapp.net', user: '2' },
			{ jid: '1@s.whatsapp.net', user: '1' },
			{ jid: '3@lid', user: '3' }
		];
		assert.deepEqual(dedupeJidsByUser(entries).map((e) => e.user), ['1', '2', '3']);
	});

	it('derives the user from the jid when the field is absent', () => {
		const entries = [{ jid: '628111@s.whatsapp.net' }, { jid: '628111@s.whatsapp.net' }];
		assert.equal(dedupeJidsByUser(entries).length, 1);
	});

	it('dedupeDeviceList removes repeated devices (4 entries -> 2, as the repro showed)', () => {
		const devices = [
			{ user: '628111', device: 0, jid: '628111@s.whatsapp.net' },
			{ user: '628111', device: 42, jid: '628111:42@s.whatsapp.net' },
			{ user: '628111', device: 0, jid: '628111@s.whatsapp.net' },
			{ user: '628111', device: 42, jid: '628111:42@s.whatsapp.net' }
		];
		assert.deepEqual(dedupeDeviceList(devices).map((d) => d.jid), [
			'628111@s.whatsapp.net',
			'628111:42@s.whatsapp.net'
		]);
	});

	it('treats `user@server` and `user:0@server` as the same device', () => {
		const devices = [
			{ jid: '628111@s.whatsapp.net' },
			{ jid: '628111:0@s.whatsapp.net' },
			{ jid: '628111:1@s.whatsapp.net' }
		];
		assert.deepEqual(dedupeDeviceList(devices).map((d) => d.jid), ['628111@s.whatsapp.net', '628111:1@s.whatsapp.net']);
	});

	it('keeps the same user number on different servers apart (PN vs LID)', () => {
		const devices = [{ jid: '628111@s.whatsapp.net' }, { jid: '628111@lid' }];
		assert.equal(dedupeDeviceList(devices).length, 2);
	});

	it('falls back to user:device when no jid was built yet, and survives junk', () => {
		assert.equal(dedupeDeviceList([{ user: 'a', device: 0 }, { user: 'a', device: 0 }, { user: 'a', device: 1 }]).length, 2);
		assert.deepEqual(dedupeDeviceList([null, undefined]), []);
		assert.deepEqual(dedupeDeviceList([]), []);
		assert.deepEqual(dedupeDeviceList(null), []);
		assert.deepEqual(dedupeJidsByUser(null), []);
		assert.deepEqual(dedupeJidsByUser([null, { }]), []);
	});

	it('getUSyncDevices applies both deduplications', async () => {
		const fs = await import('node:fs');
		const source = await fs.promises.readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
		const fn = source.slice(source.indexOf('const getUSyncDevices'), source.indexOf('Update Member Label'));
		assert.match(fn, /dedupeJidsByUser\(jidsWithUser\)/);
		assert.match(fn, /for \(const \{ jid, user \} of uniqueJidsWithUser\)/);
		assert.equal((fn.match(/return dedupeDeviceList\(deviceResults\)/g) || []).length, 2, 'both return paths must dedupe');
	});

	it('the shadowed isLidUser binding is gone', async () => {
		const fs = await import('node:fs');
		const source = await fs.promises.readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
		assert.doesNotMatch(source, /const isLidUser = requestedLidUsers\.has\(user\)/);
		assert.match(source, /const isLidAddressedUser = requestedLidUsers\.has\(user\)/);
	});
});
