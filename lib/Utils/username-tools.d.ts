export declare const USERNAME_MIN_LENGTH: number;
export declare const USERNAME_MAX_LENGTH: number;
/** WhatsApp's "username key" is a 4-digit PIN. */
export declare const USERNAME_PIN_LENGTH: number;
export declare const USERNAME_PREFIX: string;
export declare const USERNAME_PATTERN: RegExp;
export declare const USERNAME_PIN_PATTERN: RegExp;
export declare const USERNAME_DOMAIN_SUFFIXES: readonly string[];
export declare const USERNAME_RESERVED: readonly string[];

export type UsernameValidationErrorType =
    | 'EMPTY'
    | 'INVALID_LENGTH'
    | 'INVALID_CHARACTER'
    | 'INVALID_NO_LETTERS'
    | 'INVALID_PERIODS'
    | 'INVALID_WWW_PREFIX'
    | 'INVALID_DOMAIN_SUFFIX'
    | 'INVALID_WORD'
    | 'PIN_NOT_ALLOWED';

export declare const UsernameValidationError: Readonly<Record<UsernameValidationErrorType, UsernameValidationErrorType>>;

export interface UsernameValidation {
    valid: boolean;
    username: string;
    reason: string | null;
    /** Stable machine-readable code; `null` when the username is valid. */
    errorType: UsernameValidationErrorType | null;
    isPin?: boolean;
}

/** Strip a leading `@` and any jid suffix. */
export declare function stripUsernamePrefix(value: string): string;
/** Is this the 4-digit username key? */
export declare function isUsernamePin(value: string): boolean;
/** Validate a username against WhatsApp's rules; reports *why* instead of throwing. */
export declare function validateUsername(value: string, opts?: { allowPin?: boolean; reserved?: readonly string[] }): UsernameValidation;
/** How a username should be displayed (`@name`), with a fallback. */
export declare function displayUsername(value: string, opts?: { fallback?: string; withPrefix?: boolean }): string;
