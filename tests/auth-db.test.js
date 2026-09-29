import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    useRedisAuthState, useMongoAuthState, usePostgresAuthState, useMySQLAuthState,
    makeAuthStateFromStore, encodeAuthValue, decodeAuthValue
} from '../lib/index.js';

// ---------- fake clients (offline) ----------

const makeFakeRedis = () => {
    const hashes = new Map(); // key -> Map(field -> value)
    const h = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); };
    return {
        data: hashes,
        hget: async (k, f) => h(k).get(f) ?? null,
        hmget: async (k, fields) => fields.map((f) => h(k).get(f) ?? null),
        hset: async (k, f, v) => { h(k).set(f, v); },
        hdel: async (k, f) => { h(k).delete(f); },
        del: async (...keys) => { for (const k of keys) hashes.delete(k); },
        keys: async (pattern) => {
            const prefix = pattern.replace(/\*$/, '');
            return [...hashes.keys()].filter((k) => k.startsWith(prefix));
        }
    };
};

const makeFakeMongo = () => {
    const docs = [];
    const match = (doc, q) => {
        if (q.$or) return q.$or.some((sub) => match(doc, sub));
        return Object.entries(q).every(([k, v]) => {
            if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(doc[k]);
            return doc[k] === v;
        });
    };
    return {
        docs,
        createIndex: async () => {},
        findOne: async (q) => docs.find((d) => match(d, q)) ?? null,
        find: (q) => ({ toArray: async () => docs.filter((d) => match(d, q)) }),
        updateOne: async (q, update, opts) => {
            const found = docs.find((d) => match(d, q));
            if (found) Object.assign(found, update.$set);
            else if (opts?.upsert) docs.push({ ...q, ...update.$set });
        },
        deleteMany: async (q) => {
            for (let i = docs.length - 1; i >= 0; i--) if (match(docs[i], q)) docs.splice(i, 1);
        }
    };
};

// Emulates enough of Postgres for our fixed set of queries.
const makeFakePg = () => {
    const rows = new Map(); // `${session}|${type}|${id}` -> value
    return {
        rows,
        query: async (text, params = []) => {
            if (text.startsWith('CREATE TABLE')) return { rows: [] };
            if (text.startsWith('SELECT value FROM')) {
                const v = rows.get(params.join('|'));
                return { rows: v === undefined ? [] : [{ value: v }] };
            }
            if (text.startsWith('SELECT id, value FROM')) {
                const [session, type, ids] = params;
                const out = [];
                for (const id of ids) {
                    const v = rows.get(`${session}|${type}|${id}`);
                    if (v !== undefined) out.push({ id, value: v });
                }
                return { rows: out };
            }
            if (text.startsWith('INSERT INTO')) {
                const [session, type, id, value] = params;
                rows.set(`${session}|${type}|${id}`, value);
                return { rows: [] };
            }
            if (text.startsWith('DELETE FROM') && params.length === 3) {
                rows.delete(params.join('|'));
                return { rows: [] };
            }
            if (text.startsWith('DELETE FROM')) {
                const [session] = params;
                for (const k of [...rows.keys()]) if (k.startsWith(`${session}|`)) rows.delete(k);
                return { rows: [] };
            }
            throw new Error(`fake pg: unhandled query: ${text}`);
        }
    };
};

// mysql2/promise shape: query() resolves to [rows]
const makeFakeMysql = () => {
    const rows = new Map();
    return {
        rows,
        query: async (text, params = []) => {
            if (text.startsWith('CREATE TABLE')) return [[]];
            if (text.startsWith('SELECT value FROM')) {
                const v = rows.get(params.join('|'));
                return [v === undefined ? [] : [{ value: v }]];
            }
            if (text.startsWith('SELECT id, value FROM')) {
                const [session, type, ids] = params;
                const out = [];
                for (const id of ids) {
                    const v = rows.get(`${session}|${type}|${id}`);
                    if (v !== undefined) out.push({ id, value: v });
                }
                return [out];
            }
            if (text.startsWith('INSERT INTO')) {
                const [session, type, id, value] = params;
                rows.set(`${session}|${type}|${id}`, value);
                return [[]];
            }
            if (text.startsWith('DELETE FROM') && params.length === 3) {
                rows.delete(params.join('|'));
                return [[]];
            }
            if (text.startsWith('DELETE FROM')) {
                const [session] = params;
                for (const k of [...rows.keys()]) if (k.startsWith(`${session}|`)) rows.delete(k);
                return [[]];
            }
            throw new Error(`fake mysql: unhandled query: ${text}`);
        }
    };
};

