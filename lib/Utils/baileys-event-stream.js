/** Durable Baileys event-stream capture and replay helpers. */

import EventEmitter from 'events';
import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { BufferJSON, delay } from './generics.js';
import { makeMutex } from './make-mutex.js';

const stringifyEvent = (event, data) => JSON.stringify({ timestamp: Date.now(), event, data }, BufferJSON.replacer) + '\n';

/** Monkey-patches `ev.emit` to append every emitted event as one NDJSON line. */
export const captureEventStream = (ev, filename) => {
    if (!ev || typeof ev.emit !== 'function') throw new Error('captureEventStream requires an EventEmitter-like object');

    const originalEmit = ev.emit.bind(ev);
    const writeMutex = makeMutex();

    ev.emit = (event, ...args) => {
        const result = originalEmit(event, ...args);
        const line = stringifyEvent(event, args[0]);
        void writeMutex.mutex(() => writeFile(filename, line, { flag: 'a' }));
        return result;
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
