/** Pairing tools — code validation, freshness tracking, completion waiting. */

export declare const PAIRING_CODE_ALPHABET: string;
export declare const DEFAULT_PAIRING_CODE_TTL_MS: number;

/** Strip separators, uppercase and validate an 8-char Crockford code. Throws on invalid input. */
export declare const normalizePairingCode: (input: string) => string;
export declare const isValidPairingCode: (input: string) => boolean;

/** True/false based on creds.pairingCodeRequestedAt, or null when unknown. */
export declare const isPairingCodeExpired: (
	creds: { pairingCode?: string; pairingCodeRequestedAt?: number } | undefined,
	ttlMs?: number
) => boolean | null;

export interface PairingCodeInfo {
	code: string;
	formatted: string;
	requestedAt?: number;
	expiresAt?: number;
	remainingMs?: number;
	expired: boolean | null;
}

export declare const getPairingCodeInfo: (
	creds: { pairingCode?: string; pairingCodeRequestedAt?: number } | undefined,
	ttlMs?: number
) => PairingCodeInfo | null;

export interface PairingOutcome {
	open?: boolean;
	isNewLogin?: boolean;
	/** Recreate the socket after a successful fresh pairing. */
	restartRequired?: boolean;
}

/** Resolve when pairing completes on this socket; reject on logged-out/fatal close/timeout. */
export declare const waitForPairingSuccess: (
	sock: unknown,
	options?: { timeoutMs?: number }
) => Promise<PairingOutcome>;

export interface PairWithCodeOptions {
	/** Custom pairing code in any human format ("abcd-efgh" ok). */
	customCode?: string;
	/** Receives (code, formatted) as soon as the code is issued. */
	onCode?: (code: string, formatted: string) => void;
	/** Wait for pairing completion (default true). */
	wait?: boolean;
	timeoutMs?: number;
}

export declare const pairWithCode: (
	sock: unknown,
	phoneNumber: string,
	options?: PairWithCodeOptions
) => Promise<{ code: string; formatted: string } & PairingOutcome>;
