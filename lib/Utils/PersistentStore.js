import { Boom } from '@hapi/boom';
/**
 * JAP@Add 29-08-26 --- Persisted Store: chat/contact/message/group-metadata
 * persistence for @japofc/baileys, across 5 pluggable backends.
 *
 * Single-file by design (same style as MessageBuilder.js) instead of split
 * across lib/Store/adapters/*: everything — the 5 backend adapters plus the
 * makePersistentStore() wrapper — lives here as one module with multiple
 * named exports.
 *
 * Design note: rather than reimplementing chat ordering (KeyedDB), message
 * pagination, and label-association queries separately per SQL dialect, this
 * wraps the existing makeInMemoryStore() (which already owns and tests that
 * logic) and adds a write-through + startup-hydration layer via a generic
 * "adapter" contract:
 *
 *   adapter.init()                        create tables/collections/indexes (idempotent)
 *   adapter.get(domain, id)                -> value | undefined
 *   adapter.set(domain, id, value)
 *   adapter.delete(domain, id)
 *   adapter.list(domain)                   -> [[id, value], ...]
 *   adapter.listDomains(prefix?)           -> [domain, ...]
 *   adapter.clear(domain)
 *   adapter.close()
 *
 * Every adapter stores rows as (domain, id, value) — the exact shape
 * useSqliteAuthState() already uses for its `signal_keys` table. Domains:
 *   'chats'              id = chat.id
 *   'contacts'           id = contact.id
 *   'groupMetadata'      id = jid
 *   'labels'             id = label.id
 *   'labelAssociations'  id = `${chatId}:${messageId || ''}:${labelId}`
 *   `messages:${jid}`    id = message.key.id   (one domain per chat)
 *
 * Values are (de)serialized with BufferJSON so Buffers inside WAMessage /
 * signal payloads round-trip byte-for-byte identically across every backend.
 *
 * Each loadX() below lazy-imports its driver and throws a clear, actionable
 * error if it isn't installed — none of the 5 drivers are hard dependencies
 * of this package; pick whichever backend(s) you actually use and
 * `npm install` that one driver.
 */
import { BufferJSON } from './generics.js';
import { WAProto } from '../Types/index.js';
import { makeInMemoryStore } from '../Store/make-in-memory-store.js';

// ============================================================================
// Shared helpers
// ============================================================================

const labelAssociationId = (la) => `${la.chatId}:${la.messageId || ''}:${la.labelId}`;

