/**
 * lib/Utils/logger.js — the default logger.
 *
 * JAP@Fix (§2.88): pino used to be a hard dependency, so an app pinned to `pino@8` ended up
 * with two copies of pino in `node_modules` just to satisfy this one import. pino is an
 * optional peer now: when it is installed (any major) it is used exactly as before; when it
 * is not, this falls back to a tiny built-in JSON-lines logger with the same shape
 * (`trace/debug/info/warn/error/fatal`, `child()`, settable `level`), so nothing in the
 * library has to care which one it got.
 */
import { createRequire } from 'module';

const LEVEL_RANK = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 100 };
const TIMESTAMP = () => `,"time":"${new Date().toJSON()}"`;

/** Resolve pino once, synchronously, without exploding when it is absent. */
export const resolvePino = () => {
    try {
        const require = createRequire(import.meta.url);
        const mod = require('pino');
        return mod?.default ?? mod;
    }
    catch {
        return null;
    }
};

/**
 * The built-in fallback: JSON lines on stdout, level-filtered, with pino-style
 * `child(bindings)`. Deliberately tiny — if you want real logging, install pino.
 */
export const createFallbackLogger = ({ level = 'info', bindings = {}, write = line => process.stdout.write(line) } = {}) => {
    const state = { level };
    const emit = (name, args) => {
        if ((LEVEL_RANK[name] ?? 30) < (LEVEL_RANK[state.level] ?? 30)) {
            return;
        }
        const [first, ...rest] = args;
        const payload = first && typeof first === 'object' && !Array.isArray(first) ? first : undefined;
        const msg = payload ? rest[0] : first;
        let line;
        try {
            line = JSON.stringify({
                level: name,
                time: new Date().toJSON(),
                ...bindings,
                ...(payload ?? {}),
                ...(msg !== undefined ? { msg: typeof msg === 'string' ? msg : String(msg) } : {})
            });
        }
        catch {
            line = JSON.stringify({ level: name, time: new Date().toJSON(), msg: 'unserialisable log record' });
        }
        write(`${line}\n`);
    };
    const logger = {
        get level() {
            return state.level;
        },
        set level(value) {
            state.level = value;
        },
        child: (childBindings = {}) => createFallbackLogger({ level: state.level, bindings: { ...bindings, ...childBindings }, write }),
        bindings: () => ({ ...bindings }),
        isLevelEnabled: (name) => (LEVEL_RANK[name] ?? 30) >= (LEVEL_RANK[state.level] ?? 30)
    };
    for (const name of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
        logger[name] = (...args) => emit(name, args);
    }
    return logger;
};

const pino = resolvePino();

/** True when the real pino is driving this logger (false = built-in fallback). */
export const usingPino = !!pino;

export default pino
    ? pino({ timestamp: TIMESTAMP })
    : createFallbackLogger({ level: process.env.LOG_LEVEL || 'info' });
