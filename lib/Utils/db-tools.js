/**
 * DB tools — helpers for building and maintaining custom auth-state / key
 * storage adapters (SQLite, Redis, Mongo, Postgres…). A "store map" here is
 * the nested `{ [type]: { [id]: value } }` shape Baileys' SignalKeyStore uses
 * (e.g. `{ 'pre-key': { '1': {...} }, session: { '62..._0': {...} } }`).
 *
 * ```js
 * import {
 *     serializeStore, deserializeStore, countStoreKeys, mergeStores,
 *     diffStores, sanitizeKeyId, namespaceKey, storeSizeBytes
 * } from '@japofc/baileys'
 *
 * const blob = serializeStore(map)          // Buffer-safe JSON string
 * const back = deserializeStore(blob)       // exact restore (Buffers intact)
 * countStoreKeys(map)                       // { 'pre-key': 3, session: 12 }
 * sanitizeKeyId('62:1@s.whatsapp.net/x')    // filename-safe id
 * ```
 *
 * All helpers are pure and never mutate their inputs unless documented.
 */
import { BufferJSON } from './generics.js';

/** Serialize a store map to a Buffer-safe JSON string (Uint8Arrays survive). */
export const serializeStore = (map) => JSON.stringify(map ?? {}, BufferJSON.replacer);

/** Restore a serializeStore() string back into a store map (Buffers intact). */
export const deserializeStore = (json) => {
	if (json === null || json === undefined || json === '') {
		return {};
	}
	return JSON.parse(typeof json === 'string' ? json : String(json), BufferJSON.reviver);
};

/** Count non-null ids per type: `{ 'pre-key': 3, session: 12 }`. */
export const countStoreKeys = (map) => {
	const out = {};
	for (const type of Object.keys(map || {})) {
		let n = 0;
		for (const id of Object.keys(map[type] || {})) {
			if (map[type][id] !== null && map[type][id] !== undefined) {
				n++;
			}
		}
		out[type] = n;
	}
	return out;
};

/** Total number of non-null ids across every type. */
export const totalStoreKeys = (map) => {
	const counts = countStoreKeys(map);
	return Object.values(counts).reduce((a, b) => a + b, 0);
};

/** The list of key types present in a store map. */
export const storeTypes = (map) => Object.keys(map || {});

/** True when a store map holds no non-null entries. */
export const isEmptyStore = (map) => totalStoreKeys(map) === 0;

/**
 * Merge store maps (later wins). A `null` value marks a deletion and removes
 * that id from the result. Returns a new map; inputs are not mutated.
 */
export const mergeStores = (...maps) => {
	const out = {};
	for (const map of maps) {
		for (const type of Object.keys(map || {})) {
			out[type] = out[type] || {};
			for (const id of Object.keys(map[type] || {})) {
				const value = map[type][id];
				if (value === null || value === undefined) {
					delete out[type][id];
				} else {
					out[type][id] = value;
				}
			}
		}
	}
	return out;
};

/**
 * Compare two store maps by key identity: returns
 * `{ added: [{type,id}], removed: [{type,id}], changed: [{type,id}] }`.
 * `changed` compares BufferJSON serializations, so value edits are detected.
 */
export const diffStores = (before, after) => {
	const added = [];
	const removed = [];
	const changed = [];
	const ser = (v) => JSON.stringify(v, BufferJSON.replacer);
	const types = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
	for (const type of types) {
		const b = (before && before[type]) || {};
		const a = (after && after[type]) || {};
		const ids = new Set([...Object.keys(b), ...Object.keys(a)]);
		for (const id of ids) {
			const inB = b[id] !== undefined && b[id] !== null;
			const inA = a[id] !== undefined && a[id] !== null;
			if (inA && !inB) {
				added.push({ type, id });
			} else if (!inA && inB) {
				removed.push({ type, id });
			} else if (inA && inB && ser(a[id]) !== ser(b[id])) {
				changed.push({ type, id });
			}
		}
	}
	return { added, removed, changed };
};

/** New map with one key type removed. Input is not mutated. */
export const pruneStoreType = (map, type) => {
	const out = {};
	for (const t of Object.keys(map || {})) {
		if (t !== type) {
			out[t] = map[t];
		}
	}
	return out;
};

/** New map keeping only the listed key types. Input is not mutated. */
export const filterStoreType = (map, types) => {
	const keep = new Set(Array.isArray(types) ? types : [types]);
	const out = {};
	for (const t of Object.keys(map || {})) {
		if (keep.has(t)) {
			out[t] = map[t];
		}
	}
	return out;
};

/** A deep, Buffer-preserving clone of a store map (via serialize round-trip). */
export const cloneStore = (map) => deserializeStore(serializeStore(map));

/** Rename a key id within a type (new map). No-op if the id is absent. */
export const renameStoreId = (map, type, fromId, toId) => {
	const out = cloneStore(map);
	if (out[type] && out[type][fromId] !== undefined) {
		out[type][toId] = out[type][fromId];
		delete out[type][fromId];
	}
	return out;
};

/** Approximate serialized size of a store map in bytes (UTF-8 of the JSON). */
export const storeSizeBytes = (map) => Buffer.byteLength(serializeStore(map), 'utf8');

/**
 * Make a Signal key id safe as a flat storage key / filename: `:` → `-`,
 * `/` → `__` (the exact scheme the multi-file auth adapter uses). Reversible
 * with `parseNamespacedKey` only when combined with a type prefix.
 */
export const sanitizeKeyId = (id) => String(id ?? '').replace(/:/g, '-').replace(/\//g, '__');

/** Build a flat namespaced storage key: namespaceKey('pre-key', '1') → 'pre-key:1'. */
export const namespaceKey = (type, id, { separator = ':' } = {}) => `${type}${separator}${id}`;

/**
 * Split a flat namespaced key back into `{ type, id }` on the FIRST separator
 * (ids may themselves contain the separator). Returns null when absent.
 */
export const parseNamespacedKey = (key, { separator = ':' } = {}) => {
	const s = String(key ?? '');
	const at = s.indexOf(separator);
	if (at < 1) {
		return null;
	}
	return { type: s.slice(0, at), id: s.slice(at + separator.length) };
};