const toTimestampNumber = (value) => {
	if (value === null || value === undefined) return 0;
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (typeof value === 'bigint') return Number(value);
	if (typeof value === 'string') {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	if (typeof value?.toNumber === 'function') {
		const n = value.toNumber();
		return Number.isFinite(n) ? n : 0;
	}
	if (typeof value?.low === 'number') {
		const n = value.low + (value.high || 0) * 0x100000000;
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
};

const messageSortKey = (msg) => {
	// WA messageTimestamp is seconds. Fall back to id for deterministic ordering
	// when old/crafted test messages have no timestamp.
	const ts = toTimestampNumber(msg?.messageTimestamp);
	return [ts, String(msg?.key?.id || '')];
};

const compareMessagesAsc = (a, b) => {
	const [ats, aid] = messageSortKey(a);
	const [bts, bid] = messageSortKey(b);
	return ats - bts || aid.localeCompare(bid);
};

const messageValueFromStored = (value) => WAProto.WebMessageInfo.fromObject(value);

const sortStoredMessageEntries = (entries) => entries
	.map(([id, value]) => [id, messageValueFromStored(value)])
	.sort((a, b) => compareMessagesAsc(a[1], b[1]));


function requireDriver(loader, pkgName, installHint) {
	return loader().catch((err) => {
		const helpful = new Error(`\`${pkgName}\` is required for this store adapter. Install it: \`npm install ${installHint || pkgName}\`.`);
		helpful.cause = err;
		throw helpful;
	});
}

// ============================================================================
// SQLite adapter (better-sqlite3)
// ============================================================================

/**
 * JAP@Add (§2.215): every adapter below prepares its statements/handles inside `init()`
 * and leaves them undefined until then. `makePersistentStore()` always calls `init()`, so
 * the normal path is fine -- but all five factories are PUBLIC exports, and a caller who
 * uses one directly got `Cannot read properties of undefined (reading 'get')` from deep
 * inside the adapter. Say what is actually wrong.
 *
 * @param {any} handle the lazily-created handle (`stmts`, `collection`, `pool`, `client`)
 * @param {string} driver adapter name for the message
 */
const requireInit = (handle, driver) => {
	if (!handle) {
		throw new Boom(`${driver} store adapter used before init(): call \`await adapter.init()\` once before get/set/list (makePersistentStore() does this for you).`, { statusCode: 500, data: { driver } });
	}
	return handle;
};

/**
 * JAP@Fix (§2.216): escape a user-supplied `listDomains()` prefix for a SQL LIKE pattern.
 *
 * The three SQL adapters disagreed. sqlite escaped backslash, percent and underscore and
 * said ESCAPE explicitly; mysql and postgres escaped only percent and underscore and left
 * the escape character implicit. A prefix containing a backslash therefore broke on two
 * backends out of three: the trailing wildcard we append was itself escaped by the
 * caller's trailing backslash, so the query looked for one literal domain instead of every
 * domain with that prefix. Same function, same argument, three different answers.
 *
 * One helper for all three, with the escape character always stated in the SQL.
 */
const likePrefixPattern = (prefix) => `${String(prefix).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const SQLITE_CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS wa_store (
  domain TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (domain, id)
);
CREATE INDEX IF NOT EXISTS wa_store_domain_idx ON wa_store(domain);
`;

/**
 * @param {{ dbPath?: string, database?: import('better-sqlite3').Database }} opts
 * @returns {Promise<StoreAdapter>}
 */
export async function createSqliteStoreAdapter(opts = {}) {
	let db;
	let ownsConnection = false;
	if (opts.database) {
		db = opts.database;
	} else {
		const mod = await requireDriver(() => import('better-sqlite3'), 'better-sqlite3');
		const Database = mod.default ?? mod;
		db = new Database(opts.dbPath || 'wa-store.db');
		ownsConnection = true;
	}

	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');

	let stmts;

	return {
		async init() {
			db.exec('CREATE TABLE IF NOT EXISTS wa_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
			const applied = new Set(db.prepare('SELECT id FROM wa_migrations').all().map((r) => r.id));
			if (!applied.has('0001_init')) {
				const tx = db.transaction(() => {
					db.exec(SQLITE_CREATE_SCHEMA_SQL);
					db.prepare('INSERT INTO wa_migrations (id, applied_at) VALUES (?, ?)').run('0001_init', Date.now());
				});
				tx();
			}
			stmts = {
				get: db.prepare('SELECT value FROM wa_store WHERE domain = ? AND id = ?'),
				set: db.prepare('INSERT INTO wa_store (domain, id, value) VALUES (?, ?, ?) ON CONFLICT(domain, id) DO UPDATE SET value = excluded.value'),
				del: db.prepare('DELETE FROM wa_store WHERE domain = ? AND id = ?'),
				list: db.prepare('SELECT id, value FROM wa_store WHERE domain = ?'),
				listDomains: db.prepare('SELECT DISTINCT domain FROM wa_store'),
				listDomainsPrefix: db.prepare("SELECT DISTINCT domain FROM wa_store WHERE domain LIKE ? ESCAPE '\\'"),
				clear: db.prepare('DELETE FROM wa_store WHERE domain = ?')
			};
		},
		async get(domain, id) {
			const row = requireInit(stmts, 'sqlite').get.get(domain, id);
			return row ? JSON.parse(row.value, BufferJSON.reviver) : undefined;
		},
		async set(domain, id, value) {
			requireInit(stmts, 'sqlite').set.run(domain, id, JSON.stringify(value, BufferJSON.replacer));
		},
		async delete(domain, id) {
			requireInit(stmts, 'sqlite').del.run(domain, id);
		},
		async list(domain) {
			return requireInit(stmts, 'sqlite').list.all(domain).map((r) => [r.id, JSON.parse(r.value, BufferJSON.reviver)]);
		},
		async listDomains(prefix) {
			if (!prefix) return requireInit(stmts, 'sqlite').listDomains.all().map((r) => r.domain);
			return requireInit(stmts, 'sqlite').listDomainsPrefix.all(likePrefixPattern(prefix)).map((r) => r.domain);
		},
		async clear(domain) {
			requireInit(stmts, 'sqlite').clear.run(domain);
		},
		async close() {
			if (ownsConnection) {
				try {
					db.close();
				} catch {
					/* already closed */
				}
			}
		}
	};
}

// ============================================================================
// MongoDB adapter
// ============================================================================

// BufferJSON round-trips Buffers as { type: 'Buffer', data: [...] }, which is
// exactly what a JSON.stringify(value, BufferJSON.replacer) -> JSON.parse
// round-trip produces. We deliberately don't store native BSON Binary here —
// keeping the on-disk shape textually identical to the sqlite/mysql/postgres
// adapters means the same value round-trips byte-for-byte across every backend.
function mongoSerialize(value) {
	return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}
function mongoDeserialize(doc) {
	return JSON.parse(JSON.stringify(doc), BufferJSON.reviver);
}

/**
 * @param {{ url?: string, dbName?: string, client?: import('mongodb').MongoClient, collectionName?: string }} opts
 * @returns {Promise<StoreAdapter>}
 */
export async function createMongoStoreAdapter(opts = {}) {
	const { MongoClient } = await requireDriver(() => import('mongodb'), 'mongodb');
	let client;
	let ownsConnection = false;
	if (opts.client) {
		client = opts.client;
	} else {
		client = new MongoClient(opts.url || 'mongodb://127.0.0.1:27017');
		ownsConnection = true;
	}

	let collection;

	return {
		async init() {
			if (ownsConnection) await client.connect();
			const db = client.db(opts.dbName || 'wa_store');
			collection = db.collection(opts.collectionName || 'wa_store');
			await collection.createIndex({ domain: 1, id: 1 }, { unique: true });
			await collection.createIndex({ domain: 1 });
		},
		async get(domain, id) {
			const doc = await requireInit(collection, 'mongodb').findOne({ domain, id });
			return doc ? mongoDeserialize(doc.value) : undefined;
		},
		async set(domain, id, value) {
			await requireInit(collection, 'mongodb').updateOne({ domain, id }, { $set: { domain, id, value: mongoSerialize(value) } }, { upsert: true });
		},
		async delete(domain, id) {
			await requireInit(collection, 'mongodb').deleteOne({ domain, id });
		},
		async list(domain) {
			const docs = await requireInit(collection, 'mongodb').find({ domain }).toArray();
			return docs.map((d) => [d.id, mongoDeserialize(d.value)]);
		},
		async listDomains(prefix) {
			const filter = prefix ? { domain: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } } : {};
			return await requireInit(collection, 'mongodb').distinct('domain', filter);
		},
		async clear(domain) {
			await requireInit(collection, 'mongodb').deleteMany({ domain });
		},
		async close() {
			if (ownsConnection) await client.close();
		}
	};
}

// ============================================================================
// MySQL adapter (mysql2)
// ============================================================================

const MYSQL_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS wa_store (
  domain VARCHAR(255) NOT NULL,
  id VARCHAR(512) NOT NULL,
  value LONGTEXT NOT NULL,
  PRIMARY KEY (domain, id),
  KEY wa_store_domain_idx (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

/**
 * @param {{ pool?: import('mysql2/promise').Pool } & import('mysql2/promise').PoolOptions} opts
 * @returns {Promise<StoreAdapter>}
 */
export async function createMysqlStoreAdapter(opts = {}) {
	const mysql = await requireDriver(() => import('mysql2/promise'), 'mysql2');
	let pool;
	let ownsConnection = false;
	if (opts.pool) {
		pool = opts.pool;
	} else {
		pool = mysql.createPool(opts);
		ownsConnection = true;
	}

	return {
		async init() {
			await pool.query('CREATE TABLE IF NOT EXISTS wa_migrations (id VARCHAR(64) PRIMARY KEY, applied_at BIGINT NOT NULL)');
			const [rows] = await pool.query('SELECT id FROM wa_migrations WHERE id = ?', ['0001_init']);
			if (rows.length === 0) {
				await pool.query(MYSQL_CREATE_TABLE_SQL);
				await pool.query('INSERT INTO wa_migrations (id, applied_at) VALUES (?, ?)', ['0001_init', Date.now()]);
			}
		},
		async get(domain, id) {
			const [rows] = await pool.query('SELECT value FROM wa_store WHERE domain = ? AND id = ?', [domain, id]);
			return rows.length ? JSON.parse(rows[0].value, BufferJSON.reviver) : undefined;
		},
		async set(domain, id, value) {
			await pool.query('INSERT INTO wa_store (domain, id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [
				domain,
				id,
				JSON.stringify(value, BufferJSON.replacer)
			]);
		},
		async delete(domain, id) {
			await pool.query('DELETE FROM wa_store WHERE domain = ? AND id = ?', [domain, id]);
		},
		async list(domain) {
			const [rows] = await pool.query('SELECT id, value FROM wa_store WHERE domain = ?', [domain]);
			return rows.map((r) => [r.id, JSON.parse(r.value, BufferJSON.reviver)]);
		},
		async listDomains(prefix) {
			const [rows] = prefix
				? await pool.query("SELECT DISTINCT domain FROM wa_store WHERE domain LIKE ? ESCAPE '\\\\'", [likePrefixPattern(prefix)])
				: await pool.query('SELECT DISTINCT domain FROM wa_store');
			return rows.map((r) => r.domain);
		},
		async clear(domain) {
			await pool.query('DELETE FROM wa_store WHERE domain = ?', [domain]);
		},
		async close() {
			if (ownsConnection) await pool.end();
		}
	};
}

// ============================================================================
// PostgreSQL adapter (pg)
// ============================================================================

const POSTGRES_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS wa_store (
  domain TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (domain, id)
);
CREATE INDEX IF NOT EXISTS wa_store_domain_idx ON wa_store(domain);
`;

/**
 * @param {{ pool?: import('pg').Pool } & import('pg').PoolConfig} opts
 * @returns {Promise<StoreAdapter>}
 */
export async function createPostgresStoreAdapter(opts = {}) {
	const mod = await requireDriver(() => import('pg'), 'pg');
	const { Pool } = mod.default ?? mod;
	let pool;
	let ownsConnection = false;
	if (opts.pool) {
		pool = opts.pool;
	} else {
		pool = new Pool(opts);
		ownsConnection = true;
	}

	return {
		async init() {
			await pool.query('CREATE TABLE IF NOT EXISTS wa_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
			const { rows } = await pool.query('SELECT id FROM wa_migrations WHERE id = $1', ['0001_init']);
			if (rows.length === 0) {
				await pool.query(POSTGRES_CREATE_TABLE_SQL);
				await pool.query('INSERT INTO wa_migrations (id, applied_at) VALUES ($1, $2)', ['0001_init', Date.now()]);
			}
		},
		async get(domain, id) {
			const { rows } = await pool.query('SELECT value FROM wa_store WHERE domain = $1 AND id = $2', [domain, id]);
			return rows.length ? JSON.parse(rows[0].value, BufferJSON.reviver) : undefined;
		},
		async set(domain, id, value) {
			await pool.query(
				'INSERT INTO wa_store (domain, id, value) VALUES ($1, $2, $3) ON CONFLICT (domain, id) DO UPDATE SET value = excluded.value',
				[domain, id, JSON.stringify(value, BufferJSON.replacer)]
			);
		},
		async delete(domain, id) {
			await pool.query('DELETE FROM wa_store WHERE domain = $1 AND id = $2', [domain, id]);
		},
		async list(domain) {
			const { rows } = await pool.query('SELECT id, value FROM wa_store WHERE domain = $1', [domain]);
			return rows.map((r) => [r.id, JSON.parse(r.value, BufferJSON.reviver)]);
		},
		async listDomains(prefix) {
			const { rows } = prefix
				? await pool.query("SELECT DISTINCT domain FROM wa_store WHERE domain LIKE $1 ESCAPE '\\'", [likePrefixPattern(prefix)])
				: await pool.query('SELECT DISTINCT domain FROM wa_store');
			return rows.map((r) => r.domain);
		},
		async clear(domain) {
			await pool.query('DELETE FROM wa_store WHERE domain = $1', [domain]);
		},
		async close() {
			if (ownsConnection) await pool.end();
		}
	};
}

// ============================================================================
// Redis adapter (ioredis)
// ============================================================================

// Redis has no notion of "distinct domains" the way a SQL/Mongo query does, so
// we keep an explicit registry: a Set of every domain name that has ever had a
// key written to it (`wa_store:domains`). Each domain's rows live in their own
// hash (`wa_store:h:${domain}` -> { id: value }), which keeps per-domain reads
// (list()/clear()) to a single HGETALL/DEL instead of a keyspace scan.
const REDIS_DOMAINS_SET_KEY = 'wa_store:domains';
const redisHashKey = (domain) => `wa_store:h:${domain}`;

/**
 * @param {{ url?: string, client?: import('ioredis').Redis } & import('ioredis').RedisOptions} opts
 * @returns {Promise<StoreAdapter>}
 */
export async function createRedisStoreAdapter(opts = {}) {
	const mod = await requireDriver(() => import('ioredis'), 'ioredis');
	const Redis = mod.default ?? mod;
	let client;
	let ownsConnection = false;
	if (opts.client) {
		client = opts.client;
	} else {
		client = opts.url ? new Redis(opts.url, opts) : new Redis(opts);
		ownsConnection = true;
	}

	return {
		async init() {
			// Nothing to migrate — Redis is schemaless. This exists purely to
			// satisfy the adapter contract and confirm connectivity early.
			await client.ping();
		},
		async get(domain, id) {
			const raw = await client.hget(redisHashKey(domain), id);
			return raw === null ? undefined : JSON.parse(raw, BufferJSON.reviver);
		},
		async set(domain, id, value) {
			await client.sadd(REDIS_DOMAINS_SET_KEY, domain);
			await client.hset(redisHashKey(domain), id, JSON.stringify(value, BufferJSON.replacer));
		},
		async delete(domain, id) {
			await client.hdel(redisHashKey(domain), id);
		},
		async list(domain) {
			const raw = await client.hgetall(redisHashKey(domain));
			return Object.entries(raw).map(([id, v]) => [id, JSON.parse(v, BufferJSON.reviver)]);
		},
		async listDomains(prefix) {
			const domains = await client.smembers(REDIS_DOMAINS_SET_KEY);
			return prefix ? domains.filter((d) => d.startsWith(prefix)) : domains;
		},
		async clear(domain) {
			await client.del(redisHashKey(domain));
			await client.srem(REDIS_DOMAINS_SET_KEY, domain);
		},
		async close() {
			if (ownsConnection) await client.quit();
		}
	};
}

// ============================================================================
// makePersistentStore — wraps makeInMemoryStore() with hydration + write-through
// ============================================================================

/**
 * @param {Parameters<typeof makeInMemoryStore>[0] & { adapter: StoreAdapter }} config
 */
export const makePersistentStore = async (config) => {
	const { adapter, maxMessagesPerChat = 1000, logger: storeLogger, ...inMemConfig } = config;
	if (!adapter) {
		throw new Error('makePersistentStore requires an `adapter` (see createSqliteStoreAdapter / createMongoStoreAdapter / createMysqlStoreAdapter / createPostgresStoreAdapter / createRedisStoreAdapter above)');
	}

	const store = makeInMemoryStore(inMemConfig);
	await adapter.init();

	// JAP@Fix (write-through concurrency): every ev.on handler below is async
	// and used to run fire-and-forget. Two problems: (1) concurrent events
	// interleaved their adapter writes, so a messages.update could persist
	// BEFORE the messages.upsert it modifies (ending as a lost update on
	// ordered backends); (2) any adapter error became an unhandledRejection
	// that could crash the process. All write-through work now flows through
	// one FIFO queue: strictly ordered, errors contained and logged.
	let writeQueue = Promise.resolve();
	const enqueue = (label, fn) => {
		writeQueue = writeQueue.then(fn).catch((err) => {
			(storeLogger?.error ?? console.error)(
				storeLogger ? { err, label } : `persistent-store write-through failed (${label}): ${err?.message}`,
				storeLogger ? 'persistent-store write-through failed' : undefined
			);
		});
		return writeQueue;
	};
	/** Resolves when every write-through enqueued so far has been persisted. */
	const flush = () => writeQueue;

	// --- Startup hydration: pull everything from the adapter into the
	// in-memory store before wiring live event write-through, so queries work
	// immediately even before the socket connects. ---
	const hydrate = async () => {
		const chats = (await adapter.list('chats')).map(([, v]) => v);
		if (chats.length) store.chats.upsert(...chats);

		const contacts = await adapter.list('contacts');
		for (const [id, value] of contacts) store.contacts[id] = value;

		const groupMetas = await adapter.list('groupMetadata');
		for (const [id, value] of groupMetas) store.groupMetadata[id] = value;

		const labels = await adapter.list('labels');
		for (const [id, value] of labels) store.labels.upsertById(id, value);

		const labelAssociations = await adapter.list('labelAssociations');
		if (labelAssociations.length) store.labelAssociations.upsert(...labelAssociations.map(([, v]) => v));

		const messageDomains = await adapter.listDomains('messages:');
		// JAP@Fix (§2.68 / v2.4.8): hydration used to assign a hand-rolled
		// `{ array, get, upsert }` literal to `store.messages[jid]`, standing in for
		// the store's own ordered dictionary. That dictionary has seven more methods
		// (`update`, `remove`, `updateAssign`, `clear`, `filter`, `toJSON`,
		// `fromJSON`) and makeInMemoryStore's own event handlers call them, so every
		// hydrated chat threw a TypeError on the next receipt or delete. Hand the
		// messages to the store's public `fromJSON()` instead -- it builds real
		// dictionaries through the same assertMessageList() the live path uses.
		const hydratedMessages = {};
		for (const domain of messageDomains) {
			const jid = domain.slice('messages:'.length);
			// JAP@Fix (pagination): hydration used to load EVERY stored message
			// of EVERY chat into memory — a long-lived bot with a year of
			// history OOMed at startup. Only the newest `maxMessagesPerChat`
			// (default 1000, 0 = unlimited) are hydrated; older history stays
			// in the backend and is reachable via loadOlderMessages().
			let msgs = sortStoredMessageEntries(await adapter.list(domain));
			if (maxMessagesPerChat > 0 && msgs.length > maxMessagesPerChat) {
				msgs = msgs.slice(-maxMessagesPerChat);
			}
			hydratedMessages[jid] = msgs.map(([, value]) => value);
		}
		if (Object.keys(hydratedMessages).length) {
			store.fromJSON({ chats: [], contacts: {}, labels: {}, labelAssociations: [], messages: hydratedMessages });
		}
	};
	await hydrate();

	/** Wire live event write-through. Call this with the same event emitter passed to store.bind(ev). */
	const bind = (ev) => {
		store.bind(ev);
		// Route every async handler through the FIFO write queue (see above).
		const on = (event, handler) => ev.on(event, (payload) => enqueue(event, () => handler(payload)));

		on('chats.upsert', async (newChats) => {
			for (const c of newChats) await adapter.set('chats', c.id, store.chats.get(c.id) || c);
		});
		on('chats.update', async (updates) => {
			for (const u of updates) {
				const chat = store.chats.get(u.id);
				if (chat) await adapter.set('chats', u.id, chat);
			}
		});
		on('chats.delete', async (deletions) => {
			for (const id of deletions) await adapter.delete('chats', id);
		});
		on('contacts.upsert', async (contacts) => {
			for (const c of contacts) await adapter.set('contacts', c.id, store.contacts[c.id] || c);
		});
		on('contacts.update', async (updates) => {
			for (const u of updates) {
				const contact = store.contacts[u.id];
				if (contact) await adapter.set('contacts', u.id, contact);
			}
		});
		on('messaging-history.set', async ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
			for (const c of newChats) await adapter.set('chats', c.id, store.chats.get(c.id) || c);
			for (const c of newContacts) await adapter.set('contacts', c.id, store.contacts[c.id] || c);
			for (const msg of newMessages) {
				const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
				await adapter.set(`messages:${jid}`, msg.key.id || '', msg);
			}
		});
		on('messages.upsert', async ({ messages: newMessages }) => {
			for (const msg of newMessages) {
				const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
				await adapter.set(`messages:${jid}`, msg.key.id || '', msg);
			}
		});
		on('messages.update', async (updates) => {
			for (const { key } of updates) {
				const jid = key.remoteJidAlt || key.remoteJid;
				const msg = store.messages[jid]?.get(key.id);
				if (msg) await adapter.set(`messages:${jid}`, key.id || '', msg);
			}
		});
		on('messages.delete', async (item) => {
			if ('all' in item) {
				await adapter.clear(`messages:${item.jid}`);
			} else {
				const jid = item.keys[0].remoteJidAlt || item.keys[0].remoteJid;
				for (const k of item.keys) await adapter.delete(`messages:${jid}`, k.id || '');
			}
		});
		on('message-receipt.update', async (updates) => {
			for (const { key } of updates) {
				const jid = key.remoteJidAlt || key.remoteJid;
				const msg = store.messages[jid]?.get(key.id);
				if (msg) await adapter.set(`messages:${jid}`, key.id || '', msg);
			}
		});
		on('messages.reaction', async (reactions) => {
			for (const { key } of reactions) {
				const jid = key.remoteJidAlt || key.remoteJid;
				const msg = store.messages[jid]?.get(key.id);
				if (msg) await adapter.set(`messages:${jid}`, key.id || '', msg);
			}
		});
		on('groups.update', async (updates) => {
			for (const u of updates) {
				const meta = store.groupMetadata[u.id];
				if (meta) await adapter.set('groupMetadata', u.id, meta);
			}
		});
		on('group-participants.update', async ({ id }) => {
			const meta = store.groupMetadata[id];
			if (meta) await adapter.set('groupMetadata', id, meta);
		});
		on('labels.edit', async (label) => {
			if (label.deleted) await adapter.delete('labels', label.id);
			else await adapter.set('labels', label.id, label);
		});
		on('labels.association', async ({ type, association }) => {
			const id = labelAssociationId(association);
			if (type === 'add') await adapter.set('labelAssociations', id, association);
			else if (type === 'remove') await adapter.delete('labelAssociations', id);
		});
	};

	/** fetchGroupMetadata already caches to store.groupMetadata; this also persists that cache entry. */
	const fetchGroupMetadata = async (jid, sock) => {
		const meta = await store.fetchGroupMetadata(jid, sock);
		if (meta) await adapter.set('groupMetadata', jid, meta);
		return meta;
	};

	const listStoredMessages = async (jid) => sortStoredMessageEntries(await adapter.list(`messages:${jid}`)).map(([, value]) => value);

	const loadMessages = async (jid, count, cursor) => {
		const stored = await listStoredMessages(jid);
		if (!stored.length) {
			return store.loadMessages(jid, count, cursor);
		}
		const mode = !cursor || 'before' in cursor ? 'before' : 'after';
		const cursorKey = cursor ? ('before' in cursor ? cursor.before : cursor.after) : undefined;
		const cursorId = cursorKey?.id;
		let selected;
		if (mode === 'before') {
			if (cursorId) {
				const idx = stored.findIndex((m) => m.key?.id === cursorId);
				if (idx < 0) return [];
				selected = stored.slice(0, idx);
			} else {
				selected = stored;
			}
			return count && selected.length > count ? selected.slice(-count) : selected;
		}
		if (cursorId) {
			const idx = stored.findIndex((m) => m.key?.id === cursorId);
			if (idx < 0) return [];
			selected = stored.slice(idx + 1);
		} else {
			selected = stored;
		}
		return count && selected.length > count ? selected.slice(0, count) : selected;
	};

	const loadMessage = async (jid, id) => {
		const inMemory = await store.loadMessage(jid, id);
		if (inMemory) return inMemory;
		const stored = await adapter.get(`messages:${jid}`, id);
		return stored ? messageValueFromStored(stored) : undefined;
	};

	const loadOlderMessages = async (jid, count, before) => loadMessages(jid, count, before ? { before } : undefined);

	/**
	 * JAP@Add (v2.4.8) --- how many messages the BACKEND holds for a chat.
	 * `maxMessagesPerChat` only caps what is hydrated into memory, so this is the
	 * only way to see what is actually on disk.
	 * @param {string} jid
	 * @returns {Promise<number>}
	 */
	const countStoredMessages = async (jid) => (await adapter.list(`messages:${jid}`)).length;

	/**
	 * JAP@Add (v2.4.8) --- trim a chat's persisted history to its newest `keep`
	 * messages. Nothing in the write-through path ever deletes, so a long-lived bot's
	 * backend grows without bound; this is the counterpart to `maxMessagesPerChat`.
	 * The in-memory view is left alone (it is already capped).
	 * @param {string} jid
	 * @param {number} keep newest messages to keep; `0` clears the chat
	 * @returns {Promise<number>} how many were deleted
	 */
	const pruneStoredMessages = async (jid, keep) => {
		if (!Number.isFinite(keep) || keep < 0) {
			throw new Error('pruneStoredMessages: `keep` must be a non-negative number');
		}
		const entries = sortStoredMessageEntries(await adapter.list(`messages:${jid}`));
		if (entries.length <= keep) {
			return 0;
		}
		const doomed = entries.slice(0, entries.length - keep);
		for (const [id] of doomed) {
			await adapter.delete(`messages:${jid}`, id);
		}
		return doomed.length;
	};

	return {

		...store,
		bind,
		fetchGroupMetadata,
		loadMessages,
		loadMessage,
		loadOlderMessages,
		countStoredMessages,
		pruneStoredMessages,
		adapter,
		/** JAP@Add: await all pending write-through persistence (use before shutdown). */
		flush,
		close: async () => {
			await flush(); // never drop queued writes on shutdown
			return adapter.close();
		}
	};
};
