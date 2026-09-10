/** Generic key-value store backed by better-sqlite3 (lazy-loaded). */
export class SQLiteStore {
    constructor(db: any);
    /** Async factory — await this instead of `new SQLiteStore(dbPath)`. */
    static create(dbPath: string): Promise<SQLiteStore>;
    get(key: string): any;
    /** `undefined`/`null` values delete the key. */
    set(key: string, value: any): void;
    del(key: string): void;
    close(): void;
}
