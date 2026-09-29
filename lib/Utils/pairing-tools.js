/**
 * Pairing tools — everything around phone-number pairing codes in one place:
 * validate/normalize custom codes, track code freshness, wait for the pairing
 * to actually complete, or do the whole flow in one call.
 *
 * ```js
 * import { pairWithCode, getPairingCodeInfo } from '@japofc/baileys'
 *
 * const sock = makeWASocket({ auth: state, printQRInTerminal: false })
 * const result = await pairWithCode(sock, '628123456789', {
 *     customCode: 'abcd-efgh', // any format; normalized for you (optional)
 *     onCode: (code, formatted) => console.log('Enter on your phone:', formatted)
 * })
 * if (result.restartRequired) {
 *     // recreate the socket — standard after a successful pairing
 * }
 *
 * const info = getPairingCodeInfo(state.creds)
 * console.log(info.formatted, 'expires in', Math.round(info.remainingMs / 1000), 's')
 * ```
 */
import { DisconnectReason } from '../Types/index.js';

/** Crockford base32 alphabet WhatsApp pairing codes use (no 0, I, O, U). */
export const PAIRING_CODE_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';

/**
 * How long a pairing code is treated as fresh by the freshness helpers.
 * WhatsApp expires codes on its side after a few minutes; this default is
 * deliberately conservative. Override per call if you want a tighter window.
 */
export const DEFAULT_PAIRING_CODE_TTL_MS = 5 * 60_000;

const CODE_RE = new RegExp(`^[${PAIRING_CODE_ALPHABET}]{8}$`);

/**
 * Normalize a human-entered pairing code: strips spaces/dashes, uppercases,
 * and validates the 8-char Crockford alphabet. Throws on invalid input.
 */
export const normalizePairingCode = (input) => {
	const code = String(input ?? '').replace(/[\s-]+/g, '').toUpperCase();
	if (code.length !== 8) {
		throw new Error('Pairing code must be exactly 8 characters (excluding separators)');
	}
	if (!CODE_RE.test(code)) {
		throw new Error('Pairing code may only use Crockford base32 characters (1-9, A-Z excluding I, O, U)');
	}
	return code;
};

/** Non-throwing validity check for a (possibly formatted) pairing code. */
export const isValidPairingCode = (input) => {
	try {
		normalizePairingCode(input);
		return true;
	} catch {
		return false;
	}
};

/** Non-throwing normalize: returns the 8-char code, or null when invalid. */
export const parsePairingCode = (input) => {
	try {
		return normalizePairingCode(input);
	} catch {
		return null;
	}
};

/**
 * Generate a fresh, valid custom pairing code (8 chars from the Crockford
 * alphabet WhatsApp accepts). Injectable RNG for deterministic tests.
 * Pass it straight to `pairWithCode(sock, phone, { customCode })`.
 */
export const generatePairingCode = ({ random = Math.random } = {}) => {
	let code = '';
	for (let i = 0; i < 8; i++) {
		const idx = Math.min(PAIRING_CODE_ALPHABET.length - 1, Math.floor(random() * PAIRING_CODE_ALPHABET.length));
		code += PAIRING_CODE_ALPHABET[idx];
	}
	return code;
};

/** Theoretical entropy of a pairing code in bits: log2(32^8) ≈ 40. */
export const pairingCodeEntropyBits = () => 8 * Math.log2(PAIRING_CODE_ALPHABET.length);

/**
 * Normalize a phone number for `requestPairingCode`: strips spaces, dashes,
 * parentheses, a leading `+` and international `00` prefix, and a single
 * leading `0`. Returns digits only. Throws on anything non-numeric.
 */
export const normalizePhoneForPairing = (input) => {
	let s = String(input ?? '').replace(/[\s\-().]/g, '');
	s = s.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '');
	if (!/^\d{6,15}$/.test(s)) {
		throw new Error(`invalid phone number for pairing: ${JSON.stringify(input)} (expected 6-15 digits)`);
	}
	return s;
};

/** Non-throwing check that a phone number is usable for pairing. */
export const isValidPhoneForPairing = (input) => {
	try {
		normalizePhoneForPairing(input);
		return true;
	} catch {
		return false;
	}
};

/**
 * One-word status of the pairing/registration flow from `creds`:
 * 'registered' | 'code-expired' | 'code-pending' | 'unpaired'.
 */
