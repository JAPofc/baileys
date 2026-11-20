/**
 * lib/Utils/logger-compat.js — accept any logger, not just this build's pino.
 *
 * The library calls `logger.child({ … })` in a few places (the Noise handshake, the store).
 * pino has `child()`; `console`, bunyan/winston wrappers, a pino v8 instance behind an app
 * helper, and "just give me silence" objects do not — and the crash surfaced deep inside the
 * handshake instead of pointing at the logger. `ensureLogger()` adapts anything logger-ish
 * into something with the five level methods, a working `child()`, and a settable `level`.
 *
 * Part of @japofc/baileys.
 */
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];
const LEVEL_RANK = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 100 };

const noop = () => {};

/** Does this object already satisfy everything the library calls? */
export const isUsableLogger = (logger) => !!logger
    && typeof logger === 'object'
    && typeof logger.child === 'function'
    && LEVELS.every(level => typeof logger[level] === 'function');

/** A logger that discards everything (and still has `child()`). */
export const silentLogger = () => {
    const make = () => {
        const instance = { level: 'silent', child: () => make() };
        for (const level of LEVELS) {
            instance[level] = noop;
        }
        instance.fatal = noop;
        return instance;
    };
    return make();
};

const pickMethod = (source, level) => {
    const candidates = level === 'trace'
        ? ['trace', 'debug', 'log', 'info']
        : level === 'debug'
            ? ['debug', 'log', 'info']
            : level === 'info'
                ? ['info', 'log']
                : level === 'warn'
                    ? ['warn', 'error', 'log']
                    : ['error', 'warn', 'log'];
    for (const name of candidates) {
        if (typeof source[name] === 'function') {
            return source[name].bind(source);
        }
    }
    return null;
};

/**
 * Wrap any logger so the library can use it.
 *
 * ```js
 * makeWASocket({ logger: ensureLogger(console) })        // console works
 * makeWASocket({ logger: ensureLogger(pinoV8Instance) }) // any pino major works
 * makeWASocket({ logger: ensureLogger(false) })          // silence
 * ```
 *
 * A logger that already has `child()` and the five level methods is returned untouched, so
 * passing a real pino instance costs nothing. `false`/`null` gives a silent logger. Bindings
 * from `child()` are merged into the message object, the way pino does it.
 */
export const ensureLogger = (logger, bindings = {}) => {
    if (logger === false || logger === null || logger === undefined) {
        return silentLogger();
    }
    if (isUsableLogger(logger) && !Object.keys(bindings).length) {
        return logger;
    }
    if (typeof logger !== 'object' && typeof logger !== 'function') {
        throw new TypeError(`ensureLogger: expected a logger object, got ${typeof logger}`);
    }
    const source = logger;
    const adapter = {
        get level() {
            return source.level ?? 'info';
        },
        set level(value) {
            try {
                source.level = value;
            }
            catch { /* some loggers expose level read-only */ }
        }
    };
    for (const level of LEVELS) {
        const target = pickMethod(source, level);
        adapter[level] = target
            ? (...args) => {
                // pino style: (obj, msg). Merge the child bindings into the object arg.
                if (Object.keys(bindings).length && args.length && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
                    return target({ ...bindings, ...args[0] }, ...args.slice(1));
                }
                if (Object.keys(bindings).length) {
                    return target(bindings, ...args);
                }
                return target(...args);
            }
            : noop;
    }
    adapter.fatal = typeof source.fatal === 'function' ? source.fatal.bind(source) : adapter.error;
    adapter.child = (childBindings = {}) => ensureLogger(source, { ...bindings, ...childBindings });
    adapter.isLevelEnabled = (level) => {
        if (typeof source.isLevelEnabled === 'function') {
            return source.isLevelEnabled(level);
        }
        const current = LEVEL_RANK[adapter.level] ?? LEVEL_RANK.info;
        return (LEVEL_RANK[level] ?? LEVEL_RANK.info) >= current;
    };
    adapter.bindings = () => ({ ...bindings });
    return adapter;
};
