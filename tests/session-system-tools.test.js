// Tests for the system/session/database round: session doctor (analyze +
// repair), portable session export/import strings, cross-backend migration,
// rotating encrypted backups and the graceful shutdown manager — plus the
// CLI `session` subcommands end-to-end.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	analyzeAuthState,
	repairAuthFolder,
	exportAuthToString,
	importAuthFromString,
	isSessionExportString,
	migrateFolderToAuthState,
	backupAuthStateRotating,
	restoreAuthState,
	createShutdownManager,
	initAuthCreds
} from '../lib/index.js';
import { BufferJSON } from '../lib/Utils/generics.js';

const makeSessionDir = async (extra = {}) => {
	const dir = await mkdtemp(join(tmpdir(), 'jap-sess-'));
	const creds = initAuthCreds();
	creds.registered = true;
	creds.me = { id: '628123@s.whatsapp.net' };
	await writeFile(join(dir, 'creds.json'), JSON.stringify(creds, BufferJSON.replacer));
	await writeFile(join(dir, 'pre-key-1.json'), JSON.stringify({ public: 'a', private: 'b' }));
	await writeFile(join(dir, 'pre-key-2.json'), JSON.stringify({ public: 'c', private: 'd' }));
	await writeFile(join(dir, 'session-628999.0.json'), JSON.stringify({ s: 1 }));
	for (const [name, content] of Object.entries(extra)) {
		await writeFile(join(dir, name), content);
	}
	return dir;
};

// -------------------------------------------------------------- analyze/repair

test('analyzeAuthState reports health, counts, corrupted files and issues', async () => {
	const dir = await makeSessionDir();
	const healthy = await analyzeAuthState(dir);
	assert.equal(healthy.ok, true);
	assert.equal(healthy.registered, true);
	assert.equal(healthy.me, '628123@s.whatsapp.net');
	assert.equal(healthy.counts.creds, 1);
	assert.equal(healthy.counts['pre-key'], 2);
	assert.equal(healthy.counts.session, 1);
	assert.equal(healthy.totalFiles, 4);
	assert.ok(healthy.totalBytes > 0);
	assert.deepEqual(healthy.issues, []);

	await writeFile(join(dir, 'pre-key-3.json'), '{broken json');
	const sick = await analyzeAuthState(dir);
	assert.equal(sick.ok, false);
	assert.equal(sick.corrupted.length, 1);
	assert.equal(sick.corrupted[0].file, 'pre-key-3.json');
	assert.ok(sick.issues.some(i => i.includes('repairAuthFolder')));

	const empty = await mkdtemp(join(tmpdir(), 'jap-empty-'));
	const noCreds = await analyzeAuthState(empty);
	assert.equal(noCreds.ok, false);
	assert.ok(noCreds.issues.some(i => i.includes('creds.json missing')));

	const missing = await analyzeAuthState(join(empty, 'nope'));
	assert.ok(missing.issues[0].includes('cannot read folder'));
});

test('repairAuthFolder quarantines corrupted files so the state loads again', async () => {
	const dir = await makeSessionDir({ 'pre-key-3.json': '{broken', 'session-x.json': 'also broken' });
	const result = await repairAuthFolder(dir);
	assert.deepEqual(result.repaired.sort(), ['pre-key-3.json', 'session-x.json']);
	assert.equal(result.checked, 6);
	const files = await readdir(dir);
	assert.ok(files.includes('pre-key-3.json.corrupted'));
	assert.ok(!files.includes('pre-key-3.json'));
	assert.equal((await analyzeAuthState(dir)).corrupted.length, 0);
	const clean = await repairAuthFolder(dir);
	assert.deepEqual(clean.repaired, [], 'second run finds nothing');
});

// ------------------------------------------------------------- export/import

