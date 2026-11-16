/**
 * lib/Builders/auto-update.js — refreshable native-flow definitions.
 *
 * WhatsApp changes which `nativeFlowMessage` button names it accepts from time to time, and
 * a pinned library version goes stale. This keeps the accepted-name table in one mutable
 * registry: `update()` merges a new table (from a URL, a file, or a literal object),
 * `enableAutoUpdate()` refreshes it on an interval, and `reloadExports()` re-reads the
 * library's own defaults. Nothing here downloads anything unless you give it a URL.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { INTERACTIVE_BUTTON_NAMES } from '../Utils/interactive-button-names.js';

/** Shortest interval `enableAutoUpdate()` accepts (5 minutes). */
export const AUTO_UPDATE_MIN_INTERVAL_MS = 5 * 60_000;
/** Default interval: once an hour. */
export const AUTO_UPDATE_DEFAULT_INTERVAL_MS = 60 * 60_000;

const baseline = () => ({
    buttonNames: [...INTERACTIVE_BUTTON_NAMES],
    source: 'built-in',
    updatedAt: null,
    version: null
});

let registry = baseline();
let timer = null;
let inFlight = null;
const listeners = new Set();

const notify = (snapshot) => {
    for (const listener of listeners) {
        try {
            listener(snapshot);
        }
        catch { /* a throwing listener must not break the refresh loop */ }
    }
};

const normalize = (input, source) => {
    const table = Array.isArray(input) ? { buttonNames: input } : input;
    if (!table || typeof table !== 'object') {
        throw new Boom('update: expected an array of button names or a { buttonNames } object', { statusCode: 400 });
    }
    const names = (table.buttonNames ?? table.names ?? [])
        .map(name => String(name ?? '').trim())
        .filter(Boolean);
    if (!names.length) {
        throw new Boom('update: the new table has no button names — refusing to wipe the registry', {
            statusCode: 400
        });
    }
    return {
        buttonNames: [...new Set([...names])],
        source: source ?? table.source ?? 'manual',
        version: table.version ?? null,
        updatedAt: Date.now()
    };
};

/** The current table (a copy — mutate it all you like, it will not leak back). */
export const getExports = () => ({ ...registry, buttonNames: [...registry.buttonNames] });

/** Is `name` an interactive button name this build accepts? */
export const isKnownButtonName = (name) => registry.buttonNames.includes(String(name ?? ''));

/**
 * Merge a new definition table.
 *
 * ```js
 * await update(['quick_reply', 'cta_url', 'new_flow_thing'])     // a literal table
 * await update({ url: 'https://example.com/nativeflow.json' })   // fetched
 * ```
 * Returns the resulting snapshot. A fetch that fails throws and leaves the registry alone.
 */
export const update = async (input, { fetchImpl = globalThis.fetch, merge = true, timeoutMs = 10_000 } = {}) => {
    let table = input;
    let source = 'manual';
    if (input && typeof input === 'object' && typeof input.url === 'string') {
        if (typeof fetchImpl !== 'function') {
            throw new Boom('update: no fetch implementation available — pass { fetchImpl }', { statusCode: 400 });
        }
        const controller = new AbortController();
        const abort = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(input.url, { signal: controller.signal });
            if (!response?.ok) {
                throw new Boom(`update: ${input.url} responded ${response?.status ?? '?'}`, {
                    statusCode: 502,
                    data: { url: input.url, status: response?.status }
                });
            }
            table = await response.json();
            source = input.url;
        }
        finally {
            clearTimeout(abort);
        }
    }
    const next = normalize(table, source);
    registry = merge
        ? { ...next, buttonNames: [...new Set([...registry.buttonNames, ...next.buttonNames])] }
        : next;
    const snapshot = getExports();
    notify(snapshot);
    return snapshot;
};

/** Drop every learned definition and go back to what this build shipped with. */
export const reloadExports = () => {
    registry = baseline();
    const snapshot = getExports();
    notify(snapshot);
    return snapshot;
};

/** Subscribe to table changes; returns an unsubscribe function. */
export const onExportsUpdated = (listener) => {
    if (typeof listener !== 'function') {
        throw new Boom('onExportsUpdated: pass a function', { statusCode: 400 });
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/**
 * Refresh the table on an interval.
 *
 * ```js
 * enableAutoUpdate({ url: 'https://example.com/nativeflow.json', intervalMs: 3600_000 })
 * ```
 * The timer is unref'd, so it never keeps a process alive on its own. Calling it twice
 * replaces the previous schedule; `disableAutoUpdate()` stops it.
 */
export const enableAutoUpdate = ({ url, intervalMs = AUTO_UPDATE_DEFAULT_INTERVAL_MS, fetchImpl, immediate = true, onError } = {}) => {
    if (!url) {
        throw new Boom('enableAutoUpdate: a "url" to fetch definitions from is required', { statusCode: 400 });
    }
    if (!Number.isFinite(intervalMs) || intervalMs < AUTO_UPDATE_MIN_INTERVAL_MS) {
        throw new Boom(`enableAutoUpdate: "intervalMs" must be at least ${AUTO_UPDATE_MIN_INTERVAL_MS}ms`, {
            statusCode: 400,
            data: { intervalMs }
        });
    }
    disableAutoUpdate();
    const refresh = () => {
        inFlight = update({ url }, { fetchImpl })
            .catch(err => { onError ? onError(err) : null; })
            .finally(() => { inFlight = null; });
        return inFlight;
    };
    timer = setInterval(refresh, intervalMs);
    timer.unref?.();
    if (immediate) {
        void refresh();
    }
    return {
        url,
        intervalMs,
        stop: disableAutoUpdate,
        refresh
    };
};

/** Stop the interval started by {@link enableAutoUpdate}. Returns true if one was running. */
export const disableAutoUpdate = () => {
    if (!timer) {
        return false;
    }
    clearInterval(timer);
    timer = null;
    return true;
};

/** Is an auto-update schedule currently running? */
export const isAutoUpdateEnabled = () => !!timer;

/** Resolves once any in-flight refresh has settled (test/shutdown helper). */
export const flushAutoUpdate = async () => { await inFlight; return getExports(); };
