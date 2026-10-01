// v2.4.5 core round: 45 upgrades across pairing / session / voip / database.
//  - pairing-tools:  parse/generate codes, phone normalization, state summary
//  - session-tools:  registration/fingerprint/report helpers, export headers
//  - voip-tools:     PCM timing, loudness, gain/mix, jitter/loss, DTMF, MOS
//  - db-tools:       auth key-store adapter helpers (serialize/diff/merge/…)
import { test } from 'node:test';
import assert from 'node:assert';
import * as B from '../lib/index.js';

// --------------------------------------------------------------- pairing (6)
test('pairing-tools: parse/generate/entropy/phone/state', () => {
	assert.equal(B.parsePairingCode('abcd-efgh'), 'ABCDEFGH');
	assert.equal(B.parsePairingCode('has O and I'), 'HASOANDI'); // O/I are valid; spaces stripped
	assert.equal(B.parsePairingCode('JAP@COD!'), null); // symbols are not allowed
	const gen = B.generatePairingCode({ random: () => 0 });
	assert.equal(gen.length, 8);
	assert.ok(B.isValidPairingCode(gen), 'generated code is valid');
	assert.equal(B.generatePairingCode({ random: () => 0 }), '11111111'); // idx 0 = '1'
	assert.equal(Math.round(B.pairingCodeEntropyBits()), 40);
	assert.equal(B.normalizePhoneForPairing('+62 812-3456-7890'), '6281234567890'); // strips +, spaces, dashes
	assert.equal(B.normalizePhoneForPairing('0812 3456 789'), '8123456789'); // drops leading 0
	assert.equal(B.normalizePhoneForPairing('0062812345678'), '62812345678');   // drops the 00 intl prefix
	assert.equal(B.isValidPhoneForPairing('123'), false);
	assert.throws(() => B.normalizePhoneForPairing('not-a-phone'), /invalid phone/);
	assert.equal(B.describePairingState({ registered: true }), 'registered');
	assert.equal(B.describePairingState({}), 'unpaired');
	assert.equal(B.describePairingState({ pairingCode: 'ABCD1234', pairingCodeRequestedAt: Date.now() }), 'code-pending');
	assert.equal(B.describePairingState({ pairingCode: 'ABCD1234', pairingCodeRequestedAt: 1 }), 'code-expired');
});

// --------------------------------------------------------------- session (7)
test('session-tools: registration / creds info / fingerprint / reports', () => {
	assert.equal(B.isRegistered({ registered: true }), true);
	assert.equal(B.isRegistered({}), false);
	const creds = {
		registered: true,
		me: { id: '628123456789:1@s.whatsapp.net', name: 'Bot' },
		platform: 'android',
		registrationId: 42,
		advSecretKey: 'secret',
		signedIdentityKey: { public: Buffer.from('abcdefghijklmnopqrstuvwxyz012345') }
	};
	const info = B.credsPublicInfo(creds);
	assert.equal(info.registered, true);
	assert.equal(info.me, '628123456789:1@s.whatsapp.net');
	assert.equal(info.registrationId, 42);
	assert.equal(info.advSecretKeyPresent, true);
	assert.ok(!('advSecretKey' in info) && !('signedIdentityKey' in info), 'no secrets leak');
	const fp = B.getSessionFingerprint(creds);
	assert.match(fp, /^[0-9a-f]{12}$/);
	assert.equal(fp, B.getSessionFingerprint(creds), 'stable');
	assert.equal(B.getSessionFingerprint({}), null);

	const report = { folder: './auth', ok: true, registered: true, counts: { creds: 1, 'pre-key': 30, session: 5 }, totalFiles: 40, totalBytes: 20480, corrupted: [], issues: [] };
	assert.match(B.summarizeAuthReport(report), /healthy/);
	assert.match(B.summarizeAuthReport(report), /30 pre-keys/);
	const health = B.estimatePreKeyHealth(report);
	assert.deepEqual(health, { count: 30, healthy: true, low: false, needsUpload: false });
	assert.equal(B.estimatePreKeyHealth({ counts: { 'pre-key': 3 } }).needsUpload, true);
});

