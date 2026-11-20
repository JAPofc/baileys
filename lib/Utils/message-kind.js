/**
 * Message kind helpers for @japofc/baileys.
 *
 * These helpers keep the public API small: identify which outgoing
 * button/list/native-flow payload is being sent, and normalize user replies
 * from the different WhatsApp interactive response message shapes.
 */

const MESSAGE_WRAPPERS = [
    ['ephemeralMessage', 'message'],
    ['viewOnceMessage', 'message'],
    ['viewOnceMessageV2', 'message'],
    ['viewOnceMessageV2Extension', 'message'],
    ['documentWithCaptionMessage', 'message'],
    ['editedMessage', 'message']
];

const unwrapMessage = (message) => {
    let content = message;
    const seen = new Set();

    for (let i = 0; i < 8 && content && typeof content === 'object'; i++) {
        if (seen.has(content)) break;
        seen.add(content);

        let next;
        for (const [wrapper, field] of MESSAGE_WRAPPERS) {
            next = content?.[wrapper]?.[field];
            if (next) break;
        }
        if (!next) break;
        content = next;
    }

    return content;
};

const parseJsonObject = (text) => {
    if (!text || typeof text !== 'string') return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
};

const normalizeText = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return null;
};

const resolveNativeFlowAddonKind = (nativeFlow) => {
    const firstButtonName = nativeFlow?.buttons?.[0]?.name;
    switch (firstButtonName) {
    case 'payment_info':
        return 'payment_info';
    case 'review_and_pay':
    case 'order_details':
        return 'order_details';
    default:
        return 'interactive';
    }
};

/**
 * Resolves which kind of button/list addon an outgoing message carries.
 * Returns null when no supported interactive payload is present.
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 * @returns {'list' | 'interactive' | 'payment_info' | 'order_details' | null}
 */
export const resolveButtonAddonKind = (message) => {
    const content = unwrapMessage(message);
    if (!content) return null;

    if (content.listMessage) return 'list';
    if (content.buttonsMessage) return 'interactive';

    const nativeFlow = content.interactiveMessage?.nativeFlowMessage;
    return nativeFlow ? resolveNativeFlowAddonKind(nativeFlow) : null;
};

const EMPTY_REPLY = Object.freeze({ kind: null, id: null, displayText: null, params: null });

/**
 * Reads whatever a user tapped (button, list row, native-flow, or template
 * button) and returns one stable shape. Invalid native-flow paramsJson is
 * treated as absent instead of throwing into bot code.
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 * @returns {{kind: 'buttons_response'|'list_response'|'native_flow_response'|'template_button_reply'|null, id: string|null, displayText: string|null, params: Record<string, any>|null}}
 */
export const parseInteractiveReply = (message) => {
    const content = unwrapMessage(message);
    if (!content) return { ...EMPTY_REPLY };

    const buttons = content.buttonsResponseMessage;
    if (buttons) {
        return {
            kind: 'buttons_response',
            id: normalizeText(buttons.selectedButtonId),
            displayText: normalizeText(buttons.selectedDisplayText),
            params: null
        };
    }

    const list = content.listResponseMessage;
    if (list) {
        return {
            kind: 'list_response',
            id: normalizeText(list.singleSelectReply?.selectedRowId),
            displayText: normalizeText(list.title, list.description),
            params: null
        };
    }

    const interactive = content.interactiveResponseMessage;
    if (interactive) {
        const native = interactive.nativeFlowResponseMessage;
        const params = parseJsonObject(native?.paramsJson);
        return {
            kind: 'native_flow_response',
            id: normalizeText(params?.id, params?.button_id, params?.row_id, native?.name),
            displayText: normalizeText(interactive.body?.text, interactive.header?.title),
            params
        };
    }

    const template = content.templateButtonReplyMessage;
    if (template) {
        return {
            kind: 'template_button_reply',
            id: normalizeText(template.selectedId),
            displayText: normalizeText(template.selectedDisplayText),
            params: null
        };
    }

    return { ...EMPTY_REPLY };
};
