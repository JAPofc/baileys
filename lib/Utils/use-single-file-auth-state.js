import { readFile, rename, stat, writeFile } from 'fs/promises';
import { DEFAULT_CACHE_TTLS } from '../Defaults/index.js';
import { proto } from '../../WAProto/index.js';
import { initAuthCreds } from './auth-utils.js';
import { BufferJSON } from './generics.js';
import { LRUCache } from 'lru-cache';
import { Mutex } from 'async-mutex';
import defaultLogger from './logger.js';
// JAP@Changes 25-03-26 --- Add useSingleFileAuthState with integrated cache
const FLUSH_TIMEOUT_MS = 3000;
// JAP@Changes 22-04-26 --- Enhanced useSingleFileAuthState with LRUCache
export const useSingleFileAuthState = async (fileName) => {
    const cache = new LRUCache({
        max: 20000,
        ttl: 1000 * DEFAULT_CACHE_TTLS.SIGNAL_STORE,
        updateAgeOnGet: false,
        updateAgeOnHas: false,
        ttlAutopurge: true
    });
    // JAP@Changes 26-04-26 --- Add mutex for prevent race condition
    const mutex = new Mutex();
    let fileData = {};
    let isLoaded = false;
    let flushTimeout = null;
    const loadKey = async () => {
        return await mutex.runExclusive(async () => {
            if (isLoaded)
                return;
            try {
                const data = JSON.parse(await readFile(fileName, 'utf-8'), BufferJSON.reviver);
                fileData = data || {};
                for (const [keyName, value] of Object.entries(fileData)) {
                    cache.set(keyName, value);
                }
            }
            catch {
                fileData = {};
            }
            isLoaded = true;
        });
    };
    /**
     * JAP@Fix (§2.223): the actual write, separated from the debounce so it can also be
     * awaited directly. `rethrow` is false on the timer path (nobody is there to catch it,
     * so it is logged) and true when a caller asked for the flush and is awaiting it.
     */
    const flushNow = async ({ rethrow = false } = {}) => {
        if (flushTimeout) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }
        await mutex.runExclusive(async () => {
            try {
                const tempFile = fileName + '.temp';
                await writeFile(tempFile, JSON.stringify(fileData, BufferJSON.replacer), { mode: 0o600 }); // JAP@Fix: owner-only
                await rename(tempFile, fileName);
            }
            catch (err) {
                // JAP@Fix (bug 58): was silently swallowed — auth session could fail
                // to persist (disk full, permission error, etc.) with zero trace.
                defaultLogger.error({ err, fileName }, 'failed to flush auth state to disk');
                if (rethrow)
                    throw err;
            }
        });
    };
    const flushKey = () => {
        if (flushTimeout)
            return;
        flushTimeout = setTimeout(() => {
            void flushNow();
        }, FLUSH_TIMEOUT_MS);
        // JAP@Fix (§2.223): the debounce timer used to hold the event loop open, so a
        // script that finished its work still sat idle for up to three seconds.
        flushTimeout.unref?.();
    };
    const writeKey = (keyName, value) => {
        cache.set(keyName, value);
        fileData[keyName] = value;
        flushKey();
    };
    const removeKey = (keyName) => {
        cache.delete(keyName);
        delete fileData[keyName];
        flushKey();
    };
    const fileInfo = await stat(fileName).catch(() => null);
    if (!fileInfo) {
        // JAP@Fix (§2.224): this created the credential file with the default umask (0644
        // on most systems) while every later flush wrote 0600. On a shared host the file
        // holding the session was world-readable until the first flush replaced it, and a
        // session that never flushed stayed that way. `useMultiFileAuthState` has always
        // used 0600; these two are siblings and now agree.
        await writeFile(fileName, '{}', { mode: 0o600 });
    }
    else if (!fileInfo.isFile()) {
        throw new Error(`found something that is not a file at ${fileName}, either delete it or specify a different location`);
    }
    await loadKey();
    const creds = fileData['creds'] || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const keyName = type + id;
                        let value = cache.get(keyName);
                        if (value === undefined && fileData[keyName] !== undefined) {
                            value = fileData[keyName];
                            cache.set(keyName, value);
                        }
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const keyName = category + id;
                            const value = data[category][id];
                            value ? writeKey(keyName, value) : removeKey(keyName);
                        }
                    }
                }
            }
        },
        /**
         * JAP@Fix (§2.223): this used to queue a debounced write and resolve immediately.
         * It is an `async`-looking API that every caller awaits, so the contract it
         * implied was "the credentials are safe now" -- and they were not: a process that
         * exited within three seconds of pairing lost them, and the next run asked for the
         * QR code again. `useMultiFileAuthState` has always written synchronously on
         * saveCreds. Now so does this one.
         */
        saveCreds: async () => {
            cache.set('creds', creds);
            fileData['creds'] = creds;
            await flushNow({ rethrow: true });
        },
        /** Force any pending key writes to disk and wait for them. */
        flush: () => flushNow({ rethrow: true }),
        /**
         * Flush and stop the debounce timer. Call it on shutdown; not calling it is safe
         * (the timer is unref'd), but then the last few key writes are only in memory.
         */
        close: async () => {
            await flushNow({ rethrow: true });
        }
    };
};