export const describePairingState = (creds, ttlMs = DEFAULT_PAIRING_CODE_TTL_MS) => {
	if (creds?.registered) {
		return 'registered';
	}
	if (!creds?.pairingCode) {
		return 'unpaired';
	}
	return isPairingCodeExpired(creds, ttlMs) ? 'code-expired' : 'code-pending';
};

/**
 * Freshness check based on `creds.pairingCodeRequestedAt` (recorded by
 * requestPairingCode). Returns `null` when no request time is recorded.
 */
export const isPairingCodeExpired = (creds, ttlMs = DEFAULT_PAIRING_CODE_TTL_MS) => {
	const at = creds?.pairingCodeRequestedAt;
	if (!at) {
		return null;
	}
	return Date.now() - at > ttlMs;
};

/**
 * Everything about the current pairing code in one object, or `null` when no
 * code has been requested: `{ code, formatted, requestedAt, expiresAt,
 * remainingMs, expired }`.
 */
export const getPairingCodeInfo = (creds, ttlMs = DEFAULT_PAIRING_CODE_TTL_MS) => {
	const code = creds?.pairingCode;
	if (!code) {
		return null;
	}
	const requestedAt = creds.pairingCodeRequestedAt;
	const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
	if (!requestedAt) {
		return { code, formatted, requestedAt: undefined, expiresAt: undefined, remainingMs: undefined, expired: null };
	}
	const expiresAt = requestedAt + ttlMs;
	const remainingMs = Math.max(0, expiresAt - Date.now());
	return { code, formatted, requestedAt, expiresAt, remainingMs, expired: remainingMs === 0 };
};

/**
 * Wait until pairing actually completes on this socket.
 *
 * Resolves with:
 * - `{ open: true }` — connection reached 'open' (already-registered session)
 * - `{ isNewLogin: true, restartRequired: true }` — pairing succeeded and
 *   WhatsApp asked for the standard post-pairing restart (recreate the socket)
 *
 * Rejects on logged-out close, on other fatal closes, or on timeout.
 */
export const waitForPairingSuccess = (sock, { timeoutMs = 120_000 } = {}) => {
	return new Promise((resolve, reject) => {
		let timer = null;
		const cleanup = () => {
			sock.ev.off('connection.update', onUpdate);
			if (timer) {
				clearTimeout(timer);
			}
		};
		const onUpdate = (update) => {
			if (update.isNewLogin) {
				cleanup();
				resolve({ isNewLogin: true, restartRequired: true });
				return;
			}
			if (update.connection === 'open') {
				cleanup();
				resolve({ open: true });
				return;
			}
			if (update.connection === 'close') {
				const code = update.lastDisconnect?.error?.output?.statusCode;
				if (code === DisconnectReason.restartRequired) {
					cleanup();
					resolve({ isNewLogin: true, restartRequired: true });
					return;
				}
				cleanup();
				const reason = code === DisconnectReason.loggedOut ? 'logged out' : `connection closed (${code ?? 'unknown'})`;
				reject(new Error(`Pairing failed: ${reason}`));
			}
		};
		sock.ev.on('connection.update', onUpdate);
		if (timeoutMs) {
			// JAP@Fix: this timer must stay REFERENCED — unref'd, a caller
			// awaiting pairWithCode could hang forever when the socket's
			// handles die and nothing else keeps the event loop alive
			// (same bug class as the shutdown/health timers).
			timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Pairing timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		}
	});
};

/**
 * One-call pairing flow: request the code (custom codes accepted in any
 * format), hand it to `onCode`, then wait for the pairing to complete.
 * Set `wait: false` to skip waiting and just get the code back.
 */
export const pairWithCode = async (sock, phoneNumber, options = {}) => {
	const { customCode, onCode, wait = true, timeoutMs = 120_000 } = options;
	// Register the waiter BEFORE requesting: pairing can complete while the
	// request promise is still resolving, and a late listener would miss it.
	const waiter = wait ? waitForPairingSuccess(sock, { timeoutMs }) : null;
	if (waiter) {
		waiter.catch(() => { }); // avoid unhandled rejection if caller only awaits the code
	}
	let code;
	try {
		code = await sock.requestPairingCode(phoneNumber, customCode ? normalizePairingCode(customCode) : undefined);
	} catch (error) {
		throw error;
	}
	const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
	if (onCode) {
		try {
			onCode(code, formatted);
		} catch {
			// onCode display errors must not abort the pairing flow
		}
	}
	if (!waiter) {
		return { code, formatted };
	}
	const outcome = await waiter;
	return { code, formatted, ...outcome };
};
