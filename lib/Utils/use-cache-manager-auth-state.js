/** Cache-manager compatible authentication-state backend for @japofc/baileys. */

import { proto } from '../../WAProto/index.js';
import { initAuthCreds } from './auth-utils.js';
import { BufferJSON } from './generics.js';
import defaultLogger from './logger.js';

const CREDS_TTL_SECONDS = 60 * 60 * 24 * 365 * 2;

const safeJsonParse = (text) => {
    if (text === null || text === undefined) return null;
    try {
        return JSON.parse(text, BufferJSON.reviver);
    }
    catch {
        return null;
    }
};

export const useCacheManagerAuthState = async (store, sessionKey) => {
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function' || typeof store.del !== 'function') {
        throw new Error('useCacheManagerAuthState requires a cache-manager compatible store');
    }

    const prefix = String(sessionKey || 'default');
    const storageKey = (name) => `${prefix}:${name}`;

    const writeData = async (name, value) => {
        const serialized = JSON.stringify(value, BufferJSON.replacer);
        const ttl = name === 'creds' ? CREDS_TTL_SECONDS : undefined;
        await store.set(storageKey(name), serialized, ttl);
    };

    const readData = async (name) => {
        try {
            return safeJsonParse(await store.get(storageKey(name)));
        }
        catch {
            return null;
        }
    };

    const removeData = async (name) => {
        try {
            await store.del(storageKey(name));
        }
        catch (err) {
            defaultLogger.error({ err, key: name, sessionKey: prefix }, 'useCacheManagerAuthState: failed to remove key');
        }
    };

    const clearState = async () => {
        if (typeof store.keys !== 'function') return;
        try {
            const keys = await store.keys(`${prefix}:*`);
            await Promise.all((keys ?? []).map((key) => store.del(key)));
        }
        catch {
            // Best effort: some cache backends intentionally disable key scans.
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        clearState,
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const result = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        result[id] = value;
                    }));
                    return result;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data)) {
                        for (const id of Object.keys(data[category] ?? {})) {
                            const value = data[category][id];
                            const name = `${category}-${id}`;
                            tasks.push(value === null || value === undefined ? removeData(name) : writeData(name, value));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
};
