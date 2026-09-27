/**
 * Crash guard — keep the bot alive through uncaught exceptions and
 * unhandled rejections: log them safely, alert the owner, and only exit
 * when YOU decide.
 *
 * ```js
 * import { installCrashGuard, safeStringify } from '@japofc/baileys'
 *
 * const guard = installCrashGuard({
 *     onError: ({ type, error }) =>
 *         sock.sendMessage(owner, { text: `💥 ${type}: ${error?.message}` }).catch(() => {})
 * })
 *
 * guard.stats            // { uncaughtException: 0, unhandledRejection: 2 }
 * guard.uninstall()      // restore default behavior
 *
 * safeStringify(anything) // circular-safe, depth-capped — never throws
 * ```
 *
 * By default the process KEEPS RUNNING on both event types. Set
 * `exitOnUncaught: true` for the conservative crash-and-restart model
 * (the handler still runs first).
 */
import defaultLogger from './logger.js';

/**
 * JSON.stringify that never throws: handles circular references, BigInt,
 * Buffers, Errors, functions — with depth and length caps.
 */
export const safeStringify = (value, options = {}) => {
	const { maxDepth = 6, maxLength = 10_000, indent } = options;
	const seen = new WeakSet();
	const walk = (val, depth) => {
		if (val === null || typeof val === 'number' || typeof val === 'boolean') {
			return val;
		}
		if (typeof val === 'string') {
			return val.length > 500 ? `${val.slice(0, 500)}…(${val.length} chars)` : val;
		}
		if (typeof val === 'bigint') {
			return `${val}n`;
		}
		if (typeof val === 'function') {
			return `[Function ${val.name || 'anonymous'}]`;
		}
		if (typeof val === 'undefined') {
			return '[undefined]';
		}
		if (val instanceof Error) {
			return { name: val.name, message: val.message, stack: val.stack?.split('\n').slice(0, 5).join('\n') };
		}
		if (Buffer.isBuffer(val)) {
			return `[Buffer ${val.length} bytes]`;
		}
		if (typeof val === 'object') {
			if (seen.has(val)) {
				return '[Circular]';
			}
			if (depth >= maxDepth) {
				return Array.isArray(val) ? `[Array(${val.length})]` : '[Object]';
			}
			seen.add(val);
			if (Array.isArray(val)) {
				return val.slice(0, 100).map(v => walk(v, depth + 1));
			}
			const out = {};
			for (const [k, v] of Object.entries(val).slice(0, 100)) {
				out[k] = walk(v, depth + 1);
			}
			return out;
		}
		return String(val);
	};
	try {
		const text = JSON.stringify(walk(value, 0), null, indent);
		return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
	} catch {
		return '"[unserializable]"';
	}
};

/**
 * Install process-level crash handlers. Returns
 * `{ stats, uninstall, isInstalled }`. Installing twice throws — uninstall
 * the previous guard first.
 */
let installed = null;

export const installCrashGuard = (options = {}) => {
	if (installed) {
		throw new Error('crash guard already installed — call uninstall() first');
	}
	const {
		onError,
		logger = defaultLogger.child({ module: 'crash-guard' }),
		exitOnUncaught = false,
		/** JAP@Upgrade: min gap between onError alerts per type (anti alert-storm). */
		minAlertIntervalMs = 0,
		exitCode = 1
	} = options;
	const lastAlertAt = { uncaughtException: 0, unhandledRejection: 0 };

	const stats = { uncaughtException: 0, unhandledRejection: 0 };

	const report = (type, error) => {
		stats[type]++;
		try {
			logger.error({ type, err: error, detail: safeStringify(error, { maxDepth: 3 }) }, 'crash guard caught');
		} catch {
			// even the logger must not take us down
		}
		if (onError) {
			if (minAlertIntervalMs && Date.now() - lastAlertAt[type] < minAlertIntervalMs) {
				return; // throttled — counted in stats, alert skipped
			}
			lastAlertAt[type] = Date.now();
			try {
				const result = onError({ type, error, stats: { ...stats } });
				if (result && typeof result.catch === 'function') {
					result.catch(() => { });
				}
			} catch {
				// handler errors end here
			}
		}
	};

	const onUncaught = (error) => {
		report('uncaughtException', error);
		if (exitOnUncaught) {
			process.exit(exitCode);
		}
	};
	const onRejection = (reason) => {
		report('unhandledRejection', reason);
	};

	process.on('uncaughtException', onUncaught);
	process.on('unhandledRejection', onRejection);

	const guard = {
		stats,
		get isInstalled() {
			return installed === guard;
		},
		uninstall() {
			if (installed !== guard) {
				return false;
			}
			process.off('uncaughtException', onUncaught);
			process.off('unhandledRejection', onRejection);
			installed = null;
			return true;
		}
	};
	installed = guard;
	return guard;
};
