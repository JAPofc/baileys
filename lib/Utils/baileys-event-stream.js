/** Durable Baileys event-stream capture and replay helpers. */

import EventEmitter from 'events';
import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { BufferJSON, delay } from './generics.js';
import { makeMutex } from './make-mutex.js';

const stringifyEvent = (event, data) => JSON.stringify({ timestamp: Date.now(), event, data }, BufferJSON.replacer) + '\n';

/** Field names whose values are secrets and must never be written to disk. */
const SENSITIVE_KEY_RE = /(key|secret|token|password|private|noise)/i;

/**
 * Recursively mask secret-bearing fields (auth keys, tokens, …) so a captured
 * stream is safe to attach to a bug report. Buffers/typed-arrays under a
 * sensitive key are replaced with '[redacted]'; depth-capped to stay cheap.
 */
export const redactEventData = (data, depth = 0) => {
    if (depth > 6 || data === null || typeof data !== 'object') return data;
    if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) return data;
    if (Array.isArray(data)) return data.map((v) => redactEventData(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] = SENSITIVE_KEY_RE.test(k) && v != null ? '[redacted]' : redactEventData(v, depth + 1);
    }
    return out;
};

/**
 * Monkey-patch `ev.emit` to append every emitted event as one NDJSON line —
 * a durable "protocol capture" of a live socket for debugging / bug reports /
 * offline replay.
 *
 * `options`:
 *   - `redact` (default true): mask secret fields via {@link redactEventData}
 *     before writing (opt out for a full raw dump you keep private).
 *   - `events`: only capture these event names (string | string[]).
 *   - `redactor(event, data)`: custom transform, wins over `redact`.
 *
 * Returns `{ stop }` — call `stop()` to restore the original emit and end the
 * capture (previously the patch was permanent with no way to stop it).
 */
export const captureEventStream = (ev, filename, options = {}) => {
    if (!ev || typeof ev.emit !== 'function') throw new Error('captureEventStream requires an EventEmitter-like object');

    const { redact = true, events, redactor } = options;
    const only = events == null ? null : new Set(Array.isArray(events) ? events : [events]);
    const transform = typeof redactor === 'function'
        ? redactor
        : (redact ? (_event, data) => redactEventData(data) : (_event, data) => data);

    const previousEmit = ev.emit;
    const writeMutex = makeMutex();
    let active = true;

    const patchedEmit = function patchedEmit(event, ...args) {
        const result = previousEmit.apply(ev, [event, ...args]);
        if (active && (!only || only.has(event))) {
            const line = stringifyEvent(event, transform(event, args[0]));
            void writeMutex.mutex(() => writeFile(filename, line, { flag: 'a' }));
        }
        return result;
    };
    ev.emit = patchedEmit;

    return {
        stop() {
            if (!active) return;
            active = false;
            // Only unwind our own patch; leave later patches (if any) intact.
            if (ev.emit === patchedEmit) ev.emit = previousEmit;
        }
    };
};

/** Reads a captured NDJSON event file and replays each event on a fresh emitter. */
export const readAndEmitEventStream = (filename, delayIntervalMs = 0) => {
    const ev = new EventEmitter();

    const task = (async () => {
        const fileStream = createReadStream(filename);
        const lines = createInterface({ input: fileStream, crlfDelay: Infinity });

        try {
            for await (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const record = JSON.parse(line, BufferJSON.reviver);
                    if (record?.event) ev.emit(record.event, record.data);
                    if (delayIntervalMs > 0) await delay(delayIntervalMs);
                }
                catch {
                    // Ignore malformed lines so a partially written capture can still replay.
                }
            }
        }
        finally {
            fileStream.destroy();
        }
    })();

    return { ev, task };
};
