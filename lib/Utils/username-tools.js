/**
 * lib/Utils/username-tools.js — WhatsApp usernames (the `@name` identity).
 *
 * Pure helpers: validation against WhatsApp's rules, display formatting, and the
 * "username key" PIN. No network — `sock.checkUsername()` / `sock.updateUsername()` do the
 * talking.
 *
 * JAP@Fix (§2.111): the rules here used to be invented rather than WhatsApp's. They rejected
 * perfectly claimable usernames (31–35 characters, anything not starting with a letter,
 * anything ending in `_`) and accepted ones the server refuses (hyphens, `www.` prefixes,
 * `.com`/`.net` endings). The PIN was treated as 6 digits; WhatsApp's username key is 4.
 *
 * WhatsApp's actual rules: 3–35 characters, lowercase letters, digits, `.` and `_` only, at
 * least one letter, no leading/trailing `.`, no `..`, no `www.` prefix and no domain suffix.
 *
 * Part of @japofc/baileys.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 35;
/** WhatsApp's "username key" is a 4-digit PIN. */
export const USERNAME_PIN_LENGTH = 4;
/** The one prefix WhatsApp shows in front of a username. */
export const USERNAME_PREFIX = '@';
/** Lowercase letters, digits, dot and underscore; at least one letter; dots not at the edges. */
export const USERNAME_PATTERN = /^(?![.])(?!.*\.\.)(?!.*\.$)[a-z0-9._]{3,35}$/;
/** A username key is exactly 4 digits. */
export const USERNAME_PIN_PATTERN = /^\d{4}$/;
/** Endings WhatsApp reads as a web address. */
export const USERNAME_DOMAIN_SUFFIXES = Object.freeze([
    '.com', '.org', '.net', '.int', '.edu', '.gov', '.mil', '.arpa', '.io', '.co',
    '.html', '.htm', '.txt', '.xml'
]);
/** Brand names WhatsApp will not hand out. */
export const USERNAME_RESERVED = Object.freeze(['whatsapp', 'instagram', 'facebook', 'oculus', 'meta']);

/** Every reason `validateUsername()` can give, as a stable machine-readable code. */
export const UsernameValidationError = Object.freeze({
    EMPTY: 'EMPTY',
    INVALID_LENGTH: 'INVALID_LENGTH',
    INVALID_CHARACTER: 'INVALID_CHARACTER',
    INVALID_NO_LETTERS: 'INVALID_NO_LETTERS',
    INVALID_PERIODS: 'INVALID_PERIODS',
    INVALID_WWW_PREFIX: 'INVALID_WWW_PREFIX',
    INVALID_DOMAIN_SUFFIX: 'INVALID_DOMAIN_SUFFIX',
    INVALID_WORD: 'INVALID_WORD',
    PIN_NOT_ALLOWED: 'PIN_NOT_ALLOWED'
});

/** Strip a leading `@` (and the `@s.whatsapp.net`/`@lid` suffix of a jid). */
export const stripUsernamePrefix = (value) => {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    const withoutJid = text.includes('@s.whatsapp.net') || text.includes('@lid') ? text.split('@')[0] : text;
    return withoutJid.startsWith(USERNAME_PREFIX) ? withoutJid.slice(1) : withoutJid;
};

/** Is this the 4-digit username key rather than a name? */
export const isUsernamePin = (value) => USERNAME_PIN_PATTERN.test(stripUsernamePrefix(value));

/**
 * Validate a username. Returns a report instead of throwing, so a bot can explain *why*.
 *
 * ```js
 * validateUsername('ja.p_official')  // { valid: true, username: 'ja.p_official', reason: null }
 * validateUsername('shop.com')       // { valid: false, errorType: 'INVALID_DOMAIN_SUFFIX', … }
 * ```
 */
export const validateUsername = (value, { allowPin = true, reserved = USERNAME_RESERVED } = {}) => {
    const raw = stripUsernamePrefix(value);
    const username = raw.toLowerCase();
    const fail = (errorType, reason) => ({ valid: false, username: raw, reason, errorType });
    if (!raw) {
        return fail(UsernameValidationError.EMPTY, 'empty');
    }
    if (USERNAME_PIN_PATTERN.test(raw)) {
        return allowPin
            ? { valid: true, username: raw, reason: null, errorType: null, isPin: true }
            : fail(UsernameValidationError.PIN_NOT_ALLOWED, `a ${USERNAME_PIN_LENGTH}-digit username key is not allowed here`);
    }
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
        return fail(UsernameValidationError.INVALID_LENGTH, `must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`);
    }
    if (/[^a-z0-9._]/.test(username)) {
        return fail(UsernameValidationError.INVALID_CHARACTER, 'only lowercase letters, digits, dot and underscore are allowed');
    }
    if (!/[a-z]/.test(username)) {
        return fail(UsernameValidationError.INVALID_NO_LETTERS, 'must contain at least one letter');
    }
    if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) {
        return fail(UsernameValidationError.INVALID_PERIODS, 'a dot cannot start or end the username, and two dots cannot touch');
    }
    if (username.startsWith('www.')) {
        return fail(UsernameValidationError.INVALID_WWW_PREFIX, 'cannot start with "www."');
    }
    if (USERNAME_DOMAIN_SUFFIXES.some(suffix => username.endsWith(suffix))) {
        return fail(UsernameValidationError.INVALID_DOMAIN_SUFFIX, 'cannot end with a domain suffix');
    }
    if (reserved?.some(word => username.includes(word))) {
        return fail(UsernameValidationError.INVALID_WORD, 'that username is reserved');
    }
    if (!USERNAME_PATTERN.test(username)) {
        return fail(UsernameValidationError.INVALID_CHARACTER, 'not a valid username');
    }
    return { valid: true, username, reason: null, errorType: null, isPin: false };
};

/**
 * How a username should be shown: `@name`, or the username key spelled out. Falls back to the
 * `fallback` (a push name, say) when there is no username at all.
 */
export const displayUsername = (value, { fallback = '', withPrefix = true } = {}) => {
    const raw = stripUsernamePrefix(value);
    if (!raw) {
        return fallback;
    }
    if (USERNAME_PIN_PATTERN.test(raw)) {
        return `${USERNAME_PREFIX}${raw}`;
    }
    const check = validateUsername(raw);
    if (!check.valid) {
        return fallback || raw;
    }
    return withPrefix ? `${USERNAME_PREFIX}${check.username}` : check.username;
};
