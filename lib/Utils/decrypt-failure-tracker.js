/**
 * JAP@Add --- decrypt-failure log rate-limiter / de-duplicator.
 *
 * A dead Signal session (Bad MAC / no-session) can fail on every inbound stanza,
 * and each failure builds a full Error + stack and a heavy log line. In the field
 * this floods logs and exhausts the heap (see WhiskeySockets/Baileys#2234). This
 * tracker collapses repeated failures **per session key** into a bounded number of
 * log lines per time window, counting how many were suppressed so the caller can
 * summarize them instead of emitting thousands of identical lines.
 *
 * Pure and clock-injectable — no I/O, no timers.
 */

/**
 * @param {object} [opts]
 * @param {number} [opts.windowMs=60000]    length of each counting window (ms)
 * @param {number} [opts.maxPerWindow=5]    how many failures to log per key per window
 * @param {number} [opts.max=5000]          cap on tracked keys (oldest window pruned)
 * @param {() => number} [opts.now=Date.now]
 */
export const createDecryptFailureTracker = ({
    windowMs = 60_000,
    maxPerWindow = 5,
    max = 5000,
    now = Date.now
} = {}) => {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new RangeError('createDecryptFailureTracker: windowMs must be a positive number');
    }
    if (!Number.isInteger(maxPerWindow) || maxPerWindow < 0) {
        throw new RangeError('createDecryptFailureTracker: maxPerWindow must be a non-negative integer');
    }

    const entries = new Map(); // key -> { windowStart, count, suppressed }

    const prune = () => {
        while (entries.size > max) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
    };

    return {
        /**
         * Record a failure for `key`. Returns whether it should be logged, and —
         * on the first log of a fresh window — how many failures were suppressed
         * during the previous window (so the caller can note the backlog).
         * @param {string} key
         * @returns {{ log: boolean, occurrences: number, suppressedSincePrevWindow: number }}
         */
        hit(key) {
            const k = String(key);
            const t = now();
            let e = entries.get(k);
            let carried = 0;
            if (!e || t - e.windowStart >= windowMs) {
                carried = e ? e.suppressed : 0;
                e = { windowStart: t, count: 0, suppressed: 0 };
                entries.delete(k); // re-insert to refresh LRU order
                entries.set(k, e);
                prune();
            }
            e.count++;
            if (e.count <= maxPerWindow) {
                return { log: true, occurrences: e.count, suppressedSincePrevWindow: carried };
            }
            e.suppressed++;
            return { log: false, occurrences: e.count, suppressedSincePrevWindow: 0 };
        },
        /** Current suppressed count for a key in its active window (0 if unknown). */
        suppressedFor(key) {
            return entries.get(String(key))?.suppressed ?? 0;
        },
        clear() { entries.clear(); },
        get size() { return entries.size; }
    };
};

/**
 * Resolve a socket `decryptFailureLog` config value into a tracker instance (or
 * `undefined` when logging should stay unlimited). `false` disables; an options
 * object is forwarded to {@link createDecryptFailureTracker}; anything else uses
 * the defaults.
 * @param {false | import('./decrypt-failure-tracker.js').DecryptFailureTrackerOptions} [decryptFailureLog]
 */
export const resolveDecryptFailureTracker = (decryptFailureLog) => {
    if (decryptFailureLog === false) {
        return undefined;
    }
    return createDecryptFailureTracker(
        decryptFailureLog && typeof decryptFailureLog === 'object' ? decryptFailureLog : {}
    );
};
