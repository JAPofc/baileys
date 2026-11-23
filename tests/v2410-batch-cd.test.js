/**
 * tests/v2410-batch-cd.test.js — batch CD (v2.4.10)
 *
 * `useSqliteAuthState` had no test coverage at all before this file.
 * `better-sqlite3` is an optional peer dependency and is not installed in CI, so the
 * behavioural tests drive the adapter through an injected fake handle; the tests that must
 * touch the filesystem assert on what happens *before* the driver is loaded.
 *
 * §2.163 the documented `{ database: './auth.db' }` form died on `db.pragma is not a function`
 * §2.164 a nested dbPath was not created, unlike every other adapter
 * §2.165 the auth database was left at the process umask, not 0600
 * §2.166 a corrupt creds row surfaced as a bare SyntaxError
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { useSqliteAuthState } from '../lib/Utils/use-sqlite-auth-state.js';

const freshDir = () => mkdtemp(join(tmpdir(), 'jap-sqlite-'));

/** Minimal in-memory stand-in for a better-sqlite3 handle. */
const fakeDb = (seed = {}) => {
	const creds = new Map(Object.entries(seed.creds ?? {}));
	const keys = new Map(Object.entries(seed.keys ?? {}));
	const migrations = new Set();
	let closed = false;
	const run = (sql, args) => {
		if (sql.startsWith('INSERT INTO wa_migrations')) { migrations.add(args[0]); return; }
		if (sql.startsWith('INSERT INTO creds')) { creds.set(args[0], args[1]); return; }
		if (sql.startsWith('INSERT INTO signal_keys')) { keys.set(`${args[0]}|${args[1]}`, args[2]); return; }
		if (sql.startsWith('DELETE FROM signal_keys WHERE')) { keys.delete(`${args[0]}|${args[1]}`); return; }
		if (sql.startsWith('DELETE FROM signal_keys')) { keys.clear(); return; }
	};
	return {
		_state: { creds, keys, get closed() { return closed; } },
		pragma() {},
		exec() {},
		prepare(sql) {
			return {
				run: (...args) => run(sql, args),
				get: (...args) => {
					if (sql.startsWith('SELECT value FROM creds')) {
						const v = creds.get(args[0]);
						return v === undefined ? undefined : { value: v };
					}
					if (sql.startsWith('SELECT value FROM signal_keys')) {
						const v = keys.get(`${args[0]}|${args[1]}`);
						return v === undefined ? undefined : { value: v };
					}
					return undefined;
				},
				all: () => (sql.includes('wa_migrations') ? [...migrations].map(id => ({ id })) : [])
			};
		},
		transaction: fn => (...a) => fn(...a),
		close() { closed = true; }
	};
};

/**
 * JAP@Fix (§2.214): these two tests asserted `rejects` because `better-sqlite3` was not
 * installed -- they pinned the ABSENCE OF A DRIVER as the specification. Install the
 * optional peer and they fail, not because the adapter broke but because the environment
 * changed. A test must assert the contract, which here is "a string `database` is a path",
 * and that contract has two correct outcomes depending on whether the driver is there.
 */
const driverInstalled = await (async () => {
	try {
		await import('better-sqlite3');
		return true;
	} catch {
		return false;
	}
})();

