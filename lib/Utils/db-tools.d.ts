/** DB tools — helpers for custom auth-state / SignalKeyStore adapters. */
export type StoreMap = Record<string, Record<string, unknown>>;
export interface StoreRef { type: string; id: string; }
/** Serialize a store map to a Buffer-safe JSON string. */
export declare const serializeStore: (map: StoreMap) => string;
/** Restore a serializeStore() string into a store map (Buffers intact). */
export declare const deserializeStore: (json: string | null | undefined) => StoreMap;
/** Count non-null ids per type. */
export declare const countStoreKeys: (map: StoreMap) => Record<string, number>;
/** Total number of non-null ids across every type. */
export declare const totalStoreKeys: (map: StoreMap) => number;
/** The list of key types present. */
export declare const storeTypes: (map: StoreMap) => string[];
/** True when the store holds no non-null entries. */
export declare const isEmptyStore: (map: StoreMap) => boolean;
/** Merge store maps (later wins; null deletes). New map. */
export declare const mergeStores: (...maps: StoreMap[]) => StoreMap;
/** Diff two store maps by key identity + value. */
export declare const diffStores: (before: StoreMap, after: StoreMap) => {
	added: StoreRef[];
	removed: StoreRef[];
	changed: StoreRef[];
};
/** New map with one key type removed. */
export declare const pruneStoreType: (map: StoreMap, type: string) => StoreMap;
/** New map keeping only the listed key types. */
export declare const filterStoreType: (map: StoreMap, types: string | string[]) => StoreMap;
/** Deep, Buffer-preserving clone of a store map. */
export declare const cloneStore: (map: StoreMap) => StoreMap;
/** Rename a key id within a type (new map). */
export declare const renameStoreId: (map: StoreMap, type: string, fromId: string, toId: string) => StoreMap;
/** Approximate serialized size in bytes. */
export declare const storeSizeBytes: (map: StoreMap) => number;
/** Make a Signal key id filename/flat-key safe (: → -, / → __). */
export declare const sanitizeKeyId: (id: string) => string;
/** Build a flat namespaced key: ('pre-key','1') → 'pre-key:1'. */
export declare const namespaceKey: (type: string, id: string, opts?: { separator?: string }) => string;
/** Split a flat namespaced key on the first separator. */
export declare const parseNamespacedKey: (key: string, opts?: { separator?: string }) => { type: string; id: string } | null;
