/**
 * lib/Utils/optional-modules.js — soft dependencies, a TTL cache, and link thumbnails.
 *
 * `sharp` and `ffmpeg` make stickers/voice notes nicer but are not required to run a bot, so
 * they are loaded on demand and cached — including the *failure*, so a missing module costs
 * one failed import instead of one per call.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';

const loaded = new Map();

/**
 * Import an optional module once, remembering the outcome.
 *
 * ```js
 * const sharp = await loadOptionalModule('sharp')            // null when not installed
 * const sharp = await loadOptionalModule('sharp', { required: true })  // throws with a hint
 * ```
 */
export const loadOptionalModule = async (name, { required = false, hint } = {}) => {
    if (typeof name !== 'string' || !name.trim()) {
        throw new Boom('loadOptionalModule: pass a module name', { statusCode: 400 });
    }
    if (!loaded.has(name)) {
        loaded.set(name, import(name).then(mod => mod?.default ?? mod).catch(() => null));
    }
    const mod = await loaded.get(name);
    if (!mod && required) {
        throw new Boom(`loadOptionalModule: "${name}" is not installed${hint ? ` — ${hint}` : `. Run: npm i ${name}`}`, {
            statusCode: 424,
            data: { module: name }
        });
    }
    return mod;
};

/** Forget a cached result so the next call retries the import (after an install, say). */
export const forgetOptionalModule = (name) => loaded.delete(name);

/** `sharp`, or null when it is not installed. */
export const loadSharp = (options = {}) => loadOptionalModule('sharp', {
    hint: 'image resizing/sticker conversion needs it: npm i sharp',
    ...options
});

/** `fluent-ffmpeg`, or null. Use `resolveFfmpegPath()` for the binary itself. */
export const loadFfmpeg = (options = {}) => loadOptionalModule('fluent-ffmpeg', {
    hint: 'audio/video conversion needs it: npm i fluent-ffmpeg',
    ...options
});

/**
 * A small TTL + LRU cache. Entries expire on read *and* on a lazy sweep, so a cache nobody
 * reads cannot grow forever.
 *
 * ```js
 * const cache = new TTLCache({ ttlMs: 60_000, max: 500 })
 * cache.set('k', value); cache.get('k'); cache.has('k'); cache.delete('k')
 * await cache.wrap('user:1', () => fetchUser(1))   // memoised, TTL'd, de-duplicated
 * ```
 */
export class TTLCache {
    constructor({ ttlMs = 60_000, max = 1000, now = Date.now } = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Boom('new TTLCache: "ttlMs" must be a positive number', { statusCode: 400, data: { ttlMs } });
        }
        if (!Number.isInteger(max) || max < 1) {
            throw new Boom('new TTLCache: "max" must be a positive integer', { statusCode: 400, data: { max } });
        }
        this.ttlMs = ttlMs;
        this.max = max;
        this.hits = 0;
        this.misses = 0;
        this.expirations = 0;
        this.evictions = 0;
        this.#now = now;
    }

    #now;
    #store = new Map();
    #inFlight = new Map();

    get size() {
        return this.#store.size;
    }

    #expired(entry) {
        return entry.expiresAt <= this.#now();
    }

    set(key, value, { ttlMs = this.ttlMs } = {}) {
        this.#store.delete(key); // re-insert so insertion order == recency
        this.#store.set(key, { value, expiresAt: this.#now() + ttlMs });
        while (this.#store.size > this.max) {
            const oldest = this.#store.keys().next().value;
            this.#store.delete(oldest);
            this.evictions++;
        }
        return this;
    }

    get(key) {
        const entry = this.#store.get(key);
        if (!entry) {
            this.misses++;
            return undefined;
        }
        if (this.#expired(entry)) {
            this.#store.delete(key);
            this.expirations++;
            this.misses++;
            return undefined;
        }
        // refresh recency without extending the TTL
        this.#store.delete(key);
        this.#store.set(key, entry);
        this.hits++;
        return entry.value;
    }

    has(key) {
        const entry = this.#store.get(key);
        if (!entry) {
            return false;
        }
        if (this.#expired(entry)) {
            this.#store.delete(key);
            this.expirations++;
            return false;
        }
        return true;
    }

    delete(key) {
        return this.#store.delete(key);
    }

    clear() {
        this.#store.clear();
        this.#inFlight.clear();
    }

    /** Drop every expired entry now; returns how many went. */
    sweep() {
        let removed = 0;
        for (const [key, entry] of this.#store) {
            if (this.#expired(entry)) {
                this.#store.delete(key);
                removed++;
            }
        }
        this.expirations += removed;
        return removed;
    }

    /** Memoise an async producer: concurrent callers share one in-flight promise. */
    async wrap(key, producer, { ttlMs = this.ttlMs } = {}) {
        if (this.has(key)) {
            return this.get(key);
        }
        if (this.#inFlight.has(key)) {
            return this.#inFlight.get(key);
        }
        const promise = (async () => producer())()
            .then(value => {
                this.set(key, value, { ttlMs });
                return value;
            })
            .finally(() => this.#inFlight.delete(key));
        this.#inFlight.set(key, promise);
        return promise;
    }

    keys() {
        this.sweep();
        return [...this.#store.keys()];
    }

    getStats() {
        return {
            size: this.#store.size,
            max: this.max,
            ttlMs: this.ttlMs,
            hits: this.hits,
            misses: this.misses,
            expirations: this.expirations,
            evictions: this.evictions,
            inFlight: this.#inFlight.size
        };
    }
}

const thumbnailCache = new TTLCache({ ttlMs: 10 * 60_000, max: 200 });

/**
 * Fetch and shrink a link thumbnail, cached for ten minutes.
 *
 * Returns `{ jpegThumbnail, width, height, bytes, cached }`, or null when the image cannot be
 * fetched. `sharp` is used when installed; without it the original bytes are returned
 * unscaled (still useful, just bigger) rather than failing.
 */
export const prepareLinkThumbnail = async (url, { size = 192, timeoutMs = 8000, maxBytes = 1024 * 1024, fetchImpl = globalThis.fetch, cache = thumbnailCache } = {}) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Boom('prepareLinkThumbnail: pass an http(s) URL', { statusCode: 400, data: { url } });
    }
    if (typeof fetchImpl !== 'function') {
        throw new Boom('prepareLinkThumbnail: no fetch implementation available — pass { fetchImpl }', {
            statusCode: 400
        });
    }
    const key = `${url}|${size}`;
    if (cache?.has(key)) {
        return { ...cache.get(key), cached: true };
    }
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), timeoutMs);
    let raw;
    try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response?.ok) {
            return null;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length || buffer.length > maxBytes) {
            return null;
        }
        raw = buffer;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(abort);
    }
    let result = { jpegThumbnail: raw, width: undefined, height: undefined, bytes: raw.length, scaled: false };
    const sharp = await loadSharp();
    if (sharp) {
        try {
            const pipeline = sharp(raw).resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 });
            const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
            result = { jpegThumbnail: data, width: info.width, height: info.height, bytes: data.length, scaled: true };
        }
        catch { /* keep the unscaled original */ }
    }
    cache?.set(key, result);
    return { ...result, cached: false };
};
