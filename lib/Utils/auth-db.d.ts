import type { AuthenticationState } from '../Types/index.js';
/** Storage key under which credentials are persisted. */
export declare const AUTH_CREDS_KEY = "creds";
/** Serialize an auth value with BufferJSON (Buffers survive round-trips). */
export declare const encodeAuthValue: (value: unknown) => string;
/** Parse a stored auth value; revives app-state-sync-key records into proto objects. */
export declare const decodeAuthValue: (type: string, raw: string | null | undefined) => any;
/** Key-value store contract shared by all database auth adapters. */
export type AuthKVStore = {
    read(type: string, id: string): Promise<string | null>;
    readMany(type: string, ids: string[]): Promise<Record<string, string>>;
    write(type: string, id: string, value: string): Promise<void>;
    apply(writes: Array<{ type: string; id: string; value: string }>, removals: Array<{ type: string; id: string }>): Promise<void>;
    clear(): Promise<void>;
    close?(): Promise<void>;
};
export type DBAuthState = {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    clearAuth: () => Promise<void>;
    close: () => Promise<void>;
};
/** Build a Baileys auth state from any store implementing AuthKVStore. */
export declare const makeAuthStateFromStore: (store: AuthKVStore) => Promise<DBAuthState>;
/**
 * Redis-backed auth state. Works with ioredis AND node-redis clients.
 * Pass an existing `client`, or a `uri` (lazily imports `ioredis`).
 */
export declare function useRedisAuthState(opts?: {
    client?: any;
    uri?: string;
    session?: string;
    prefix?: string;
}): Promise<DBAuthState>;
/**
 * MongoDB-backed auth state. Pass an existing `collection`, or a `uri`
 * (lazily imports `mongodb`).
 */
export declare function useMongoAuthState(opts?: {
    collection?: any;
    uri?: string;
    dbName?: string;
    collectionName?: string;
    session?: string;
}): Promise<DBAuthState>;
/**
 * Postgres-backed auth state (node-postgres). Pass an existing `client`
 * (Pool or Client), or a `uri` (lazily imports `pg`). Table auto-created.
 */
export declare function usePostgresAuthState(opts?: {
    client?: any;
    uri?: string;
    table?: string;
    session?: string;
}): Promise<DBAuthState>;
/**
 * MySQL/MariaDB-backed auth state (mysql2/promise shape). Pass an existing
 * `client`, or a `uri` (lazily imports `mysql2/promise`). Table auto-created.
 */
export declare function useMySQLAuthState(opts?: {
    client?: any;
    uri?: string;
    table?: string;
    session?: string;
}): Promise<DBAuthState>;
