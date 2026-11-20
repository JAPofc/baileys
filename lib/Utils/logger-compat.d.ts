import type { ILogger } from './logger.js';

/** Does this object already have `child()` and the five level methods? */
export declare function isUsableLogger(logger: any): boolean;
/** A logger that discards everything (and still has `child()`). */
export declare function silentLogger(): ILogger;
/**
 * Adapt any logger — pino (any major), `console`, bunyan/winston-style, or `false` for
 * silence — into something the library can use. A real pino instance is returned untouched.
 */
export declare function ensureLogger(logger: any, bindings?: Record<string, any>): ILogger;
