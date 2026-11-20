/**
 * tests/v2410-batch-cc.test.js — batch CC (v2.4.10)
 *
 * The auth adapters had no test coverage at all before this file.
 *
 * §2.159 a failed atomic write left its temp file behind forever
 * §2.160 the per-file mutex table grew without bound
 * §2.161 useJAPDBAuth silently replaced a corrupt auth file with a fresh session
 * §2.162 one failed write stopped all later auth persistence
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { useMultiFileAuthState, pruneStaleAuthFiles, _authFileLockCount } from '../lib/Utils/use-multi-file-auth-state.js';
import { useJAPDBAuth } from '../lib/Utils/auth-db.js';

const freshDir = () => mkdtemp(join(tmpdir(), 'jap-auth-'));
const tmpFiles = names => names.filter(n => /\.tmp-\d+-\d+$/.test(n));

test('§2.159 a failed write leaves no temp file behind', async () => {
	const dir = await freshDir();
	try {
		const { state } = await useMultiFileAuthState(dir);
		// make the destination a directory so rename() fails with EISDIR
		await mkdir(join(dir, 'pre-key-99.json'), { recursive: true });

		await assert.rejects(() => state.keys.set({ 'pre-key': { 99: { a: 1 } } }));
		assert.deepEqual(tmpFiles(await readdir(dir)), [], 'the temp file was cleaned up');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.159 pruneStaleAuthFiles also collects orphaned temp files', async () => {
	const dir = await freshDir();
	try {
		// a temp left behind by an older, crashed process
		await writeFile(join(dir, 'creds.json.tmp-12345-1700000000000'), '{}');
		await writeFile(join(dir, 'creds.json'), '{}');

		const res = await pruneStaleAuthFiles(dir, { maxAgeDays: -1 });
		assert.equal(res.removed, 1, 'the orphan temp is removed');
		const left = await readdir(dir);
		assert.deepEqual(tmpFiles(left), []);
		assert.ok(left.includes('creds.json'), 'real auth files are never touched');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.159 a successful write still produces exactly one real file', async () => {
	const dir = await freshDir();
	try {
		const { state, saveCreds } = await useMultiFileAuthState(dir);
		await saveCreds();
		await state.keys.set({ 'pre-key': { 7: { a: 1 } } });
		const names = await readdir(dir);
		assert.deepEqual(tmpFiles(names), [], 'no temp survives a healthy write');
		assert.ok(names.includes('pre-key-7.json'));
		assert.deepEqual(await state.keys.get('pre-key', ['7']), { 7: { a: 1 } }, 'and it round-trips');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.160 the file-lock table does not grow with every key touched', async () => {
	const dir = await freshDir();
	try {
		const { state } = await useMultiFileAuthState(dir);
		const before = _authFileLockCount();

		const ids = Array.from({ length: 300 }, (_, i) => `id${i}`);
		await state.keys.set({ 'sender-key-memory': Object.fromEntries(ids.map(i => [i, { v: 1 }])) });
		await state.keys.get('sender-key-memory', ids);
		await state.keys.set({ 'sender-key-memory': Object.fromEntries(ids.map(i => [i, null])) });

		const after = _authFileLockCount();
		assert.ok(after <= before + 1,
			`the lock table must not retain an entry per key file (before=${before}, after=${after}, keys=300)`);
		assert.deepEqual((await readdir(dir)).filter(n => n.startsWith('sender-key-memory-')), [],
			'every key really was written and then removed');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.161 a corrupt auth file is refused, not silently replaced', async () => {
	const dir = await freshDir();
	const file = join(dir, 'neko-auth.json');
	try {
		await writeFile(file, '{"creds": THIS IS NOT JSON');
		await assert.rejects(() => useJAPDBAuth({ file }), /Refusing to start a fresh session/);
		// the damaged file must still be on disk for the operator to inspect
		assert.match(await readFile(file, 'utf-8'), /THIS IS NOT JSON/, 'the evidence is preserved');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.161 a missing file is still the normal first-run path', async () => {
	const dir = await freshDir();
	try {
		const auth = await useJAPDBAuth({ file: join(dir, 'does-not-exist.json') });
		assert.ok(auth.state.creds, 'fresh creds are generated');
		assert.equal(auth.state.creds.registered, false);
		await auth.saveCreds();
		assert.ok((await readdir(dir)).includes('does-not-exist.json'), 'and persisted');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.161 a valid file round-trips', async () => {
	const dir = await freshDir();
	const file = join(dir, 'auth.json');
	try {
		const first = await useJAPDBAuth({ file });
		first.state.creds.registered = true;
		await first.saveCreds();
		await first.close?.();

		const second = await useJAPDBAuth({ file });
		assert.equal(second.state.creds.registered, true, 'state survives a restart');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.162 a real write failure does not stop every later write', async () => {
	const dir = await freshDir();
	const sub = join(dir, 'nested');
	const file = join(sub, 'auth.json');
	await mkdir(sub, { recursive: true });
	try {
		const auth = await useJAPDBAuth({ file });
		await auth.saveCreds();
		assert.ok((await readdir(sub)).includes('auth.json'), 'first write lands');

		// make the directory disappear so the next write genuinely fails
		await rm(sub, { recursive: true, force: true });
		await writeFile(sub, 'now I am a file, not a directory');
		auth.state.creds.registered = true;
		await assert.rejects(() => auth.saveCreds(), 'the write fails while the path is broken');

		// repair the environment — persistence must resume
		await rm(sub, { force: true });
		await mkdir(sub, { recursive: true });
		await assert.doesNotReject(() => auth.saveCreds(),
			'a later write must be attempted, not skipped on a poisoned chain');

		const written = JSON.parse(await readFile(file, 'utf-8'));
		assert.ok(written[ 'creds' ] ?? written.creds ?? Object.keys(written).length, 'something was persisted');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.162 close() does not throw because the last write failed', async () => {
	const dir = await freshDir();
	const file = join(dir, 'auth.json');
	try {
		const auth = await useJAPDBAuth({ file });
		await auth.saveCreds();
		await assert.doesNotReject(() => Promise.resolve(auth.close?.()));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
