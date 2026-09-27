/**
 * Secure logger — logging that can't leak your session: known credential
 * fields are redacted at the logger level, and `redactSensitive()` scrubs
 * arbitrary objects before they go anywhere (webhooks, DMs, files).
 *
 * ```js
 * import { createSecureLogger, redactSensitive } from '@japofc/baileys'
 *
 * const logger = createSecureLogger({ level: 'info' })
 * const sock = makeWASocket({ auth: state, logger })
 * // creds/keys in any log line render as [REDACTED]
 *
 * redactSensitive({ noiseKey: {...}, text: 'hi' })
 * // { noiseKey: '[REDACTED]', text: 'hi' }
 * ```
 */
import P from 'pino';

/** Key names whose values must never appear in logs. */
export const SENSITIVE_KEY_PATTERNS = [
	/^private$/i,
	/^public$/i,
	/key(?:pair|data)?$/i,
	/^noiseKey$/i,
	/^pairingEphemeralKeyPair$/i,
	/^signedIdentityKey$/i,
	/^signedPreKey$/i,
	/^advSecretKey$/i,
	/^pairingCode$/i,
	/token$/i,
	/secret/i,
	/password/i,
	/credential/i,
	/^authState$/i,
	/^creds$/i
];

const isSensitiveKey = (key) => SENSITIVE_KEY_PATTERNS.some(re => re.test(key));

/**
 * Deep-copy an object with sensitive fields replaced by '[REDACTED]'.
 * Circular-safe; never throws.
 */
export const redactSensitive = (value, { placeholder = '[REDACTED]', maxDepth = 8 } = {}) => {
	const seen = new WeakSet();
	const walk = (val, depth) => {
		if (!val || typeof val !== 'object' || depth > maxDepth) {
			return val;
		}
		if (seen.has(val)) {
			return '[Circular]';
		}
		seen.add(val);
		if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
			return `[Bytes ${val.length}]`;
		}
		if (Array.isArray(val)) {
			return val.map(v => walk(v, depth + 1));
		}
		const out = {};
		for (const [key, v] of Object.entries(val)) {
			out[key] = isSensitiveKey(key) ? placeholder : walk(v, depth + 1);
		}
		return out;
	};
	try {
		return walk(value, 0);
	} catch {
		return placeholder;
	}
};

/** pino `redact` paths covering Baileys credential shapes. */
export const SECURE_LOG_REDACT_PATHS = [
	'creds', '*.creds',
	'authState', '*.authState',
	'noiseKey', '*.noiseKey',
	'pairingEphemeralKeyPair', '*.pairingEphemeralKeyPair',
	'signedIdentityKey', '*.signedIdentityKey',
	'signedPreKey', '*.signedPreKey',
	'advSecretKey', '*.advSecretKey',
	'pairingCode', '*.pairingCode',
	'private', '*.private',
	'password', '*.password',
	'secret', '*.secret',
	'token', '*.token'
];

/**
 * A pino logger with credential redaction built in. Accepts the usual pino
 * options plus an optional `destination` stream (handy in tests).
 */
export const createSecureLogger = (options = {}) => {
	const { destination, redactPaths = [], ...pinoOptions } = options;
	const config = {
		timestamp: () => `,"time":"${new Date().toJSON()}"`,
		...pinoOptions,
		redact: {
			paths: [...SECURE_LOG_REDACT_PATHS, ...redactPaths],
			censor: '[REDACTED]'
		}
	};
	return destination ? P(config, destination) : P(config);
};
