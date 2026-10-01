// JAP@Add --- Database auth-state adapters (Redis / MongoDB / Postgres / MySQL)
//
// One shared store abstraction + four thin adapters. Every adapter:
//   - accepts an EXISTING client (`{ client }`) — no forced connection ownership,
//     and fully testable offline with a fake client
//   - or lazily imports its driver (`ioredis` / `mongodb` / `pg` / `mysql2`)
//     ONLY when a `uri` is given — none of these are hard dependencies
//   - round-trips values through BufferJSON (Buffers survive) and revives
//     `app-state-sync-key` records into proto objects, matching the behaviour
//     of useMultiFileAuthState / useSqliteAuthState.
//
// API (all four):
//   const { state, saveCreds, clearAuth, close } = await useRedisAuthState({ client })
import { proto } from '../../WAProto/index.js';
import { initAuthCreds } from './auth-utils.js';
import { BufferJSON } from './generics.js';
export const AUTH_CREDS_KEY = 'creds';
export const encodeAuthValue = (value) => JSON.stringify(value, BufferJSON.replacer);
export const decodeAuthValue = (type, raw) => {
    if (raw === null || raw === undefined) {
        return null;
    }
    const value = typeof raw === 'string' ? JSON.parse(raw, BufferJSON.reviver) : raw;
    if (type === 'app-state-sync-key' && value) {
        return proto.Message.AppStateSyncKeyData.fromObject(value);
    }
    return value;
};
const loadOptionalModule = async (name, usedBy) => {
    try {
        const mod = await import(name);
        return mod.default ?? mod;
    }
    catch (err) {
        const helpful = new Error(`\`${name}\` is required for \`${usedBy}({ uri })\`. ` +
            `Install it (\`npm install ${name}\`) or pass an already-connected \`client\` instead.`);
        helpful.cause = err;
        throw helpful;
    }
};
/**
 * Build a Baileys auth state from any key-value store implementing:
 *   read(type, id) -> string|null
 *   readMany(type, ids) -> { [id]: string }
 *   write(type, id, value) -> void
 *   apply(writes: {type,id,value}[], removals: {type,id}[]) -> void
 *   clear() -> void
 *   close?() -> void
 */
export const makeAuthStateFromStore = async (store) => {
    if (!store || typeof store.read !== 'function' || typeof store.readMany !== 'function' ||
        typeof store.write !== 'function' || typeof store.apply !== 'function' || typeof store.clear !== 'function') {
        throw new Error('makeAuthStateFromStore: store must implement read/readMany/write/apply/clear');
    }
    const storedCreds = await store.read(AUTH_CREDS_KEY, AUTH_CREDS_KEY);
    const creds = decodeAuthValue(AUTH_CREDS_KEY, storedCreds) ?? initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    const rows = await store.readMany(type, ids);
                    for (const id of ids) {
                        const value = decodeAuthValue(type, rows?.[id]);
                        if (value) {
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const writes = [];
                    const removals = [];
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            if (value) {
                                writes.push({ type, id, value: encodeAuthValue(value) });
                            }
                            else {
                                removals.push({ type, id });
                            }
                        }
                    }
                    if (writes.length || removals.length) {
                        await store.apply(writes, removals);
                    }
                }
            }
        },
        saveCreds: async () => {
            await store.write(AUTH_CREDS_KEY, AUTH_CREDS_KEY, encodeAuthValue(creds));
        },
        clearAuth: async () => {
            await store.clear();
        },
        close: async () => {
            await store.close?.();
        }
    };
};
const pickMethod = (client, names, driver) => {
    for (const name of names) {
        if (typeof client[name] === 'function') {
            return name;
        }
    }
    throw new Error(`${driver} client exposes none of: ${names.join(', ')}`);
};
/**
 * Redis-backed auth state. Works with ioredis AND node-redis clients
 * (method-name differences are resolved at runtime).
 * `useRedisAuthState({ client })` or `useRedisAuthState({ uri, session?, prefix? })`.
 */
