/**
 * lib/Framework/Store/SQLiteStore.js
 * Author: J.AP (@japofc/baileys)
 *
 * Generic JSON key-value store backed by better-sqlite3, used by
 * SessionManager to persist per-JID state to disk. better-sqlite3 is an
 * optional peer dependency, so it is loaded lazily via an async `create()`
 * factory (a hard top-level import would crash the whole Framework import for
 * anyone who hasn't installed it).
 */

/** Lazily load the optional better-sqlite3 dependency with a helpful error. */
async function loadBetterSqlite3() {
    try {
        const mod = await import('better-sqlite3');
        return mod.default ?? mod;
    } catch (err) {
        const helpful = new Error('`better-sqlite3` is required for the Framework SQLiteStore. Install it as a peer dependency: `npm install better-sqlite3` (or `yarn add better-sqlite3`).');
        helpful.cause = err;
        throw helpful;
    }
}

export class SQLiteStore {
    constructor(db) {
        this.db = db;
        this.db.exec('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        this.getStmt = this.db.prepare('SELECT value FROM kv_store WHERE key = ?');
        this.setStmt = this.db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        this.delStmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
    }

    /** Async factory — opens the database once better-sqlite3 is loaded. */
    static async create(dbPath) {
        const Database = await loadBetterSqlite3();
        return new SQLiteStore(new Database(dbPath));
    }

    get(key) {
        const row = this.getStmt.get(key);
        if (!row) return undefined;
        try {
            return JSON.parse(row.value);
        } catch {
            return row.value; // tolerate legacy non-JSON rows
        }
    }

    set(key, value) {
        if (value === undefined || value === null) {
            this.del(key);
            return;
        }
        this.setStmt.run(key, JSON.stringify(value));
    }

    del(key) {
        this.delStmt.run(key);
    }

    close() {
        this.db.close();
    }
}
