/** An insertion-ordered array that also keeps an id -> item index. */
export interface OrderedDictionary<T = any, ID = any> {
    /** The items, in order. Treat as read-only; mutate through the methods. */
    array: T[];
    get: (id: ID) => T | undefined;
    upsert: (item: T, mode?: 'append' | 'prepend') => void;
    /** `true` when an existing item was replaced, `false` when the id is unknown. */
    update: (item: T) => boolean;
    remove: (item: T) => boolean;
    updateAssign: (id: ID, update: Partial<T>) => boolean;
    clear: () => void;
    filter: (contain: (item: T) => boolean) => void;
    toJSON: () => T[];
    /** Replaces the contents and rebuilds the id index (fixed in v2.4.7, BUGREPORT §2.50). */
    fromJSON: (newItems: T[] | null | undefined) => void;
    /** Whether an item with this id is stored (v2.4.7). */
    has: (id: ID) => boolean;
    /** How many items are stored (v2.4.7). */
    size: () => number;
}

export declare function makeOrderedDictionary<T = any, ID = any>(idGetter: (item: T) => ID): OrderedDictionary<T, ID>;