export async function useRedisAuthState(opts = {}) {
    const session = opts.session ?? 'default';
    const prefix = opts.prefix ?? 'baileys-auth';
    let client = opts.client;
    let owned = false;
    if (!client) {
        if (!opts.uri) {
            throw new Error('useRedisAuthState needs { client } or { uri }');
        }
        const Redis = await loadOptionalModule('ioredis', 'useRedisAuthState');
        client = new Redis(opts.uri);
        owned = true;
    }
    if (typeof client.connect === 'function' && client.isOpen === false) {
        await client.connect();
    }
    const cmd = {
        hget: pickMethod(client, ['hGet', 'hget'], 'redis'),
        hmget: pickMethod(client, ['hmGet', 'hmget'], 'redis'),
        hset: pickMethod(client, ['hSet', 'hset'], 'redis'),
        hdel: pickMethod(client, ['hDel', 'hdel'], 'redis'),
        del: pickMethod(client, ['del', 'DEL'], 'redis'),
        keys: pickMethod(client, ['keys', 'KEYS'], 'redis')
    };
    const hashKey = (type) => `${prefix}:${session}:${type}`;
    const store = {
        read: async (type, id) => (await client[cmd.hget](hashKey(type), id)) ?? null,
        readMany: async (type, ids) => {
            if (!ids.length) {
                return {};
            }
            const values = await client[cmd.hmget](hashKey(type), ids);
            const rows = {};
            ids.forEach((id, i) => {
                const v = values?.[i];
                if (v !== null && v !== undefined) {
                    rows[id] = v;
                }
            });
            return rows;
        },
        write: async (type, id, value) => {
            await client[cmd.hset](hashKey(type), id, value);
        },
        apply: async (writes, removals) => {
            for (const w of writes) {
                await client[cmd.hset](hashKey(w.type), w.id, w.value);
            }
            for (const r of removals) {
                await client[cmd.hdel](hashKey(r.type), r.id);
            }
        },
        clear: async () => {
            const keys = await client[cmd.keys](`${prefix}:${session}:*`);
            if (keys?.length) {
                await client[cmd.del](...keys);
            }
        },
        close: async () => {
            if (owned) {
                await (client.quit?.() ?? client.disconnect?.());
            }
        }
    };
    return makeAuthStateFromStore(store);
}
/**
 * MongoDB-backed auth state. One document per (type,id), unique compound index.
 * `useMongoAuthState({ collection })` or `useMongoAuthState({ uri, dbName?, collectionName?, session? })`.
 */
export async function useMongoAuthState(opts = {}) {
    const session = opts.session ?? 'default';
    let collection = opts.collection;
    let ownedClient = null;
    if (!collection) {
        if (!opts.uri) {
            throw new Error('useMongoAuthState needs { collection } or { uri }');
        }
        const mongodb = await loadOptionalModule('mongodb', 'useMongoAuthState');
        ownedClient = new mongodb.MongoClient(opts.uri);
        await ownedClient.connect();
        collection = ownedClient.db(opts.dbName ?? 'baileys').collection(opts.collectionName ?? 'auth_state');
    }
    await collection.createIndex?.({ session: 1, type: 1, id: 1 }, { unique: true });
    const store = {
        read: async (type, id) => {
            const doc = await collection.findOne({ session, type, id });
            return doc?.value ?? null;
        },
        readMany: async (type, ids) => {
            if (!ids.length) {
                return {};
            }
            const cursor = collection.find({ session, type, id: { $in: ids } });
            const docs = await cursor.toArray();
            const rows = {};
            for (const doc of docs) {
                rows[doc.id] = doc.value;
            }
            return rows;
        },
        write: async (type, id, value) => {
            await collection.updateOne({ session, type, id }, { $set: { value } }, { upsert: true });
        },
        apply: async (writes, removals) => {
            for (const w of writes) {
                await collection.updateOne({ session, type: w.type, id: w.id }, { $set: { value: w.value } }, { upsert: true });
            }
            if (removals.length) {
                await collection.deleteMany({
                    session,
                    $or: removals.map((r) => ({ type: r.type, id: r.id }))
                });
            }
        },
        clear: async () => {
            await collection.deleteMany({ session });
        },
        close: async () => {
            await ownedClient?.close?.();
        }
    };
    return makeAuthStateFromStore(store);
}
/**
 * Postgres-backed auth state (node-postgres `pg`). Table auto-created.
 * `usePostgresAuthState({ client })` or `usePostgresAuthState({ uri, table?, session? })`.
 * `client` must expose `query(text, params)` (Pool and Client both do).
 */