test('session-tools: export header parse + fingerprint', () => {
	// build a real (unencrypted) export string via the public API shape:
	// header is JAPSESS1.<base64 deflate>. We only need a syntactically valid one.
	const hdr = B.parseSessionExportHeader('not-an-export');
	assert.equal(hdr.valid, false);
	const fake = 'JAPSESS1.' + Buffer.from('x'.repeat(20)).toString('base64');
	const parsed = B.parseSessionExportHeader(fake);
	assert.equal(parsed.valid, true);
	assert.equal(parsed.encrypted, false);
	assert.equal(parsed.version, 1);
	assert.ok(parsed.payloadBytes > 0);
	const enc = 'JAPSESS2.' + Buffer.from('y'.repeat(20)).toString('base64');
	assert.equal(B.parseSessionExportHeader(enc).encrypted, true);
	assert.equal(B.parseSessionExportHeader(enc).version, 2);
	assert.match(B.sessionExportFingerprint(fake), /^[0-9a-f]{16}$/);
	assert.equal(B.sessionExportFingerprint(fake), B.sessionExportFingerprint(fake));
	assert.notEqual(B.sessionExportFingerprint(fake), B.sessionExportFingerprint(enc));
});

// ------------------------------------------------------------------ voip (16)
test('voip-tools: PCM timing + loudness + gain/mix', () => {
	// 8kHz mono s16 → 16000 bytes = 1000ms
	assert.equal(B.pcmDurationMs(16000), 1000);
	assert.equal(B.pcmByteLength(1000), 16000);
	assert.equal(B.pcmDurationMs(8000, { sampleRate: 16000 }), 250);

	const silence = Buffer.alloc(320); // 160 samples of 0
	assert.equal(B.rmsLevel(silence), 0);
	assert.equal(B.peakLevelPcm(silence), 0);
	assert.equal(B.isSilentPcm(silence), true);
	assert.equal(B.dbfsFromRms(0), -Infinity);
	assert.equal(B.dbfsFromRms(1), 0);

	const loud = Buffer.alloc(8);
	for (let i = 0; i < 4; i++) loud.writeInt16LE(30000, i * 2);
	assert.ok(B.rmsLevel(loud) > 0.8);
	assert.ok(!B.isSilentPcm(loud));
	assert.ok(Math.abs(B.peakLevelPcm(loud) - 30000 / 32768) < 1e-6);

	// gain clamps rather than wraps
	const gained = B.applyGainPcm(loud, 4);
	assert.equal(gained.readInt16LE(0), 32767);
	// mix clamps too
	const mixed = B.mixPcm(loud, loud);
	assert.equal(mixed.readInt16LE(0), 32767);
	// mixing with silence returns the original samples
	assert.equal(B.mixPcm(loud, silence).readInt16LE(0), 30000);
});

test('voip-tools: resample / downmix / duration format', () => {
	assert.equal(B.resampleRatio(8000, 16000), 2);
	assert.equal(B.resampleRatio(48000, 8000), 1 / 6);
	assert.throws(() => B.resampleRatio(0, 8000), /positive/);
	// stereo [L,R] interleaved → mono average
	const stereo = Buffer.alloc(8);
	stereo.writeInt16LE(100, 0); stereo.writeInt16LE(300, 2); // frame 0 → 200
	stereo.writeInt16LE(-50, 4); stereo.writeInt16LE(50, 6);  // frame 1 → 0
	const mono = B.downmixStereoToMono(stereo);
	assert.equal(mono.length, 4);
	assert.equal(mono.readInt16LE(0), 200);
	assert.equal(mono.readInt16LE(2), 0);
	assert.equal(B.formatCallDuration(93_000), '1:33');
	assert.equal(B.formatCallDuration(3_723_000), '1:02:03');
	assert.equal(B.formatCallDuration(-5), '0:00');
});

test('voip-tools: jitter / loss / DTMF / MOS', () => {
	assert.equal(B.estimateJitterMs([0, 20, 40]), 0);          // perfect spacing → ~0
	assert.ok(B.estimateJitterMs([0, 20, 45, 60, 95]) > 0);    // uneven → positive
	assert.equal(B.estimateJitterMs([0]), 0);                  // too few
	assert.equal(B.packetLossRate(95, 100), 0.05);
	assert.equal(B.packetLossRate(100, 100), 0);
	assert.equal(B.packetLossRate(120, 100), 0);               // clamped, no negatives
	assert.equal(B.packetLossRate(5, 0), 0);

	assert.equal(B.isValidDtmf('5'), true);
	assert.equal(B.isValidDtmf('#'), true);
	assert.equal(B.isValidDtmf('a'), true);   // case-insensitive
	assert.equal(B.isValidDtmf('E'), false);
	assert.deepEqual(B.dtmfFrequencies('1'), [697, 1209]);
	assert.deepEqual(B.dtmfFrequencies('#'), [941, 1477]);
	assert.equal(B.dtmfFrequencies('E'), null);

	const perfect = B.estimateMos(0, 0);
	const poor = B.estimateMos(0.1, 400);
	assert.ok(perfect > 4.3 && perfect <= 5, `perfect MOS ${perfect}`);
	assert.ok(poor < perfect, 'loss+latency degrades MOS');
	assert.ok(poor >= 1 && perfect <= 5, 'MOS stays within 1..5');
});

