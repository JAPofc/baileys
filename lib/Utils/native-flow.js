/**
 * lib/Utils/native-flow.js — the native-flow button catalogue, shared.
 *
 * Which `nativeFlowMessage` button names exist, which of them the *Web* client can actually
 * render (a name WhatsApp accepts but Web cannot draw produces a blank bubble), how many fit
 * in one message, and the normalisation every builder was doing slightly differently.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { INTERACTIVE_BUTTON_NAMES } from './interactive-button-names.js';
import { isKnownButtonName } from '../Builders/auto-update.js';

/** Every native-flow name this build knows (the live, refreshable table). */
export const NATIVE_FLOW_NAMES = [...INTERACTIVE_BUTTON_NAMES];
/** WhatsApp refuses a native-flow message with more buttons than this. */
export const NATIVE_FLOW_BUTTON_LIMIT = 3;
/** Rows allowed in one `single_select` section. */
export const NATIVE_FLOW_ROW_LIMIT = 10;
/** Names the WhatsApp **Web** client can render; the rest only draw on phones. */
export const WEB_SUPPORTED_FLOW_NAMES = [
    'quick_reply',
    'cta_url',
    'cta_copy',
    'cta_call',
    'single_select',
    'cta_reminder',
    'cta_cancel_reminder',
    'address_message',
    'send_location'
];

/** Is this a name the current (refreshable) table accepts? */
export const isKnownFlowName = (name) => {
    try {
        return isKnownButtonName(name);
    }
    catch {
        return NATIVE_FLOW_NAMES.includes(name);
    }
};

/** Will WhatsApp Web draw this button, or only the phone clients? */
export const isWebSupportedButtonName = (name) => WEB_SUPPORTED_FLOW_NAMES.includes(String(name ?? ''));

/**
 * Work out the native-flow name for a loosely-specified button
 * (`{ url }` → `cta_url`, `{ copy }` → `cta_copy`, `{ phone }` → `cta_call`, …).
 */
export const getNativeFlowNameByButtonName = (button) => {
    if (typeof button === 'string') {
        return isKnownFlowName(button) ? button : null;
    }
    if (!button || typeof button !== 'object') {
        return null;
    }
    if (button.name && isKnownFlowName(button.name)) {
        return button.name;
    }
    if (button.url || button.urlButton) {
        return 'cta_url';
    }
    if (button.copy || button.copyCode || button.copy_code) {
        return 'cta_copy';
    }
    if (button.phone || button.phoneNumber || button.call) {
        return 'cta_call';
    }
    if (button.sections || button.rows) {
        return 'single_select';
    }
    if (button.id || button.text || button.displayText || button.buttonText) {
        return 'quick_reply';
    }
    return null;
};

/**
 * Check a set of buttons before they go on the wire: unknown names, too many buttons,
 * duplicate ids, missing parameters, and names WhatsApp Web cannot draw.
 *
 * ```js
 * checkNativeFlowButtons(buttons)
 * // → { ok, errors: [], warnings: ['button[1] "galaxy_message" does not render on WhatsApp Web'] }
 * ```
 */
export const checkNativeFlowButtons = (buttons, { limit = NATIVE_FLOW_BUTTON_LIMIT, requireWebSupport = false } = {}) => {
    const list = Array.isArray(buttons) ? buttons : [buttons];
    const errors = [];
    const warnings = [];
    const ids = new Set();
    if (!list.length) {
        errors.push('no buttons given');
    }
    if (list.length > limit) {
        errors.push(`${list.length} buttons, but at most ${limit} fit in one message`);
    }
    list.forEach((button, index) => {
        const name = getNativeFlowNameByButtonName(button);
        if (!name) {
            errors.push(`button[${index}] has no recognisable type (give it a "name", or a url/copy/phone/id)`);
            return;
        }
        if (!isKnownFlowName(name)) {
            errors.push(`button[${index}] name "${name}" is not accepted`);
            return;
        }
        if (!isWebSupportedButtonName(name)) {
            const message = `button[${index}] "${name}" does not render on WhatsApp Web`;
            (requireWebSupport ? errors : warnings).push(message);
        }
        let params = button?.buttonParamsJson;
        if (typeof params === 'string') {
            try {
                params = JSON.parse(params);
            }
            catch {
                errors.push(`button[${index}] buttonParamsJson is not valid JSON`);
                return;
            }
        }
        const merged = { ...(params || {}), ...(typeof button === 'object' ? button : {}) };
        const display = merged.display_text ?? merged.displayText ?? merged.text ?? merged.buttonText;
        if (!display) {
            errors.push(`button[${index}] has no display text`);
        }
        if (name === 'cta_url' && !(merged.url || merged.urlButton)) {
            errors.push(`button[${index}] cta_url needs a url`);
        }
        if (name === 'cta_call' && !(merged.phone_number || merged.phone || merged.phoneNumber)) {
            errors.push(`button[${index}] cta_call needs a phone number`);
        }
        if (name === 'cta_copy' && !(merged.copy_code || merged.copy || merged.copyCode)) {
            errors.push(`button[${index}] cta_copy needs a copy_code`);
        }
        const id = merged.id ?? merged.buttonId;
        if (id) {
            if (ids.has(id)) {
                errors.push(`button[${index}] duplicate id "${id}"`);
            }
            ids.add(id);
        }
    });
    return { ok: errors.length === 0, errors, warnings };
};

