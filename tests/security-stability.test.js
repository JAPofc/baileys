// Tests for the security & stability round: bug shield (crash-message
// detection + text sanitizer), crash guard + safeStringify, connection
// watchdog, secure logger redaction, encrypted session exports, auth file
// permission hardening and auto-reconnect onGiveUp/getStatus.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
	analyzeMessageThreat,
	sanitizeText,
	createBugShield,
	installCrashGuard,
	safeStringify,
	createConnectionWatchdog,
	redactSensitive,
	createSecureLogger,
	exportAuthToString,
	importAuthFromString,
	isEncryptedSessionExport,
	checkAuthPermissions,
	hardenAuthFolder,
	analyzeAuthState,
	autoReconnect,
	initAuthCreds
} from '../lib/index.js';
import { BufferJSON } from '../lib/Utils/generics.js';

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

const silentLogger = { error: () => { }, warn: () => { }, info: () => { }, child: () => silentLogger };

// --------------------------------------------------------------- bug shield

test('analyzeMessageThreat: clean passes, every attack signal detected', () => {
	const clean = analyzeMessageThreat({ message: { conversation: 'halo bro apa kabar' } });
	assert.equal(clean.threat, false);
	assert.equal(clean.score, 0);

	const bomb = analyzeMessageThreat({
		message: { extendedTextMessage: { text: 'woi', contextInfo: { mentionedJid: Array(600).fill('x@s.whatsapp.net') } } }
	});
	assert.equal(bomb.threat, true);
	assert.ok(bomb.reasons.includes('mentionBomb'));
	assert.equal(bomb.stats.mentions, 600);

	const huge = analyzeMessageThreat({ message: { conversation: 'a'.repeat(60_000) } });
	assert.ok(huge.threat && huge.reasons.includes('hugeText'));

	const zalgo = analyzeMessageThreat(
		{ message: { conversation: `h${'\u0300'.repeat(50)}i${'\u0301'.repeat(50)} teks panjang dikit` } },
		{ scoreThreshold: 1 }
	);
	assert.ok(zalgo.reasons.includes('zalgo'));

	const invisible = analyzeMessageThreat(
		{ message: { conversation: `x${'\u200b'.repeat(3000)}` } },
		{ scoreThreshold: 1 }
	);
	assert.ok(invisible.reasons.includes('invisibleFlood'));

	const rtl = analyzeMessageThreat(
		{ message: { conversation: 'file\u202Egnp.exe adalah gambar dengan teks yang lumayan panjang' } },
		{ scoreThreshold: 1 }
	);
	assert.ok(rtl.reasons.includes('rtlOverride'));

	// adversarial input never throws
	assert.doesNotThrow(() => analyzeMessageThreat(null));
	assert.doesNotThrow(() => analyzeMessageThreat({ message: { a: { b: { c: null } } } }));
});

test('sanitizeText strips overrides/control chars and flattens zalgo', () => {
	const dirty = `file\u202Egnp.exe ${'\u200b'.repeat(50)}h${'\u0300\u0301\u0302\u0303\u0304'}i\u0000\u001f`;
	const cleaned = sanitizeText(dirty);
	assert.ok(!cleaned.includes('\u202E'), 'RTL override gone');
	assert.ok(!cleaned.includes('\u200b'), 'invisible flood gone');
	assert.ok(!cleaned.includes('\u0000'), 'control chars gone');
	assert.equal((cleaned.match(/[\u0300-\u0304]/g) || []).length, 2, 'combining capped at 2');
	assert.ok(cleaned.includes('filegnp.exe'));
	assert.equal(sanitizeText(''), '');
	assert.equal(sanitizeText('teks normal 123'), 'teks normal 123');
});

test('bug shield binder: detects, deletes, exempts, counts', async () => {
	const deleted = [];
	const sock = { ev: makeEv(), sendMessage: async (_j, content) => deleted.push(content) };
	const shield = createBugShield({ autoDelete: true, exemptUsers: ['adm@s.whatsapp.net'] });
	shield.bind(sock);
	const hits = [];
	shield.onDetected(d => hits.push(d));

	const bombMsg = (id, participant) => ({
		key: { remoteJid: 'g@g.us', id, participant },
		message: { extendedTextMessage: { text: 'a'.repeat(60_000), contextInfo: { mentionedJid: Array(600).fill('x@s') } } }
	});
	await sock.ev.emit('messages.upsert', {
		messages: [
			bombMsg('1', 'bad@s.whatsapp.net'),
			{ key: { remoteJid: 'g@g.us', id: '2', participant: 'ok@s.whatsapp.net' }, message: { conversation: 'normal' } },
			bombMsg('3', 'adm@s.whatsapp.net') // exempt
		]
	});
	assert.equal(hits.length, 1);
	assert.equal(hits[0].key.id, '1');
	assert.ok(hits[0].reasons.includes('hugeText') && hits[0].reasons.includes('mentionBomb'));
	assert.equal(hits[0].deleted, true);
	assert.equal(deleted.length, 1);
	assert.deepEqual(shield.stats, { scanned: 2, blocked: 1 });
	shield.unbind();
});