// -------------------------------------------------------------- database (16)
test('db-tools: serialize / deserialize / counts / types', () => {
	const map = {
		'pre-key': { '1': { public: Buffer.from([1, 2, 3]) }, '2': { public: Buffer.from([4]) } },
		session: { 'a@x_0': { rec: 'z' } }
	};
	const json = B.serializeStore(map);
	const back = B.deserializeStore(json);
	assert.ok(Buffer.isBuffer(back['pre-key']['1'].public), 'Buffers survive round-trip');
	assert.deepEqual([...back['pre-key']['1'].public], [1, 2, 3]);
	assert.deepEqual(B.countStoreKeys(map), { 'pre-key': 2, session: 1 });
	assert.equal(B.totalStoreKeys(map), 3);
	assert.deepEqual(B.storeTypes(map).sort(), ['pre-key', 'session']);
	assert.equal(B.isEmptyStore({}), true);
	assert.equal(B.isEmptyStore({ session: { a: null } }), true); // null = deleted
	assert.equal(B.isEmptyStore(map), false);
	assert.equal(B.deserializeStore('').session, undefined);
	assert.ok(B.storeSizeBytes(map) > 0);
});

test('db-tools: merge / diff / prune / filter / clone / rename', () => {
	const a = { 'pre-key': { '1': { v: 1 }, '2': { v: 2 } } };
	const b = { 'pre-key': { '2': null, '3': { v: 3 } }, session: { s: { v: 9 } } };
	const merged = B.mergeStores(a, b);
	assert.deepEqual(B.countStoreKeys(merged), { 'pre-key': 2, session: 1 }); // 1,3 + s (2 deleted)
	assert.equal(merged['pre-key']['2'], undefined);
	// inputs untouched
	assert.equal(a['pre-key']['2'].v, 2);

	const diff = B.diffStores({ 'pre-key': { '1': { v: 1 }, '2': { v: 2 } } }, { 'pre-key': { '1': { v: 1 }, '2': { v: 99 }, '3': { v: 3 } } });
	assert.deepEqual(diff.added, [{ type: 'pre-key', id: '3' }]);
	assert.deepEqual(diff.changed, [{ type: 'pre-key', id: '2' }]);
	assert.deepEqual(diff.removed, []);

	assert.deepEqual(B.storeTypes(B.pruneStoreType(merged, 'session')), ['pre-key']);
	assert.deepEqual(B.storeTypes(B.filterStoreType(merged, 'session')), ['session']);

	const clone = B.cloneStore(a);
	clone['pre-key']['1'].v = 100;
	assert.equal(a['pre-key']['1'].v, 1, 'clone is deep/independent');

	const renamed = B.renameStoreId(a, 'pre-key', '1', '9');
	assert.equal(renamed['pre-key']['9'].v, 1);
	assert.equal(renamed['pre-key']['1'], undefined);
	assert.equal(a['pre-key']['1'].v, 1, 'rename does not mutate input');
});

test('db-tools: key id sanitize / namespace helpers', () => {
	assert.equal(B.sanitizeKeyId('62:1@s.whatsapp.net/x'), '62-1@s.whatsapp.net__x');
	assert.equal(B.namespaceKey('pre-key', '1'), 'pre-key:1');
	assert.deepEqual(B.parseNamespacedKey('pre-key:1'), { type: 'pre-key', id: '1' });
	// id may itself contain the separator — split on FIRST only
	assert.deepEqual(B.parseNamespacedKey('session:62:1@x_0'), { type: 'session', id: '62:1@x_0' });
	assert.equal(B.parseNamespacedKey('nokey'), null);
});
