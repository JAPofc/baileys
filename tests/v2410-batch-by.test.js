/**
 * tests/v2410-batch-by.test.js — batch BY (v2.4.10)
 *
 * BUGREPORT §2.142 — definedOnly(): an explicitly-undefined key used to override a default.
 * BUGREPORT §2.143 — handleGroupStory() tagged the wrong node as the group status.
 * BUGREPORT §2.145 — raceWithTimeout(): hand-rolled deadline races leaked their timer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Japyea } from '../lib/Socket/japyea.js';
import { raceWithTimeout } from '../lib/Utils/generics.js';

const mkJapyea = (relay = async () => ({})) =>
	new Japyea(
		async () => ({}),
		relay,
		{ logger: { error() {}, debug() {} } },
		{ authState: { creds: { me: { id: '1@s.whatsapp.net' } } } }
	);

test('§2.142 an undefined contextInfo field no longer wipes its default', async () => {
	const built = await mkJapyea().handleInteractive({
		interactiveMessage: {
			title: 't',
			// this is what destructuring an options object hands you
			contextInfo: { mentionedJid: undefined, forwardingScore: undefined, expiration: 60 }
		}
	});
	const ctx = built.interactiveMessage.contextInfo;
	assert.deepEqual(ctx.mentionedJid, [], 'default survives an undefined override');
	assert.equal(ctx.forwardingScore, 0);
	assert.equal(ctx.expiration, 60, 'a real value still overrides');
});

test('§2.142 a deliberate null is still honoured, not treated as missing', async () => {
	const built = await mkJapyea().handleInteractive({
		interactiveMessage: { title: 't', contextInfo: { mentionedJid: null } }
	});
	assert.equal(built.interactiveMessage.contextInfo.mentionedJid, null);
});

test('§2.142 the same hole in externalAdReply is closed', async () => {
	const built = await mkJapyea().handleInteractive({
		interactiveMessage: {
			title: 't',
			externalAdReply: { title: undefined, mediaType: undefined, sourceUrl: 'https://x.com' }
		}
	});
	const ad = built.interactiveMessage.contextInfo.externalAdReply;
	assert.equal(ad.title, '');
	assert.equal(ad.mediaType, 1);
	assert.equal(ad.sourceUrl, 'https://x.com');
});

test('§2.143 handleGroupStory tags the media node, not messageContextInfo', async () => {
	const res = await mkJapyea().handleGroupStory(
		{
			groupStatusMessage: {
				message: {
					// messageContextInfo comes first, which is the usual ordering
					messageContextInfo: { deviceListMetadataVersion: 2 },
					imageMessage: { url: 'https://example.com/a.jpg' }
				}
			}
		},
		'123@g.us'
	);
	const inner = res.message.groupStatusMessageV2.message;
	assert.equal(inner.imageMessage.contextInfo.isGroupStatus, true, 'the media node carries the flag');
	assert.equal(inner.imageMessage.contextInfo.statusSourceType, 0, 'image => 0');
	assert.equal(inner.messageContextInfo.contextInfo, undefined, 'the envelope is left alone');
});

test('§2.143 a message with only one node still works', async () => {
	const res = await mkJapyea().handleGroupStory(
		{ groupStatusMessage: { message: { videoMessage: { url: 'https://example.com/a.mp4' } } } },
		'123@g.us'
	);
	const inner = res.message.groupStatusMessageV2.message;
	assert.equal(inner.videoMessage.contextInfo.isGroupStatus, true);
	assert.equal(inner.videoMessage.contextInfo.statusSourceType, 1, 'video => 1');
});

test('§2.145 raceWithTimeout clears its timer when the work wins', async () => {
	const before = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
	const got = await raceWithTimeout(Promise.resolve('fast'), 30_000);
	const after = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
	assert.equal(got, 'fast');
	assert.equal(after, before, 'no timer is left pending — this is what used to hang exits');
});

test('§2.145 raceWithTimeout returns the fallback on expiry', async () => {
	const got = await raceWithTimeout(new Promise(() => {}), 10, 'gave-up');
	assert.equal(got, 'gave-up');
});

test('§2.145 raceWithTimeout with no deadline passes the promise straight through', async () => {
	assert.equal(await raceWithTimeout(Promise.resolve(7), 0), 7);
});

test('§2.145 raceWithTimeout propagates a rejection and still clears the timer', async () => {
	const before = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
	await assert.rejects(() => raceWithTimeout(Promise.reject(new Error('boom')), 30_000), /boom/);
	const after = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
	assert.equal(after, before);
});

/** BUGREPORT §2.146 — a caller-supplied signal used to disable fetchBuffer's own timeout. */
test('§2.146 fetchBuffer still times out when the caller passes its own signal', async () => {
	const { default: Shared } = await import('../lib/Builders/shared.js').then(m => ({
		default: m.default ?? Object.values(m).find(v => typeof v?.fetchBuffer === 'function')
	}));
	assert.ok(Shared, 'found the class exposing fetchBuffer');
	const caller = new AbortController();
	const t0 = Date.now();
	// 10.255.255.1 is non-routable: the connect hangs until something aborts it
	const buf = await Shared.fetchBuffer('http://10.255.255.1/x', { signal: caller.signal }, { timeout: 300 });
	const dt = Date.now() - t0;
	assert.ok(Buffer.isBuffer(buf) && buf.length === 0, 'silent mode returns an empty buffer');
	assert.ok(dt < 3000, `aborted by our own timeout, took ${dt}ms`);
});