test('exportAuthToString/importAuthFromString roundtrip with perfect fidelity', async () => {
	const dir = await makeSessionDir();
	const str = await exportAuthToString(dir);
	assert.ok(isSessionExportString(str));
	assert.ok(str.startsWith('JAPSESS1.'));
	assert.equal(isSessionExportString('JAPSESS1'), false);
	assert.equal(isSessionExportString(42), false);

	const dest = join(tmpdir(), `jap-imp-${Date.now()}`);
	const { files } = await importAuthFromString(str, dest);
	assert.equal(files, 4);
	assert.equal(
		await readFile(join(dir, 'creds.json'), 'utf-8'),
		await readFile(join(dest, 'creds.json'), 'utf-8'),
		'byte-identical creds'
	);
	assert.equal((await analyzeAuthState(dest)).ok, true);

	await assert.rejects(() => importAuthFromString('nope', '/tmp/x'), /not a session export/);
	await assert.rejects(() => importAuthFromString('JAPSESS1.@@@broken@@@', '/tmp/x'), /corrupted/);
	const empty = await mkdtemp(join(tmpdir(), 'jap-empty2-'));
	await assert.rejects(() => exportAuthToString(empty), /no creds\.json/);
});

// ---------------------------------------------------------------- migration

test('migrateFolderToAuthState pushes a folder into any adapter with warnings', async () => {
	const dir = await makeSessionDir({
		'sender-key-123@g.us--62812.json': JSON.stringify({ k: 1 }), // ambiguous id
		'app-state-sync-key-abc__def.json': JSON.stringify({ keyData: 'x' }) // __ → /
	});
	const stored = {};
	let saved = 0;
	const target = {
		creds: { stale: true },
		keys: {
			set: async (data) => {
				for (const type in data) {
					for (const id in data[type]) {
						stored[`${type}|${id}`] = data[type][id];
					}
				}
			}
		}
	};
	const result = await migrateFolderToAuthState(dir, target, () => saved++);
	assert.equal(result.migrated.creds, 1);
	assert.equal(result.migrated['pre-key'], 2);
	assert.equal(result.migrated.session, 1);
	assert.equal(result.migrated['sender-key'], 1);
	assert.equal(saved, 1, 'saveCreds called once');
	assert.equal(target.creds.registered, true);
	assert.ok(!('stale' in target.creds), 'target creds fully replaced');
	assert.equal(stored['pre-key|1'].public, 'a');
	assert.equal(stored['app-state-sync-key|abc/def'].keyData, 'x', '__ reversed to /');
	assert.equal(result.warnings.length, 1);
	assert.ok(result.warnings[0].includes('sender-key-123'), 'ambiguous dash flagged');

	const empty = await mkdtemp(join(tmpdir(), 'jap-empty3-'));
	await assert.rejects(() => migrateFolderToAuthState(empty, target), /no creds\.json/);
});

// ---------------------------------------------------------- rotating backups

test('backupAuthStateRotating keeps N encrypted snapshots and prunes the rest', async () => {
	const dir = await makeSessionDir();
	const outDir = join(tmpdir(), `jap-bk-${Date.now()}`);
	const first = await backupAuthStateRotating(dir, outDir, { password: 'rahasia', keep: 2 });
	assert.equal(first.files, 4);
	assert.deepEqual(first.removed, []);
	await backupAuthStateRotating(dir, outDir, { password: 'rahasia', keep: 2 });
	const third = await backupAuthStateRotating(dir, outDir, { password: 'rahasia', keep: 2 });
	assert.equal(third.removed.length, 1, 'oldest pruned');
	assert.equal(third.kept, 2);
	const remaining = (await readdir(outDir)).filter(f => f.endsWith('.japbak'));
	assert.equal(remaining.length, 2);

	// snapshots restore to a working session
	const restoreDir = join(tmpdir(), `jap-rest-${Date.now()}`);
	await restoreAuthState(join(outDir, remaining[remaining.length - 1]), restoreDir, { password: 'rahasia' });
	const report = await analyzeAuthState(restoreDir);
	assert.equal(report.registered, true);
	assert.equal(report.counts['pre-key'], 2);

	await assert.rejects(() => backupAuthStateRotating(dir, outDir, {}), /password/);
	await assert.rejects(() => backupAuthStateRotating(dir, outDir, { password: 'x', keep: 0 }), /keep/);
});