// -------------------------------------------------------------- crash guard

test('crash guard: catches both event types, single-install, uninstall', () => {
	const caught = [];
	const beforeUncaught = process.listenerCount('uncaughtException');
	const guard = installCrashGuard({ onError: e => caught.push(e.type), logger: silentLogger });
	assert.throws(() => installCrashGuard({}), /already installed/);
	assert.equal(process.listenerCount('uncaughtException'), beforeUncaught + 1, 'handler registered');

	// invoke OUR handlers directly — process.emit would also hit the test
	// runner's own uncaughtException listener and fail the test
	const ourUncaught = process.listeners('uncaughtException').at(-1);
	const ourRejection = process.listeners('unhandledRejection').at(-1);
	ourUncaught(new Error('boom1'));
	ourRejection(new Error('boom2'), Promise.resolve());
	assert.deepEqual(caught, ['uncaughtException', 'unhandledRejection']);
	assert.equal(guard.stats.uncaughtException, 1);
	assert.equal(guard.stats.unhandledRejection, 1);
	assert.equal(guard.isInstalled, true);

	// a throwing onError must not take the process down
	guard.uninstall();
	const chaotic = installCrashGuard({
		onError: () => {
			throw new Error('handler boom');
		},
		logger: silentLogger
	});
	assert.doesNotThrow(() => process.listeners('uncaughtException').at(-1)(new Error('x')));
	assert.equal(chaotic.uninstall(), true);
	assert.equal(chaotic.uninstall(), false);
});

test('safeStringify survives circulars, buffers, bigints, errors', () => {
	const circular = { a: 1 };
	circular.self = circular;
	const out = safeStringify({
		circular,
		buf: Buffer.alloc(2048),
		big: 10n,
		err: new Error('x'),
		fn: function named() { },
		undef: undefined,
		long: 'z'.repeat(1000)
	});
	const parsed = JSON.parse(out);
	assert.equal(parsed.circular.self, '[Circular]');
	assert.equal(parsed.buf, '[Buffer 2048 bytes]');
	assert.equal(parsed.big, '10n');
	assert.equal(parsed.err.message, 'x');
	assert.equal(parsed.fn, '[Function named]');
	assert.equal(parsed.undef, '[undefined]');
	assert.ok(parsed.long.includes('…(1000 chars)'));
	const capped = safeStringify({ deep: { a: { b: { c: { d: { e: { f: 1 } } } } } } }, { maxDepth: 2 });
	assert.ok(capped.includes('[Object]'));
	assert.ok(safeStringify({ x: 'y'.repeat(50_000) }, { maxLength: 100 }).length <= 101);
});

// ------------------------------------------------------ connection watchdog

test('connection watchdog: stale fires once, activity re-arms', async () => {
	let t = 1_000_000;
	const watchdog = createConnectionWatchdog({ staleMs: 60_000, now: () => t });
	const sock = { ev: makeEv() };
	watchdog.bind(sock);
	const stales = [];
	const actives = [];
	watchdog.onStale(s => stales.push(s.silentMs));
	watchdog.onActivity(() => actives.push(1));

	watchdog.touch();
	t += 30_000;
	assert.equal(watchdog.check().stale, false);
	assert.equal(watchdog.silentMs, 30_000);

	t += 40_000; // 70s silent
	watchdog.check();
	watchdog.check(); // still stale — must NOT fire again
	assert.deepEqual(stales, [70_000]);
	assert.equal(watchdog.isStale, true);
	assert.equal(watchdog.stats.staleCount, 1);

	await sock.ev.emit('messages.upsert', {}); // any bound event = activity
	assert.equal(watchdog.isStale, false);
	assert.equal(actives.length, 1);

	t += 70_000;
	watchdog.check();
	assert.equal(stales.length, 2, 're-armed after activity');
	watchdog.unbind();
	await sock.ev.emit('messages.upsert', {});
	assert.equal(actives.length, 1, 'unbound events ignored');
});

// ------------------------------------------------------------ secure logger

test('redactSensitive scrubs credential fields, keeps normal data', () => {
	const red = redactSensitive({
		noiseKey: { private: Buffer.alloc(32) },
		myToken: 'abc',
		password: 'x',
		text: 'halo',
		nested: { advSecretKey: 'zz', ok: 1 },
		buf: Buffer.alloc(4)
	});
	assert.equal(red.noiseKey, '[REDACTED]');
	assert.equal(red.myToken, '[REDACTED]');
	assert.equal(red.password, '[REDACTED]');
	assert.equal(red.text, 'halo');
	assert.equal(red.nested.advSecretKey, '[REDACTED]');
	assert.equal(red.nested.ok, 1);
	assert.equal(red.buf, '[Bytes 4]');
	const circular = {};
	circular.self = circular;
	assert.equal(redactSensitive(circular).self, '[Circular]');
	assert.equal(redactSensitive('plain'), 'plain');
});

