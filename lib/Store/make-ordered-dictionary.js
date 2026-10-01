export function makeOrderedDictionary(idGetter) {
    const array = [];
    const dict = {};
    const get = (id) => dict[id];
    const update = (item) => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array[idx] = item;
            dict[id] = item;
            // JAP@Fix (§2.51 / v2.4.7): `return false` used to sit outside this branch, so a
            // successful update was reported exactly like "no such item". Callers that
            // follow the store's own `if (!result) logger.debug('non-existent')` pattern
            // logged a miss on every single successful write.
            return true;
        }
        return false;
    };
    const upsert = (item, mode) => {
        const id = idGetter(item);
        if (get(id)) {
            update(item);
        }
        else {
            if (mode === 'append') {
                array.push(item);
            }
            else {
                array.splice(0, 0, item);
            }
            dict[id] = item;
        }
    };
    const remove = (item) => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array.splice(idx, 1);
            delete dict[id];
            return true;
        }
        return false;
    };
    return {
        array,
        get,
        upsert,
        update,
        remove,
        updateAssign: (id, update) => {
            const item = get(id);
            if (item) {
                Object.assign(item, update);
                delete dict[id];
                dict[idGetter(item)] = item;
                return true;
            }
            return false;
        },
        clear: () => {
            array.splice(0, array.length);
            for (const key of Object.keys(dict)) {
                delete dict[key];
            }
        },
        filter: (contain) => {
            let i = 0;
            while (i < array.length) {
                if (!contain(array[i])) {
                    delete dict[idGetter(array[i])];
                    array.splice(i, 1);
                }
                else {
                    i += 1;
                }
            }
        },
        toJSON: () => array,
        /**
         * JAP@Fix (§2.50 / v2.4.7): this replaced `array` but left `dict` untouched, so
         * after restoring a snapshot the id index was empty: `get()` missed every item,
         * `updateAssign()` reported "non-existent message" (dropping receipts, reactions
         * and status updates), and `upsert()` of an id already in `array` appended a
         * duplicate instead of updating it. The index is now rebuilt from the new items.
         */
        fromJSON: (newItems) => {
            const items = Array.isArray(newItems) ? newItems : [];
            array.splice(0, array.length, ...items);
            for (const key of Object.keys(dict)) {
                delete dict[key];
            }
            for (const item of items) {
                dict[idGetter(item)] = item;
            }
        },
        /** JAP@Add (v2.4.7): membership test that does not allocate. */
        has: (id) => dict[id] !== undefined,
        /** JAP@Add (v2.4.7): number of stored items. */
        size: () => array.length
    };
}
