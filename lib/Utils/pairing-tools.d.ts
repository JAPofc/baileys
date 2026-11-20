/** Pairing tools — code validation, freshness tracking, completion waiting. */

export declare const PAIRING_CODE_ALPHABET: string;
/** Characters WhatsApp accepts in a custom pairing code: A-Z, 0-9. */
export declare const PAIRING_CODE_CHARSET: string;
export declare const DEFAULT_PAIRING_CODE_TTL_MS: number;

/** Strip separators, uppercase and validate an 8-char Crockford code. Throws on invalid input. */
export declare const normalizePairingCode: (input: string) => string;
export declare const isValidPairingCode: (input: string) => boolean;
/** Non-throwing normalize: the 8-char code, or null when invalid. */
export declare const parsePairingCode: (input: string) => string | null;
export interface PairingCodeIssue { char: string; index: number; }
export interface PairingCodeDiagnosis {
    ok: boolean;
    code: string | null;
    length: number;
    invalid: PairingCodeIssue[];
    message: string;
}
/** Pinpoint what is wrong with a desired custom pairing code (disallowed chars, length). */
export declare const describePairingCodeIssues: (input?: string) => PairingCodeDiagnosis;
/** Look-alike substitutions that map to valid Crockford characters (I→1, U→V). */
export declare const PAIRING_LOOKALIKE_MAP: Record<string, string>;
/** Coerce a vanity string into a guaranteed-valid 8-char pairing code. */
export declare const suggestPairingCode: (input?: string, opts?: { map?: Record<string, string>; random?: () => number }) => string;
/** Generate a fresh valid 8-char custom pairing code. */
export declare const generatePairingCode: (opts?: { random?: () => number }) => string;
/** Entropy of a pairing code in bits (~40). */
export declare const pairingCodeEntropyBits: () => number;
/** Normalize a phone number for requestPairingCode (digits only). Throws on invalid. */
export declare const normalizePhoneForPairing: (input: string) => string;
/** Non-throwing check that a phone number is usable for pairing. */
export declare const isValidPhoneForPairing: (input: string) => boolean;
/** Pairing/registration status: 'registered' | 'code-expired' | 'code-pending' | 'unpaired'. */
export declare const describePairingState: (creds: any, ttlMs?: number) => 'registered' | 'code-expired' | 'code-pending' | 'unpaired';

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
