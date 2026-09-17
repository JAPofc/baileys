/**
 * Minimal structural view of a better-sqlite3 Database. Declared inline (not
 * `import type { Database } from 'better-sqlite3'`) because better-sqlite3 is
 * an OPTIONAL dependency — importing its types here would break `tsc` for
 * every consumer that doesn't have it installed.
 */
export interface SQLiteDatabaseLike {
    prepare(sql: string): {
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): unknown;
        all(...params: unknown[]): unknown[];
    };
    exec(sql: string): unknown;
    close(): void;
}

/** Generic key-value store backed by better-sqlite3 (lazy-loaded). */
export class SQLiteStore {
    constructor(db: SQLiteDatabaseLike);
    /** Async factory — await this instead of `new SQLiteStore(dbPath)`. */
    static create(dbPath: string): Promise<SQLiteStore>;
    get(key: string): unknown;
    /** `undefined`/`null` values delete the key. */
    set(key: string, value: unknown): void;
    del(key: string): void;
    close(): void;
}