test('createSecureLogger redacts credentials in real pino output', async () => {
	const lines = [];
	const destination = new Writable({
		write(chunk, _enc, cb) {
			lines.push(chunk.toString());
			cb();
		}
	});
	const logger = createSecureLogger({ level: 'info', destination });
	logger.info({ creds: { me: 'x' }, pairingCode: 'ABCD1234', text: 'aman' }, 'test line');
	await new Promise(r => setTimeout(r, 50));
	const output = lines.join('');
	assert.ok(output.includes('[REDACTED]'));
	assert.ok(!output.includes('ABCD1234'), 'pairing code never logged');
	assert.ok(output.includes('aman'), 'normal fields kept');
	assert.equal(typeof logger.child, 'function', 'usable as the socket logger');
});

// ------------------------------------------- encrypted exports & permissions

test('encrypted session export: JAPSESS2 roundtrip, wrong password rejected', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'jap-sec-'));
	const creds = initAuthCreds();
	creds.registered = true;
	await writeFile(join(dir, 'creds.json'), JSON.stringify(creds, BufferJSON.replacer));
	await writeFile(join(dir, 'pre-key-1.json'), '{"a":1}');

	const encrypted = await exportAuthToString(dir, { password: 'rahasia123' });
	const plain = await exportAuthToString(dir);
	assert.ok(encrypted.startsWith('JAPSESS2.'));
	assert.ok(plain.startsWith('JAPSESS1.'));
	assert.equal(isEncryptedSessionExport(encrypted), true);
	assert.equal(isEncryptedSessionExport(plain), false);

	const dest = join(tmpdir(), `jap-sec-out-${Date.now()}`);
	const result = await importAuthFromString(encrypted, dest, { password: 'rahasia123' });
	assert.equal(result.files, 2);
	assert.equal((await analyzeAuthState(dest)).registered, true);

	await assert.rejects(() => importAuthFromString(encrypted, '/tmp/x'), /encrypted/);
	await assert.rejects(() => importAuthFromString(encrypted, '/tmp/x', { password: 'salah' }));
	// plain path still works with the new signature
	const dest2 = join(tmpdir(), `jap-sec-out2-${Date.now()}`);
	assert.equal((await importAuthFromString(plain, dest2)).files, 2);
});

test('auth permission audit + hardening', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'jap-perm-'));
	await writeFile(join(dir, 'creds.json'), '{}', { mode: 0o600 });
	await writeFile(join(dir, 'pre-key-1.json'), '{}');
	await chmod(join(dir, 'pre-key-1.json'), 0o644);

	const audit = await checkAuthPermissions(dir);
	assert.equal(audit.ok, false);
	assert.ok(audit.insecure.some(i => i.file === 'pre-key-1.json' && i.mode === '644'));

	const { changed } = await hardenAuthFolder(dir);
	assert.ok(changed >= 1);
	const after = await checkAuthPermissions(dir);
	assert.equal(after.ok, true);
	assert.deepEqual(after.insecure, []);
	assert.equal(after.folderMode, 0o700);
	assert.deepEqual(await hardenAuthFolder(dir), { changed: 0 }, 'idempotent');
});

// ------------------------------------------------------------ auto-reconnect

test('auto-reconnect upgrade: onGiveUp fires, getStatus reports lifecycle', async () => {
	const gaveUp = [];
	const manager = autoReconnect(async () => {
		throw new Error('offline');
	}, {
		maxAttempts: 2,
		baseDelayMs: 5,
		maxDelayMs: 10,
		onGiveUp: g => gaveUp.push([g.reason, g.attempts]),
		logger: silentLogger
	});
	assert.equal(manager.getStatus().started, false);
	await manager.start();
	await new Promise(r => setTimeout(r, 250));
	const status = manager.getStatus();
	assert.equal(status.started, true);
	assert.equal(status.attempts, 3, 'stopped after exceeding maxAttempts');
	assert.equal(status.hasSocket, false);
	assert.deepEqual(gaveUp, [['factory-failed', 2]]);
	await manager.stop();
	assert.equal(manager.getStatus().stopped, true);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the security round', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['bug-shield', 'crash-guard', 'connection-watchdog', 'secure-logger']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const sessionDts = readFileSync(new URL('../lib/Utils/session-tools.d.ts', import.meta.url), 'utf8');
	for (const bit of ['SESSION_EXPORT_MAGIC_ENC', 'isEncryptedSessionExport', 'checkAuthPermissions', 'hardenAuthFolder', 'password?: string']) {
		assert.ok(sessionDts.includes(bit), `session-tools.d.ts declares ${bit}`);
	}
	const reconnectDts = readFileSync(new URL('../lib/Utils/auto-reconnect.d.ts', import.meta.url), 'utf8');
	assert.ok(reconnectDts.includes('onGiveUp') && reconnectDts.includes('getStatus'));
});