/**
 * Normalise loosely-written buttons into the `{ name, buttonParamsJson }` shape the wire
 * wants. Throws (naming the offender) rather than shipping a button that renders blank.
 */
export const validateAndNormalizeButtons = (buttons, options = {}) => {
    const list = (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean);
    const report = checkNativeFlowButtons(list, options);
    if (!report.ok) {
        throw new Boom(`validateAndNormalizeButtons: ${report.errors.join('; ')}`, {
            statusCode: 400,
            data: report
        });
    }
    return list.map(button => {
        const name = getNativeFlowNameByButtonName(button);
        if (typeof button === 'object' && typeof button.buttonParamsJson === 'string') {
            return { name, buttonParamsJson: button.buttonParamsJson };
        }
        const source = typeof button === 'object' ? { ...(button.buttonParamsJson || {}), ...button } : {};
        const display = source.display_text ?? source.displayText ?? source.text ?? source.buttonText;
        const params = { display_text: display };
        if (name === 'cta_url') {
            params.url = source.url ?? source.urlButton;
            if (source.merchant_url) {
                params.merchant_url = source.merchant_url;
            }
        }
        else if (name === 'cta_call') {
            params.phone_number = source.phone_number ?? source.phone ?? source.phoneNumber;
        }
        else if (name === 'cta_copy') {
            params.copy_code = source.copy_code ?? source.copy ?? source.copyCode;
            params.id = source.id ?? 'copy';
        }
        else if (name === 'quick_reply') {
            params.id = source.id ?? source.buttonId ?? display;
        }
        else if (name === 'single_select') {
            params.title = source.title ?? display;
            params.sections = validateAndNormalizeSections(source.sections ?? source.rows ?? []);
        }
        for (const [key, value] of Object.entries(source)) {
            if (key.startsWith('_') || ['name', 'buttonParamsJson', 'text', 'displayText', 'buttonText', 'sections', 'rows'].includes(key)) {
                continue;
            }
            if (params[key] === undefined && typeof value !== 'object') {
                params[key] = value;
            }
        }
        return { name, buttonParamsJson: JSON.stringify(params) };
    });
};

/**
 * Normalise list sections/rows: accepts a flat row array or `[{ title, rows }]`, fills the
 * row ids, and rejects an empty section or an over-long one instead of silently truncating.
 */
export const validateAndNormalizeSections = (sections, { rowLimit = NATIVE_FLOW_ROW_LIMIT } = {}) => {
    const list = Array.isArray(sections) ? sections : [sections];
    const normalized = (list[0] && (list[0].rows || list[0].title) ? list : [{ title: '', rows: list }])
        .filter(Boolean)
        .map((section, sectionIndex) => {
            const rows = (Array.isArray(section.rows) ? section.rows : []).filter(Boolean).map((row, rowIndex) => {
                const title = row.title ?? row.text ?? row.header;
                if (!title) {
                    throw new Boom(`validateAndNormalizeSections: section[${sectionIndex}].rows[${rowIndex}] has no title`, {
                        statusCode: 400
                    });
                }
                return {
                    title: String(title),
                    ...(row.description ? { description: String(row.description) } : {}),
                    id: String(row.id ?? row.rowId ?? `row_${sectionIndex}_${rowIndex}`)
                };
            });
            if (!rows.length) {
                throw new Boom(`validateAndNormalizeSections: section[${sectionIndex}] has no rows`, { statusCode: 400 });
            }
            if (rows.length > rowLimit) {
                throw new Boom(`validateAndNormalizeSections: section[${sectionIndex}] has ${rows.length} rows, the limit is ${rowLimit}`, {
                    statusCode: 400,
                    data: { rows: rows.length, rowLimit }
                });
            }
            const ids = new Set();
            for (const row of rows) {
                if (ids.has(row.id)) {
                    throw new Boom(`validateAndNormalizeSections: duplicate row id "${row.id}"`, { statusCode: 400 });
                }
                ids.add(row.id);
            }
            return { title: String(section.title ?? ''), rows };
        });
    if (!normalized.length) {
        throw new Boom('validateAndNormalizeSections: at least one section is required', { statusCode: 400 });
    }
    return normalized;
};
