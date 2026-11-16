/** Pino-compatible logger surface (typed loosely). */
export type ILogger = any;
/** The resolved `pino` module, or null when it is not installed. */
export declare function resolvePino(): any | null;
/** The built-in JSON-lines fallback used when pino is absent. */
export declare function createFallbackLogger(opts?: {
    level?: string; bindings?: Record<string, any>; write?: (line: string) => void;
}): ILogger;
/** True when the real pino is driving the default logger. */
export declare const usingPino: boolean;
declare const _default: ILogger;
export default _default;
