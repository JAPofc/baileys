import type { BaileysEventEmitter } from '../Types/index.js';
/** Recursively mask secret-bearing fields (keys/tokens/…) before writing a capture to disk. */
export declare const redactEventData: (data: any, depth?: number) => any;
export interface CaptureEventStreamOptions {
    /** Mask secret fields before writing (default true). */
    redact?: boolean;
    /** Only capture these event names. */
    events?: string | string[];
    /** Custom transform applied to each event's data (wins over `redact`). */
    redactor?: (event: string, data: any) => any;
}
/** Handle returned by captureEventStream; call stop() to end the capture. */
export interface EventStreamCapture {
    stop: () => void;
}
/** Monkey-patches ev.emit to append every (optionally redacted) event as an NDJSON line to `filename`. */
export declare const captureEventStream: (ev: BaileysEventEmitter, filename: string, options?: CaptureEventStreamOptions) => EventStreamCapture;
/** Reads an NDJSON file written by captureEventStream and replays each event on a new EventEmitter. */
export declare const readAndEmitEventStream: (filename: string, delayIntervalMs?: number) => {
    ev: BaileysEventEmitter;
    task: Promise<void>;
};