// ----------------------------------------------------------------- shutdown

test('shutdown manager: ordered teardown, error isolation, run-once, signals', async () => {
	const order = [];
	const errors = [];
	const sock = { end: () => order.push('end'), ws: { close: () => order.push('ws') } };
	const shutdown = createShutdownManager({
		sock,
		saveCreds: () => order.push('creds'),
		onError: (e) => errors.push(e.step),
		timeoutMs: 500
	});
	shutdown.register('db', () => order.push('db'));
	shutdown.register('boom', () => {
		throw new Error('x');
	});
	const remove = shutdown.register('removed', () => order.push('nope'));
	remove();
	assert.equal(shutdown.hookCount, 2);

	const before = process.listenerCount('SIGINT');
	const detach = shutdown.attach();
	assert.equal(process.listenerCount('SIGINT'), before + 1, 'signal handler attached');
	detach();
	assert.equal(process.listenerCount('SIGINT'), before, 'detach removes it');

	const result = await shutdown.shutdown('test');
	assert.deepEqual(order, ['creds', 'db', 'end', 'ws'], 'creds flushed first, socket last');
	assert.equal(result.errors.length, 1);
	assert.equal(result.errors[0].step, 'boom');
	assert.deepEqual(errors, ['boom']);
	assert.equal(await shutdown.shutdown('again'), result, 'second call returns the same result');
	assert.equal(shutdown.isShuttingDown, true);
});

test('shutdown manager: hook timeout is caught, teardown continues', async () => {
	const order = [];
	const shutdown = createShutdownManager({ timeoutMs: 100 });
	shutdown.register('hang', () => new Promise(() => { })); // never resolves
	shutdown.register('after', () => order.push('after'));
	const result = await shutdown.shutdown();
	assert.equal(result.errors.length, 1);
	assert.match(String(result.errors[0].error.message), /timed out/);
	assert.deepEqual(order, ['after'], 'later hooks still run');
});

// -------------------------------------------------------------- CLI + exports

test('CLI session subcommands work end-to-end', async () => {
	const dir = await makeSessionDir();
	const cli = new URL('../lib/cli.js', import.meta.url).pathname;
	const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

	const analyze = run('session', 'analyze', dir);
	assert.ok(analyze.includes('registered: yes'));
	assert.ok(analyze.includes('session looks healthy'));

	const outFile = join(tmpdir(), `jap-cli-sess-${Date.now()}.txt`);
	assert.ok(run('session', 'export', dir, '--out', outFile).includes('exported'));
	const copyDir = join(tmpdir(), `jap-cli-copy-${Date.now()}`);
	assert.ok(run('session', 'import', outFile, copyDir).includes('restored 4 file(s)'));
	assert.equal((await analyzeAuthState(copyDir)).ok, true);
	assert.ok(run('session', 'repair', copyDir).includes('nothing to repair'));

	// unknown subcommand → non-zero exit
	assert.throws(() => execFileSync(process.execPath, [cli, 'session', 'wat'], { encoding: 'utf8', stdio: 'pipe' }));
});

test('barrel and type definitions export the session/system tools', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['session-tools', 'shutdown']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
	const authSecureDts = readFileSync(new URL('../lib/Utils/auth-secure.d.ts', import.meta.url), 'utf8');
	assert.ok(authSecureDts.includes('backupAuthStateRotating'), 'rotating backup typed');
	const cli = readFileSync(new URL('../lib/cli.js', import.meta.url), 'utf8');
	assert.ok(cli.includes("case 'session'"), 'CLI has the session command');
});
