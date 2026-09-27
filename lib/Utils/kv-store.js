/**
 * KV store — a tiny JSON key-value database for bot state: namespaces,
 * debounced atomic saves, zero dependencies.
 *
 * ```js
 * import { createKVStore } from '@japofc/baileys'
 *
 * const db = await createKVStore('./botdata.json')
 * db.set('owner', '628123@s.whatsapp.net')
 * db.get('owner')
 *
 * const settings = db.namespace('settings')     // isolated sub-store
 * settings.set('g@g.us', { welcome: true })
 * settings.all()                                // only this namespace
 *
 * await db.flush()                              // force-write now
 * ```
 *
 * Writes are debounced (500ms) and atomic (tmp + rename). Pass no file for
 * a pure in-memory store with the same API.
 */
import { readFile, writeFile, rename } from 'fs/promises';

export const createKVStore = async (file, options = {}) => {
	const { debounceMs = 500 } = options;

	let data = {};
	let timer = null;
	let dirty = false;

	if (file) {
		try {
			data = JSON.parse(await readFile(file, 'utf-8')) || {};
		} catch {
			data = {}; // missing or corrupt → start fresh
		}
	}

	const persist = async () => {
		if (!file) {
			return;
		}
		const tmp = `${file}.tmp`;
		await writeFile(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
		await rename(tmp, file);
		dirty = false;
	};

	const scheduleSave = () => {
		dirty = true;
		if (!file || timer) {
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			persist().catch(() => { });
		}, debounceMs);
		if (timer.unref) {
			timer.unref();
		}
	};

	const keyOf = (ns, key) => (ns ? `${ns}:${key}` : key);

	const makeApi = (ns) => ({
		get(key, fallback) {
			const value = data[keyOf(ns, key)];
			return value === undefined ? fallback : value;
		},
		set(key, value) {
			data[keyOf(ns, key)] = value;
			scheduleSave();
			return value;
		},
		has: (key) => keyOf(ns, key) in data,
		delete(key) {
			const existed = keyOf(ns, key) in data;
			delete data[keyOf(ns, key)];
			if (existed) {
				scheduleSave();
			}
			return existed;
		},
		/** All entries (of this namespace) as a plain object. */
		all() {
			const out = {};
			const prefix = ns ? `${ns}:` : '';
			for (const [key, value] of Object.entries(data)) {
				if (!ns) {
					if (!key.includes(':')) {
						out[key] = value;
					}
				} else if (key.startsWith(prefix)) {
					out[key.slice(prefix.length)] = value;
				}
			}
			return out;
		},
		keys() {
			return Object.keys(this.all());
		},
		/** Atomic-ish counter helper. */
		increment(key, by = 1) {
			const next = (Number(this.get(key)) || 0) + by;
			this.set(key, next);
			return next;
		},
		clear() {
			const prefix = ns ? `${ns}:` : null;
			for (const key of Object.keys(data)) {
				if (prefix === null ? !key.includes(':') : key.startsWith(prefix)) {
					delete data[key];
				}
			}
			scheduleSave();
		}
	});

	return {
		...makeApi(null),
		/** An isolated sub-store — keys never collide with other namespaces. */
		namespace(ns) {
			if (!ns || ns.includes(':')) {
				throw new Error('namespace must be a non-empty string without ":"');
			}
			return makeApi(ns);
		},
		/** Write pending changes to disk right now. */
		async flush() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (dirty) {
				await persist();
			}
		},
		get isDirty() {
			return dirty;
		},
		get file() {
			return file || null;
		}
	};
};
