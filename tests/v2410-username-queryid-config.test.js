/**
 * tests/v2410-username-queryid-config.test.js — batch BX (v2.4.10)
 *
 * Covers BUGREPORT §2.140: a `usernameQueryIds` entry whose value was missing
 * (the usual `{ CHECK: process.env.WA_CHECK_ID }` with the variable unset)
 * overwrote the pinned fallback with `undefined` AND was recorded as a manual
 * pin, so auto-rotation refused to repair it and every username call failed for
 * the lifetime of the socket.
 *
 * Also covers the finding alongside it: the socket handed out its live internal
 * id map, so a direct write bypassed the manual-pin bookkeeping.
 *
 * (getUsernameRecommendations() was given the requireId() guard its siblings
 * have in the same batch. That one is defensive only -- with the fix above an
 * empty id can no longer be produced through the public API -- so it carries no
 * test of its own rather than a tautological one.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';

import makeWASocket from '../lib/index.js';
import { initAuthCreds } from '../lib/Utils/auth-utils.js';
import { USERNAME_QUERY_IDS } from '../lib/Socket/username.js';

const silent = pino({ level: 'silent' });

const inMemKeys = () => {
	const store = {};
	return {
		get: async (type, ids) => {
			const out = {};
			for (const id of ids) out[id] = store[`${type}:${id}`];
			return out;
		},
		set: async (data) => {
			for (const [type, byId] of Object.entries(data)) {
				for (const [id, val] of Object.entries(byId)) store[`${type}:${id}`] = val;
			}
		}
	};
};

const makeSock = (usernameQueryIds) => {
	const sock = makeWASocket({
		auth: { creds: initAuthCreds(), keys: inMemKeys() },
		logger: silent,
		printQRInTerminal: false,
		...(usernameQueryIds ? { usernameQueryIds } : {})
	});
	sock.ws?.on?.('error', () => {}); // sandbox: the connection always fails late
	return sock;
};

test('§2.140 an unset override does not wipe the pinned fallback', async () => {
	// process.env.WA_CHECK_ID is not set -> the value is undefined
	const sock = makeSock({ CHECK: process.env.WA_CHECK_ID });
	try {
		const ids = sock.getUsernameQueryIds();
		assert.equal(ids.CHECK, USERNAME_QUERY_IDS.CHECK, 'the pinned id must survive');
		assert.ok(ids.CHECK, 'and must not be undefined');
		// the call must get past requireId() -- it fails later, at the network
		await assert.doesNotReject(
			sock.checkUsername('someone').catch((err) => {
				assert.doesNotMatch(String(err?.message), /query_id not configured/);
			})
		);
	} finally {
		sock.end?.(undefined);
	}
});

test('§2.140 an empty string is not an override either', () => {
	const sock = makeSock({ SET: '', GET: '   ' });
	try {
		const ids = sock.getUsernameQueryIds();
		assert.equal(ids.SET, USERNAME_QUERY_IDS.SET, 'empty string must not win over the fallback');
		assert.equal(ids.GET, '   ', 'a non-empty string is taken at face value, even if odd');
	} finally {
		sock.end?.(undefined);
	}
});

test('§2.140 a real override still wins and is still protected from rotation', () => {
	const sock = makeSock({ CHECK: '12345678901234567' });
	try {
		assert.equal(sock.getUsernameQueryIds().CHECK, '12345678901234567');
		// setUsernameQueryIds() reports what is now in effect
		const after = sock.setUsernameQueryIds({ GET: '99999999999999999' });
		assert.equal(after.GET, '99999999999999999');
		assert.equal(after.CHECK, '12345678901234567', 'the construction-time pin is untouched');
	} finally {
		sock.end?.(undefined);
	}
});

test('§2.140 sock.USERNAME_QUERY_IDS is a snapshot, not the live map', () => {
	const sock = makeSock();
	try {
		const exposed = sock.USERNAME_QUERY_IDS;
		assert.equal(exposed.CHECK, USERNAME_QUERY_IDS.CHECK);

		exposed.CHECK = 'WRITTEN-DIRECTLY';
		assert.equal(
			sock.getUsernameQueryIds().CHECK,
			USERNAME_QUERY_IDS.CHECK,
			'writing to the exposed object must not reach the socket'
		);
		// two reads must not be the same object either
		assert.notEqual(sock.USERNAME_QUERY_IDS, sock.USERNAME_QUERY_IDS);
	} finally {
		sock.end?.(undefined);
	}
});
