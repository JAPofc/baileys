export declare const USERNAME_MIN_LENGTH: number;
export declare const USERNAME_MAX_LENGTH: number;
export declare const USERNAME_PREFIX: string;
export declare const USERNAME_PATTERN: RegExp;
export declare const USERNAME_PIN_PATTERN: RegExp;
export declare const USERNAME_RESERVED: string[];
/** Strip a leading `@` and any jid suffix. */
export declare function stripUsernamePrefix(value: string): string;
/** Is this the 6-digit PIN form? */
export declare function isUsernamePin(value: string): boolean;
/** Validate a username; reports *why* instead of throwing. */
export declare function validateUsername(value: string, opts?: { allowPin?: boolean; reserved?: string[] }): {
    valid: boolean; username: string; reason: string | null; isPin?: boolean;
};
/** How a username should be displayed (`@name`), with a fallback. */
export declare function displayUsername(value: string, opts?: { fallback?: string; withPrefix?: boolean }): string;