export async function usePostgresAuthState(opts = {}) {
    const session = opts.session ?? 'default';
    const table = opts.table ?? 'baileys_auth_state';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        throw new Error(`usePostgresAuthState: invalid table name '${table}'`);
    }
    let client = opts.client;
    let owned = false;
    if (!client) {
        if (!opts.uri) {
            throw new Error('usePostgresAuthState needs { client } or { uri }');
        }
        const pg = await loadOptionalModule('pg', 'usePostgresAuthState');
        client = new pg.Pool({ connectionString: opts.uri });
        owned = true;
    }
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
        session TEXT NOT NULL,
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (session, type, id)
    )`);
    const store = {
        read: async (type, id) => {
            const res = await client.query(`SELECT value FROM ${table} WHERE session = $1 AND type = $2 AND id = $3`, [session, type, id]);
            return res.rows?.[0]?.value ?? null;
        },
        readMany: async (type, ids) => {
            if (!ids.length) {
                return {};
            }
            const res = await client.query(`SELECT id, value FROM ${table} WHERE session = $1 AND type = $2 AND id = ANY($3)`, [session, type, ids]);
            const rows = {};
            for (const row of res.rows ?? []) {
                rows[row.id] = row.value;
            }
            return rows;
        },
        write: async (type, id, value) => {
            await client.query(`INSERT INTO ${table} (session, type, id, value) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (session, type, id) DO UPDATE SET value = EXCLUDED.value`, [session, type, id, value]);
        },
        apply: async (writes, removals) => {
            for (const w of writes) {
                await client.query(`INSERT INTO ${table} (session, type, id, value) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (session, type, id) DO UPDATE SET value = EXCLUDED.value`, [session, w.type, w.id, w.value]);
            }
            for (const r of removals) {
                await client.query(`DELETE FROM ${table} WHERE session = $1 AND type = $2 AND id = $3`, [session, r.type, r.id]);
            }
        },
        clear: async () => {
            await client.query(`DELETE FROM ${table} WHERE session = $1`, [session]);
        },
        close: async () => {
            if (owned) {
                await client.end?.();
            }
        }
    };
    return makeAuthStateFromStore(store);
}
/**
 * MySQL/MariaDB-backed auth state (`mysql2/promise`). Table auto-created.
 * `useMySQLAuthState({ client })` or `useMySQLAuthState({ uri, table?, session? })`.
 * `client` must expose `query(sql, params)` returning `[rows]` (mysql2/promise shape).
 */
export async function useMySQLAuthState(opts = {}) {
    const session = opts.session ?? 'default';
    const table = opts.table ?? 'baileys_auth_state';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        throw new Error(`useMySQLAuthState: invalid table name '${table}'`);
    }
    let client = opts.client;
    let owned = false;
    if (!client) {
        if (!opts.uri) {
            throw new Error('useMySQLAuthState needs { client } or { uri }');
        }
        const mysql = await loadOptionalModule('mysql2/promise', 'useMySQLAuthState');
        client = await mysql.createConnection(opts.uri);
        owned = true;
    }
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
        session VARCHAR(128) NOT NULL,
        type VARCHAR(64) NOT NULL,
        id VARCHAR(255) NOT NULL,
        value LONGTEXT NOT NULL,
        PRIMARY KEY (session, type, id)
    )`);
    const store = {
        read: async (type, id) => {
            const [rows] = await client.query(`SELECT value FROM ${table} WHERE session = ? AND type = ? AND id = ?`, [session, type, id]);
            return rows?.[0]?.value ?? null;
        },
        readMany: async (type, ids) => {
            if (!ids.length) {
                return {};
            }
            const [rows] = await client.query(`SELECT id, value FROM ${table} WHERE session = ? AND type = ? AND id IN (?)`, [session, type, ids]);
            const out = {};
            for (const row of rows ?? []) {
                out[row.id] = row.value;
            }
            return out;
        },
        write: async (type, id, value) => {
            await client.query(`INSERT INTO ${table} (session, type, id, value) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value)`, [session, type, id, value]);
        },
        apply: async (writes, removals) => {
            for (const w of writes) {
                await client.query(`INSERT INTO ${table} (session, type, id, value) VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE value = VALUES(value)`, [session, w.type, w.id, w.value]);
            }
            for (const r of removals) {
                await client.query(`DELETE FROM ${table} WHERE session = ? AND type = ? AND id = ?`, [session, r.type, r.id]);
            }
        },
        clear: async () => {
            await client.query(`DELETE FROM ${table} WHERE session = ?`, [session]);
        },
        close: async () => {
            if (owned) {
                await client.end?.();
            }
        }
    };
    return makeAuthStateFromStore(store);
}