test('§2.163 a string passed as `database` is treated as a path, not crashed on', async () => {
	// Previously: TypeError: db.pragma is not a function — the exact snippet both
	// getting-started guides shipped.
	const dir = await freshDir();
	const dbPath = join(dir, 'string-form.db');
	try {
		if (driverInstalled) {
			const auth = await useSqliteAuthState({ database: dbPath });
			try {
				assert.ok(auth.state.creds, 'the string was opened as a database path');
				assert.ok((await stat(dbPath)).isFile(), 'and the file is where the string said');
			} finally {
				await auth.close();
			}
		} else {
			await assert.rejects(
				() => useSqliteAuthState({ database: dbPath }),
				err => {
					assert.doesNotMatch(err.message, /db\.pragma is not a function/, 'no cryptic TypeError');
					assert.match(err.message, /better-sqlite3/, 'it reached the driver load, i.e. it was understood as a path');
					return true;
				}
			);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.163 neither option given produces an actionable error', async () => {
	await assert.rejects(() => useSqliteAuthState({}), /pass `dbPath`.*or `database`/s);
});

test('§2.163 an injected handle is still used directly and never closed by us', async () => {
	const db = fakeDb();
	const auth = await useSqliteAuthState({ database: db });
	assert.ok(auth.state.creds, 'creds initialised');
	await auth.close();
	assert.equal(db._state.closed, false, 'a caller-owned handle must stay open');
});

test('§2.164 a nested dbPath has its parent directory created', async () => {
	const dir = await freshDir();
	const nested = join(dir, 'deep', 'nested', 'auth.db');
	try {
		// the directory work happens before the driver is loaded, so this holds either way
		if (driverInstalled) {
			const auth = await useSqliteAuthState({ dbPath: nested });
			await auth.close();
		} else {
			await assert.rejects(() => useSqliteAuthState({ dbPath: nested }), /better-sqlite3/);
		}
		const info = await stat(join(dir, 'deep', 'nested'));
		assert.ok(info.isDirectory(), 'the parent path was created');
		assert.equal(info.mode & 0o777, 0o700, 'and it is private, matching useMultiFileAuthState');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('§2.166 a corrupt creds row is refused with an identifiable error', async () => {
	const db = fakeDb({ creds: { __creds__: '{"noiseKey": NOT JSON' } });
	await assert.rejects(
		() => useSqliteAuthState({ database: db }),
		err => {
			assert.match(err.message, /creds row is corrupt/, 'names the problem');
			assert.match(err.message, /Refusing to start a fresh session/, 'and the §2.161 stance');
			assert.ok(err.cause, 'the original parse error is preserved');
			return true;
		}
	);
});

test('§2.166 a valid creds row still loads', async () => {
	const db = fakeDb({ creds: { __creds__: JSON.stringify({ registered: true, me: { id: '1@s.whatsapp.net' } }) } });
	const auth = await useSqliteAuthState({ database: db });
	assert.equal(auth.state.creds.registered, true);
	await auth.close();
});

test('keys round-trip through the adapter and deletion really deletes', async () => {
	const db = fakeDb();
	const auth = await useSqliteAuthState({ database: db });
	await auth.state.keys.set({ 'pre-key': { 1: { a: 1 }, 2: { b: 2 } } });
	assert.deepEqual(await auth.state.keys.get('pre-key', ['1', '2']), { 1: { a: 1 }, 2: { b: 2 } });

	await auth.state.keys.set({ 'pre-key': { 1: null } });
	const after = await auth.state.keys.get('pre-key', ['1', '2']);
	assert.equal(after['1'], undefined, 'a null value removes the row');
	assert.deepEqual(after['2'], { b: 2 }, 'and leaves its neighbours alone');
	await auth.close();
});

test('saveCreds persists the live creds object', async () => {
	const db = fakeDb();
	const auth = await useSqliteAuthState({ database: db });
	auth.state.creds.registered = true;
	await auth.saveCreds();
	assert.equal(JSON.parse(db._state.creds.get('__creds__')).registered, true);
	await auth.close();
});

test('§2.163 the documented examples match the implementation', async () => {
	for (const doc of ['docs/getting-started.md', 'docs/id/mulai.md']) {
		const text = await readFile(doc, 'utf-8');
		assert.doesNotMatch(text, /useSqliteAuthState\(\{\s*database:\s*'\.\//,
			`${doc} must not show a string passed as \`database\``);
		assert.match(text, /useSqliteAuthState\(\{\s*dbPath:/, `${doc} shows the canonical option`);
	}
});

/**
 * §2.165 — the database file must not be left at the process umask.
 *
 * This cannot be exercised end-to-end here: creating a real database needs `better-sqlite3`,
 * which is an optional peer dependency and absent in CI. Asserting on the source is weaker
 * than a behavioural test and is used deliberately, following the precedent of
 * `§2.75 the socket routes an incomplete sync into the snapshot-retry recovery`.
 * If the adapter ever gains a pure-JS driver, replace this with a real stat() check.
 */
test('§2.165 the adapter tightens permissions on the database it creates', async () => {
	const src = await readFile('lib/Utils/use-sqlite-auth-state.js', 'utf-8');
	assert.match(src, /chmod\(`\$\{dbPath\}\$\{suffix\}`, 0o600\)/, 'chmods the db file');
	assert.match(src, /\['', '-wal', '-shm'\]/, 'and its WAL/shm sidecars, which hold the same data');
	// the sibling adapters set the standard this one was missing
	const multi = await readFile('lib/Utils/use-multi-file-auth-state.js', 'utf-8');
	assert.match(multi, /mode: 0o600/);
	assert.match(multi, /mode: 0o700/);
});
