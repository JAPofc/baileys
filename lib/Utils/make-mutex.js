import { Mutex as AsyncMutex } from 'async-mutex';
export const makeMutex = () => {
    const mutex = new AsyncMutex();
    return {
        mutex(code) {
            return mutex.runExclusive(code);
        }
    };
};
export const makeKeyedMutex = () => {
    const map = new Map();
    return {
        async mutex(key, task) {
            let entry = map.get(key);
            if (!entry) {
                entry = { mutex: new AsyncMutex(), refCount: 0 };
                map.set(key, entry);
            }
            entry.refCount++;
            try {
                return await entry.mutex.runExclusive(task);
            }
            finally {
                entry.refCount--;
                // only delete it if this is still the current entry
                if (entry.refCount === 0 && map.get(key) === entry) {
                    map.delete(key);
                }
            }
        },
        // JAP@Add: observability so the "no unbounded growth" guarantee is verifiable
        // (a keyed mutex whose entries are never reclaimed is a classic memory leak).
        // `size` returns to 0 once every in-flight lock for every key has released.
        get size() {
            return map.size;
        }
    };
};