/**
 * BUGREPORT §2.144 — NOT a bug. Investigated as one, then reverted.
 *
 * `JSON.parse` on the index looks inconsistent next to the decrypt/MAC skips above it, and a
 * skip-and-continue "fix" passed its own test. It also broke
 * `§2.75 with macs off, an unparseable record still stops instead of skipping ahead`.
 * That test is right: the skips are safe only because a skipped record leaves the LT hash
 * short and the downstream mismatch reports an incomplete sync. With `validateMacs: false`
 * there is no mismatch check, so throwing is the only thing preventing a patch with a lost
 * mutation from advancing the saved version. This test pins the throw so nobody "fixes" it again.
 */
/**
 * JAP@Fix (CI): `whatsapp-rust-bridge` is an optionalDependency, so this test cannot run
 * on a platform without a prebuilt binary. Probe once and skip with a reason rather than
 * fail with ERR_MODULE_NOT_FOUND -- the §2.144 contract being pinned here is about
 * `decodeSyncdMutations`, and it is covered where the bridge exists. The bridge's own
 * absent-platform behaviour is tested in `v2410-lt-hash.test.js`.
 */
const bridgeAvailable = await (async () => {
	try {
		await import('whatsapp-rust-bridge');
		return true;
	} catch {
		return false;
	}
})();

test('§2.144 an unparseable index throws — on purpose, see §2.75', { skip: !bridgeAvailable && 'whatsapp-rust-bridge has no prebuilt binary here' }, async () => {
	const { randomBytes } = await import('node:crypto');
	const { expandAppStateKeys } = await import('whatsapp-rust-bridge');
	const { proto } = await import('../WAProto/index.js');
	const { aesEncrypt } = await import('../lib/Utils/crypto.js');
	const { decodeSyncdMutations, newLTHashState } = await import('../lib/Utils/chat-utils.js');

	const keyData = randomBytes(32);
	const keyId = randomBytes(6);
	const keys = expandAppStateKeys(keyData);
	const indexBuf = Buffer.from('{"truncated');
	const encoded = proto.SyncActionData.encode(
		proto.SyncActionData.fromObject({
			index: indexBuf,
			value: { pushNameSetting: { name: 'x' } },
			padding: new Uint8Array(0),
			version: 7
		})
	).finish();
	const record = {
		operation: 0,
		record: {
			index: { blob: indexBuf },
			value: { blob: Buffer.concat([aesEncrypt(encoded, keys.valueEncryptionKey), Buffer.alloc(32)]) },
			keyId: { id: keyId }
		}
	};

	let caught;
	try {
		await decodeSyncdMutations([record], newLTHashState(), async () => ({ keyData }), () => {}, false);
	} catch (err) {
		caught = err;
	}
	assert.ok(caught, 'it must still throw so the patch is not marked applied');
	assert.match(caught.message, /unparseable index/, 'wrapped with context instead of a bare SyntaxError');
	assert.equal(caught.data?.reason, 'bad-index');
});
