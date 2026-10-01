/** Secure logger — credential-redacting logging. */
import type { Logger } from 'pino';

export declare const SENSITIVE_KEY_PATTERNS: RegExp[];
export declare const SECURE_LOG_REDACT_PATHS: string[];

/** Deep copy with sensitive fields replaced by '[REDACTED]'. Never throws. */
export declare const redactSensitive: (
	value: unknown,
	options?: { placeholder?: string; maxDepth?: number }
) => unknown;

/** pino logger with credential redaction built in. */
export declare const createSecureLogger: (
	options?: Record<string, unknown> & { destination?: unknown; redactPaths?: string[] }
) => Logger;
