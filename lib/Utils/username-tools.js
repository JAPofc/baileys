/**
 * lib/Utils/username-tools.js — WhatsApp usernames (the `@name` identity).
 *
 * Pure helpers: validation against WhatsApp's rules, display formatting, and the PIN
 * variant. No network — `sock.checkUsername()` / `sock.updateUsername()` do the talking.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
/** The one prefix WhatsApp shows in front of a username. */
export const USERNAME_PREFIX = '@';
/** Usernames must start with a letter, then letters/digits/._- , no trailing separator. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{1,28}[a-z0-9]$/;
/** A PIN is exactly 6 digits. */
export const USERNAME_PIN_PATTERN = /^\d{6}$/;
/** Names WhatsApp will never hand out. */
export const USERNAME_RESERVED = ['whatsapp', 'wa', 'meta', 'facebook', 'instagram', 'admin', 'support', 'status', 'broadcast'];

/** Strip a leading `@` (and the `@s.whatsapp.net`/`@lid` suffix of a jid). */
export const stripUsernamePrefix = (value) => {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    const withoutJid = text.includes('@s.whatsapp.net') || text.includes('@lid') ? text.split('@')[0] : text;
    return withoutJid.startsWith(USERNAME_PREFIX) ? withoutJid.slice(1) : withoutJid;
};

/** Is this the 6-digit PIN form rather than a name? */
export const isUsernamePin = (value) => USERNAME_PIN_PATTERN.test(stripUsernamePrefix(value));

/**
 * Validate a username. Returns a report instead of throwing, so a bot can explain *why*.
 *
 * ```js
 * validateUsername('ja.p_official')  // { valid: true, username: 'ja.p_official', reason: null }
 * validateUsername('1nope')          // { valid: false, reason: 'must start with a letter' }
 * ```
 */
export const validateUsername = (value, { allowPin = true, reserved = USERNAME_RESERVED } = {}) => {
    const raw = stripUsernamePrefix(value);
    const username = raw.toLowerCase();
    const fail = reason => ({ valid: false, username: raw, reason });
    if (!raw) {
        return fail('empty');
    }
    if (USERNAME_PIN_PATTERN.test(raw)) {
        return allowPin
            ? { valid: true, username: raw, reason: null, isPin: true }
            : fail('a 6-digit PIN is not allowed here');
    }
    if (raw !== username) {
        return fail('must be lowercase');
    }
    if (username.length < USERNAME_MIN_LENGTH) {
        return fail(`must be at least ${USERNAME_MIN_LENGTH} characters`);
    }
    if (username.length > USERNAME_MAX_LENGTH) {
        return fail(`must be at most ${USERNAME_MAX_LENGTH} characters`);
    }
    if (!/^[a-z]/.test(username)) {
        return fail('must start with a letter');
    }
    if (!/[a-z0-9]$/.test(username)) {
        return fail('must end with a letter or a digit');
    }
    if (/[^a-z0-9._-]/.test(username)) {
        return fail('only letters, digits, dot, underscore and hyphen are allowed');
    }
    if (/[._-]{2,}/.test(username)) {
        return fail('no two separators in a row');
    }
    if (reserved?.includes(username)) {
        return fail('that username is reserved');
    }
    if (!USERNAME_PATTERN.test(username)) {
        return fail('not a valid username');
    }
    return { valid: true, username, reason: null, isPin: false };
};

/**
 * How a username should be shown: `@name`, or the PIN spelled out. Falls back to the
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