// ---------- shared adapter contract ----------

const exerciseAdapter = async (auth) => {
    const { state, saveCreds, clearAuth } = auth;
    // fresh creds generated
    assert.ok(state.creds.noiseKey.private instanceof Uint8Array);
    // save + reload round-trip happens via the store — write a signal key with a Buffer
    const buf = Buffer.from([1, 2, 3, 250]);
    await state.keys.set({ 'pre-key': { '42': { public: buf, private: buf } } });
    const got = await state.keys.get('pre-key', ['42', 'missing']);
    assert.deepEqual(Buffer.from(got['42'].public), buf, 'Buffer must survive round-trip');
    assert.equal(got['missing'], undefined);
    // deletion via null
    await state.keys.set({ 'pre-key': { '42': null } });
    const afterDelete = await state.keys.get('pre-key', ['42']);
    assert.equal(afterDelete['42'], undefined);
    // saveCreds persists
    await saveCreds();
    await clearAuth();
};

describe('database auth-state adapters (offline, fake clients)', () => {
    it('useRedisAuthState works against an ioredis-shaped client', async () => {
        const client = makeFakeRedis();
        const auth = await useRedisAuthState({ client, session: 's1' });
        await exerciseAdapter(auth);
        assert.equal(client.data.size, 0, 'clearAuth must remove all hash keys');
    });
    it('useRedisAuthState resolves node-redis style method names (hGet/hSet)', async () => {
        const base = makeFakeRedis();
        const client = {
            hGet: base.hget, hmGet: base.hmget, hSet: base.hset,
            hDel: base.hdel, del: base.del, keys: base.keys
        };
        const auth = await useRedisAuthState({ client });
        await exerciseAdapter(auth);
    });
    it('useMongoAuthState works against a collection-shaped client', async () => {
        const collection = makeFakeMongo();
        const auth = await useMongoAuthState({ collection, session: 'm1' });
        await exerciseAdapter(auth);
        assert.equal(collection.docs.length, 0, 'clearAuth must delete all session docs');
    });
    it('usePostgresAuthState works against a pg-shaped client', async () => {
        const client = makeFakePg();
        const auth = await usePostgresAuthState({ client, session: 'p1' });
        await exerciseAdapter(auth);
        assert.equal(client.rows.size, 0);
    });
    it('useMySQLAuthState works against a mysql2-shaped client', async () => {
        const client = makeFakeMysql();
        const auth = await useMySQLAuthState({ client, session: 'q1' });
        await exerciseAdapter(auth);
        assert.equal(client.rows.size, 0);
    });
    it('creds persist across adapter instances (same store)', async () => {
        const client = makeFakeRedis();
        const a1 = await useRedisAuthState({ client });
        a1.state.creds.registered = true;
        await a1.saveCreds();
        const a2 = await useRedisAuthState({ client });
        assert.equal(a2.state.creds.registered, true, 'second instance must load saved creds');
        assert.deepEqual(Buffer.from(a2.state.creds.noiseKey.private), Buffer.from(a1.state.creds.noiseKey.private));
    });
    it('rejects invalid table names (SQL injection guard)', async () => {
        await assert.rejects(usePostgresAuthState({ client: makeFakePg(), table: 'x; DROP TABLE users' }), /invalid table name/);
        await assert.rejects(useMySQLAuthState({ client: makeFakeMysql(), table: 'bad-name' }), /invalid table name/);
    });
    it('requires client or uri', async () => {
        await assert.rejects(useRedisAuthState({}), /client.*uri|uri/);
        await assert.rejects(useMongoAuthState({}), /collection.*uri|uri/);
        await assert.rejects(usePostgresAuthState({}), /client.*uri|uri/);
        await assert.rejects(useMySQLAuthState({}), /client.*uri|uri/);
    });
    it('makeAuthStateFromStore validates the store contract', async () => {
        await assert.rejects(makeAuthStateFromStore(null), /store must implement/);
        await assert.rejects(makeAuthStateFromStore({ read: async () => null }), /store must implement/);
    });
    it('encode/decode round-trips Buffers and revives app-state-sync-key', () => {
        const value = { keyData: Buffer.from([9, 9, 9]) };
        const decoded = decodeAuthValue('app-state-sync-key', encodeAuthValue(value));
        assert.ok(decoded.keyData instanceof Uint8Array);
        assert.deepEqual(Buffer.from(decoded.keyData), Buffer.from([9, 9, 9]));
        assert.equal(decodeAuthValue('pre-key', null), null);
        assert.equal(decodeAuthValue('pre-key', undefined), null);
    });
});
