/**
 * lib/Utils/button-support.js — will this chat actually render interactive buttons?
 *
 * Native-flow buttons are drawn by the *recipient's* client, and by the account's own
 * paired platform. An iPhone-paired bot account, or a recipient on a client that does not
 * draw a given flow, receives a bubble that looks empty — the send "succeeds" and the user
 * sees nothing. This module answers the question before you send, and can degrade to plain
 * text instead of shipping a blank bubble.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { getDevice } from './messages.js';
import { checkNativeFlowButtons, isWebSupportedButtonName } from './native-flow.js';

/** Platforms whose clients reliably draw native-flow buttons. */
export const BUTTON_CAPABLE_PLATFORMS = ['android', 'web', 'desktop', 'smba', 'smb_android', 'windows', 'mac'];
/** Platforms known to render them unreliably (or not at all). */
export const BUTTON_UNRELIABLE_PLATFORMS = ['ios', 'iphone', 'ipad', 'smb_ios', 'kaios'];

const normalisePlatform = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Can the *account itself* send renderable buttons?
 *
 * ```js
 * supportsInteractiveButtons(sock)
 * // → { supported: false, platform: 'ios', reason: 'the paired device is ios …' }
 * ```
 * An unknown platform is treated as capable — refusing to send on a guess would be worse
 * than sending something that might render.
 */
export const supportsInteractiveButtons = (sock) => {
    const platform = normalisePlatform(sock?.authState?.creds?.platform ?? sock?.platform);
    if (!platform) {
        return { supported: true, platform: null, reason: null };
    }
    if (BUTTON_UNRELIABLE_PLATFORMS.includes(platform)) {
        return {
            supported: false,
            platform,
            reason: `the paired device is ${platform}, which does not render native-flow buttons reliably`
        };
    }
    return { supported: true, platform, reason: null };
};

/** Which device sent this message (`'ios' | 'android' | 'web' | 'desktop' | 'unknown'`). */
export const getMessageDevice = (msg) => {
    const id = typeof msg === 'string' ? msg : msg?.key?.id;
    return id ? getDevice(id) : 'unknown';
};

/**
 * Turn an interactive payload into the plain text a non-rendering client *can* read:
 * the body, then each button as a numbered line (with its URL/phone/copy code).
 */
export const describeButtonsAsText = (content, { header = true, numbered = true } = {}) => {
    const lines = [];
    const text = content?.text ?? content?.caption ?? content?.body?.text ?? content?.body;
    if (header && text) {
        lines.push(String(text));
    }
    const buttons = content?.interactiveButtons ?? content?.buttons ?? content?.nativeFlowMessage?.buttons ?? [];
    const list = Array.isArray(buttons) ? buttons : [buttons];
    list.forEach((button, index) => {
        let params = button?.buttonParamsJson;
        if (typeof params === 'string') {
            try {
                params = JSON.parse(params);
            }
            catch {
                params = {};
            }
        }
        const merged = { ...(params || {}), ...(typeof button === 'object' ? button : {}) };
        const label = merged.display_text ?? merged.displayText ?? merged.text ?? merged.buttonText
            ?? merged.title ?? (typeof button === 'string' ? button : null);
        if (!label) {
            return;
        }
        const detail = merged.url ? ` — ${merged.url}`
            : merged.phone_number || merged.phone ? ` — ${merged.phone_number ?? merged.phone}`
                : merged.copy_code || merged.copy ? ` — ${merged.copy_code ?? merged.copy}`
                    : merged.id ? ` (${merged.id})` : '';
        lines.push(`${numbered ? `${index + 1}. ` : '• '}${label}${detail}`);
    });
    const footer = content?.footer?.text ?? content?.footer;
    if (footer) {
        lines.push(String(footer));
    }
    if (!lines.length) {
        throw new Boom('describeButtonsAsText: nothing in this content can be described as text', {
            statusCode: 400
        });
    }
    return lines.join('\n');
};

/**
 * Send interactive content, but fall back to plain text when it would not render.
 *
 * ```js
 * await sendInteractiveSafe(sock, jid, { text: 'Pick one', interactiveButtons })
 * // → { mode: 'interactive' | 'text', reason, message }
 * ```
 * Falls back when the paired device cannot draw buttons, or (with
 * `{ requireWebSupport: true }`) when a button name WhatsApp Web cannot draw is used.
 * `{ fallback: false }` turns the situation into an error instead.
 */
export const sendInteractiveSafe = async (sock, jid, content, { fallback = true, requireWebSupport = false, ...options } = {}) => {
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('sendInteractiveSafe: a connected socket is required', { statusCode: 400 });
    }
    const capability = supportsInteractiveButtons(sock);
    const buttons = content?.interactiveButtons ?? content?.buttons;
    let reason = capability.supported ? null : capability.reason;
    if (!reason && requireWebSupport && Array.isArray(buttons)) {
        const unsupported = buttons
            .map(button => button?.name)
            .filter(name => name && !isWebSupportedButtonName(name));
        if (unsupported.length) {
            reason = `these button names do not render on WhatsApp Web: ${unsupported.join(', ')}`;
        }
    }
    if (!reason && Array.isArray(buttons) && buttons.length) {
        const report = checkNativeFlowButtons(buttons, { requireWebSupport });
        if (!report.ok) {
            throw new Boom(`sendInteractiveSafe: ${report.errors.join('; ')}`, { statusCode: 400, data: report });
        }
    }
    if (!reason) {
        return { mode: 'interactive', reason: null, message: await sock.sendMessage(jid, content, options) };
    }
    if (!fallback) {
        throw new Boom(`sendInteractiveSafe: ${reason}`, { statusCode: 400, data: { reason } });
    }
    const text = describeButtonsAsText(content);
    sock.logger?.debug?.({ jid, reason }, 'interactive buttons would not render; sending text instead');
    return { mode: 'text', reason, message: await sock.sendMessage(jid, { text }, options) };
};
