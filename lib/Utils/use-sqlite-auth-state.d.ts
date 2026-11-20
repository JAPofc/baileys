/**
 * SQLite-backed auth state (requires the `better-sqlite3` peer dependency).
 *
 * Pass `dbPath` for a file path, or `database` for an already-open better-sqlite3 instance.
 * A string given as `database` is accepted as a path for backwards compatibility.
 */
export function useSqliteAuthState(opts: {
    dbPath?: string;
    /** An open better-sqlite3 Database, or a path string (treated as `dbPath`). */
    database?: unknown;
}): Promise<{
    state: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => Promise<{}>;
            set: (data: any) => Promise<void>;
        };
    };
    saveCreds: () => Promise<void>;
    close: () => Promise<void>;
}>;
