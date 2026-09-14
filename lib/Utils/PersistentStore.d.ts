/**
 * Common contract every backend below implements. A flat (domain, id) -> value
 * KV store — the same shape useSqliteAuthState() uses for its `signal_keys`
 * table. Query semantics (ordering, pagination) stay owned by
 * makeInMemoryStore() in JS; adapters are pure storage.
 */
export interface StoreAdapter {
	/** Create tables/collections/indexes if missing. Idempotent. */
	init(): Promise<void>;
	get(domain: string, id: string): Promise<unknown | undefined>;
	set(domain: string, id: string, value: unknown): Promise<void>;
	delete(domain: string, id: string): Promise<void>;
	/** All (id, value) pairs currently stored under `domain`. */
	list(domain: string): Promise<Array<[string, unknown]>>;
	/** All distinct domain names, optionally filtered by prefix (e.g. `messages:`). */
	listDomains(prefix?: string): Promise<string[]>;
	/** Remove every row under `domain`. */
	clear(domain: string): Promise<void>;
	close(): Promise<void>;
}

export function createSqliteStoreAdapter(opts?: { dbPath?: string; database?: any /* import('better-sqlite3').Database — optional peer */ }): Promise<StoreAdapter>;

export function createMongoStoreAdapter(opts?: {
	url?: string;
	dbName?: string;
	client?: any /* import('mongodb').MongoClient — optional peer */;
	collectionName?: string;
}): Promise<StoreAdapter>;

export function createMysqlStoreAdapter(
	opts?: { pool?: any /* import('mysql2/promise').Pool — optional peer */ } & Record<string, any> /* PoolOptions */
): Promise<StoreAdapter>;

export function createPostgresStoreAdapter(opts?: { pool?: any /* import('pg').Pool — optional peer */ } & Record<string, any> /* PoolConfig */): Promise<StoreAdapter>;

export function createRedisStoreAdapter(
	opts?: { url?: string; client?: any /* import('ioredis').Redis — optional peer */ } & Record<string, any> /* RedisOptions */
): Promise<StoreAdapter>;

export interface MakePersistentStoreConfig {
	adapter: StoreAdapter;
	socket?: any;
	logger?: any;
	chatKey?: any;
	labelAssociationKey?: any;
	/**
	 * Max messages hydrated into memory per chat at startup (newest first).
	 * Older history stays in the backend. Default 1000; 0 = unlimited.
	 */
	maxMessagesPerChat?: number;
}

/**
 * Persisted counterpart to makeInMemoryStore(). Same return shape (chats,
 * contacts, messages, groupMetadata, labels, bind, loadMessages, ...) plus
 * `adapter` and an async `close()`. Hydrates from `adapter` on creation, then
 * write-throughs every mutating event alongside the normal in-memory update.
 */
export function makePersistentStore(config: MakePersistentStoreConfig): Promise<
	ReturnType<typeof import('../Store/make-in-memory-store.js').makeInMemoryStore> & {
		adapter: StoreAdapter;
		/** Await all pending write-through persistence (use before shutdown). */
		flush(): Promise<void>;
		close(): Promise<void>;
	}
>;
