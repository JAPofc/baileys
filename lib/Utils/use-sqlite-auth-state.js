import { chmod, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { proto } from '../../WAProto/index.js';
import { initAuthCreds } from './auth-utils.js';
import { BufferJSON } from './generics.js';
async function loadBetterSqlite3() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('better-sqlite3'));
        return mod.default ?? mod;
    }
    catch (err) {
        const helpful = new Error('`better-sqlite3` is required for `useSqliteAuthState`. Install it as a peer dependency: `npm install better-sqlite3` (or `yarn add better-sqlite3`).');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        helpful.cause = err;
        throw helpful;
    }
}
const CREDS_ROW_KEY = '__creds__';
const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS creds (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signal_keys (
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (type, id)
);
CREATE INDEX IF NOT EXISTS signal_keys_type_idx ON signal_keys(type);
`;
// JAP@Add 29-08-26 --- Migration tracking for the auth-state schema,
// wa_migrations pattern (packages/store-sqlite/src/migrations.ts). Each entry
// is `{ id, sql }`; applied migrations are recorded by id in `wa_migrations`
// so `db.exec(...)` schema changes are only ever run once per database file,
// letting future releases evolve the schema without a manual ALTER step from
// the user. Kept as an ordered array (not a folder of files) since the schema
// here is a single flat file with per-domain version keys.
const MIGRATIONS = [
    { id: '0001_init', sql: CREATE_SCHEMA_SQL }
];
function ensureMigrationsTable(db) {
    db.exec('CREATE TABLE IF NOT EXISTS wa_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
}
function runMigrations(db) {
    ensureMigrationsTable(db);
    const applied = new Set(db.prepare('SELECT id FROM wa_migrations').all().map((r) => r.id));
    const insertMigration = db.prepare('INSERT INTO wa_migrations (id, applied_at) VALUES (?, ?)');
    for (const migration of MIGRATIONS) {
        if (applied.has(migration.id))
            continue;
        const tx = db.transaction(() => {
            db.exec(migration.sql);
            insertMigration.run(migration.id, Date.now());
        });
        tx();
    }
}
export async function useSqliteAuthState(opts) {
    let db;
    // JAP@Fix (§2.163): `database` is meant to be an ALREADY-OPEN better-sqlite3 handle, but
    // both getting-started guides showed `useSqliteAuthState({ database: './auth.db' })`.
    // That assigned the string to `db` and died two lines later on
    // `TypeError: db.pragma is not a function` -- a message that tells you nothing about the
    // real mistake. The docs are fixed, and a string is now simply accepted as a path so the
    // thousands of copies of that snippet already out there start working instead of crashing.
    const dbPath = opts.dbPath ?? (typeof opts.database === 'string' ? opts.database : undefined);
    const handle = typeof opts.database === 'string' ? undefined : opts.database;
    if (handle) {
        db = handle;
    }
    else {
        if (!dbPath) {
            throw new TypeError('useSqliteAuthState: pass `dbPath` (a file path) or `database` (an open better-sqlite3 instance).');
        }
        // JAP@Fix (§2.164): `useMultiFileAuthState` creates its folder; this one did not, so
        // a nested path like './data/auth.db' failed with SQLITE_CANTOPEN. (`mkdir` was
        // already imported here and never used -- the intent existed and was lost.)
        const parent = dirname(dbPath);
        if (parent && parent !== '.') {
            await mkdir(parent, { recursive: true, mode: 0o700 }).catch(() => { });
        }
        const Database = await loadBetterSqlite3();
        db = new Database(dbPath);
        // JAP@Fix (§2.165): the other two adapters are explicit that auth material must not
        // be world-readable (0600 files, 0700 dir). This one left the database at the
        // process umask -- typically 0644 -- with creds and every Signal key inside it.
        for (const suffix of ['', '-wal', '-shm']) {
            await chmod(`${dbPath}${suffix}`, 0o600).catch(() => { });
        }
    }
    // WAL mode allows concurrent reads alongside a single writer; matches
    // what SQLite recommends for read-heavy workloads with sporadic writes.
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    runMigrations(db);
    // JAP@Fix (session pruning): the old periodic cleanup DELETED live signal
    // material — 'session' rows are ACTIVE Signal sessions (deleting one makes
    // the next message from that device undecryptable), and 'pre-key' rows may
    // still be referenced by the server (deleting them causes "no matching
    // pre-key" failures on incoming messages). Worse, the "keep last 500 by
    // rowid" heuristic was wrong: ON CONFLICT DO UPDATE keeps the original
    // rowid, so frequently-used long-lived sessions looked "old" and got
    // deleted first. Signal material is already removed correctly through
    // keys.set({ type: { id: null } }) by the signal layer when it is truly
    // obsolete. The periodic task now only does the safe part: WAL checkpoint.
    const _walCleanupInterval = setInterval(() => {
        try {
            db.pragma('wal_checkpoint(PASSIVE)');
        } catch { /* ignore checkpoint errors — non-fatal */ }
    }, 30 * 60 * 1000);
    // Allow Node process to exit even if interval is still running
    if (_walCleanupInterval.unref) _walCleanupInterval.unref();
    const stmts = {
        credsSelect: db.prepare('SELECT value FROM creds WHERE key = ?'),
        credsUpsert: db.prepare('INSERT INTO creds (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
        keySelect: db.prepare('SELECT value FROM signal_keys WHERE type = ? AND id = ?'),
        keyUpsert: db.prepare('INSERT INTO signal_keys (type, id, value) VALUES (?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET value = excluded.value'),
        keyDelete: db.prepare('DELETE FROM signal_keys WHERE type = ? AND id = ?'),
        keyListIds: db.prepare('SELECT id FROM signal_keys WHERE type = ?'),
        keyList: db.prepare('SELECT id, value FROM signal_keys WHERE type = ?'),
        clearKeys: db.prepare('DELETE FROM signal_keys')
    };
    const loadCreds = () => {
        const row = stmts.credsSelect.get(CREDS_ROW_KEY);
        if (!row)
            return initAuthCreds();
        try {
            return JSON.parse(row.value, BufferJSON.reviver);
        }
        catch (err) {
            // JAP@Fix (§2.166): a damaged creds row surfaced as a bare SyntaxError with no
            // hint that it came from the auth database. Throwing is correct -- see §2.161,
            // we must never silently start a fresh session over corrupt auth -- so this only
            // makes the failure identifiable.
            throw new Error('useSqliteAuthState: the stored creds row is corrupt and cannot be parsed. ' +
                'Refusing to start a fresh session over it — repair or delete the row intentionally first.', { cause: err });
        }
    };
    const persistCreds = (creds) => {
        stmts.credsUpsert.run(CREDS_ROW_KEY, JSON.stringify(creds, BufferJSON.replacer));
    };
    const creds = loadCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const row = stmts.keySelect.get(type, id);
                        if (row) {
                            let value = JSON.parse(row.value, BufferJSON.reviver);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const writeTx = db.transaction(() => {
                        for (const category in data) {
                            for (const id in data[category]) {
                                const value = data[category][id];
                                if (value) {
                                    const stringified = JSON.stringify(value, BufferJSON.replacer);
                                    stmts.keyUpsert.run(category, id, stringified);
                                }
                                else {
                                    stmts.keyDelete.run(category, id);
                                }
                            }
                        }
                    });
                    writeTx();
                }
            }
        },
        saveCreds: async () => {
            persistCreds(creds);
        },
        // JAP@Fix: release the WAL cleanup interval and (if we opened it ourselves)
        // the underlying db handle. Without this, every useSqliteAuthState() call
        // (e.g. re-pairing / rotating sessions) leaked a timer + open sqlite fd forever.
        close: async () => {
            clearInterval(_walCleanupInterval);
            if (!handle) {
                try {
                    db.close();
                }
                catch { /* already closed */ }
            }
        }
    };
}
