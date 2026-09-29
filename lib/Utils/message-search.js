/** Search and text-extraction helpers for @japofc/baileys message objects. */

const WRAPPER_KEYS = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'editedMessage'
];

const unwrapMessageContent = (messageOrContent) => {
    let content = messageOrContent?.message ?? messageOrContent;
    const seen = new Set();

    for (let i = 0; i < 8 && content && typeof content === 'object'; i++) {
        if (seen.has(content)) break;
        seen.add(content);

        let next;
        for (const key of WRAPPER_KEYS) {
            next = content?.[key]?.message;
            if (next) break;
        }
        if (!next) break;
        content = next;
    }

    return content;
};

const firstText = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return '';
};

const combine = (...values) => values.filter((value) => typeof value === 'string' && value.length > 0).join('\n');

const messageTimestampToDate = (timestamp) => {
    if (timestamp === undefined || timestamp === null) return null;
    const seconds = typeof timestamp === 'number'
        ? timestamp
        : typeof timestamp?.toNumber === 'function'
            ? timestamp.toNumber()
            : Number(timestamp);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
};

export const extractMessageText = (message) => {
    const content = unwrapMessageContent(message);
    if (!content) return '';

    return firstText(
        content.conversation,
        content.extendedTextMessage?.text,
        content.imageMessage?.caption,
        content.videoMessage?.caption,
        content.documentMessage?.caption,
        content.documentMessage?.fileName,
        content.locationMessage?.name,
        content.locationMessage?.address,
        content.contactMessage?.displayName,
        content.contactsArrayMessage?.displayName,
        content.pollCreationMessage?.name,
        content.pollCreationMessageV2?.name,
        content.pollCreationMessageV3?.name,
        content.pollCreationMessageV4?.name,
        content.pollCreationMessageV5?.name,
        content.pollCreationMessageV6?.name,
        content.groupInviteMessage?.caption,
        content.groupInviteMessage?.groupName,
        content.liveLocationMessage?.caption,
        content.orderMessage?.message,
        content.buttonsMessage?.contentText,
        content.listMessage?.description,
        content.listMessage?.title,
        content.templateMessage?.hydratedTemplate?.hydratedContentText,
        content.interactiveMessage?.body?.text,
        content.interactiveMessage?.header?.title,
        content.requestPaymentMessage?.noteMessage ? extractMessageText({ message: content.requestPaymentMessage.noteMessage }) : '',
        content.productMessage?.product ? combine(content.productMessage.product.title, content.productMessage.product.description) : '',
        content.eventMessage ? combine(content.eventMessage.name, content.eventMessage.description) : ''
    );
};

const getMessageType = (message) => {
    const content = unwrapMessageContent(message);
    if (!content) return 'other';
    if (content.conversation || content.extendedTextMessage) return 'text';
    if (content.imageMessage) return 'image';
    if (content.videoMessage) return 'video';
    if (content.documentMessage) return 'document';
    if (content.audioMessage) return 'audio';
    if (content.stickerMessage) return 'sticker';
    if (content.locationMessage || content.liveLocationMessage) return 'location';
    if (content.contactMessage || content.contactsArrayMessage) return 'contact';
    return 'other';
};

const passesFilters = (message, options) => {
    if (options.jid && message.key?.remoteJid !== options.jid) return false;
    if (options.fromSender && message.key?.participant !== options.fromSender) return false;
    if (options.fromMe !== undefined && message.key?.fromMe !== options.fromMe) return false;

    if (options.fromDate || options.toDate) {
        const date = messageTimestampToDate(message.messageTimestamp);
        if (date) {
            if (options.fromDate && date < options.fromDate) return false;
            if (options.toDate && date > options.toDate) return false;
        }
    }

    if (options.messageTypes?.length && !options.messageTypes.includes(getMessageType(message))) return false;
    return true;
};

export const calculateRelevance = (query, text, position) => {
    if (position < 0) return 0;

    const source = String(text);
    const needle = String(query);
    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let score = 100;

    if (lowerSource === lowerNeedle) score += 50;
    if (position === 0) score += 20;
    else if (/\s|[.,!?;:()[\]{}"']/.test(lowerSource[position - 1] ?? '')) score += 10;

    const after = position + lowerNeedle.length;
    if (after === source.length) score += 10;
    else if (/\s|[.,!?;:()[\]{}"']/.test(lowerSource[after] ?? '')) score += 10;

    score -= Math.min(position / 10, 20);
    return Math.max(0, score);
};

/** Plain-text substring search with relevance-sorted results. */
export const searchMessages = (messages, query, options = {}) => {
    const results = [];
    const needle = options.caseSensitive ? String(query) : String(query).toLowerCase();
    if (!needle) return results;

    for (const message of messages) {
        if (!passesFilters(message, options)) continue;

        const text = extractMessageText(message);
        if (!text) continue;

        const haystack = options.caseSensitive ? text : text.toLowerCase();
        const position = haystack.indexOf(needle);
        if (position === -1) continue;

        results.push({
            message,
            matchedText: text.slice(Math.max(0, position - 20), Math.min(text.length, position + String(query).length + 20)),
            matchPosition: position,
            relevanceScore: calculateRelevance(query, text, position)
        });
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return options.limit ? results.slice(0, options.limit) : results;
};

/** Regex-based search for bot commands, structured tags, or custom patterns. */
export const searchMessagesRegex = (messages, pattern, options = {}) => {
    const results = [];
    const flags = pattern.flags.replace(/g/g, '');

    for (const message of messages) {
        if (!passesFilters(message, options)) continue;

        const text = extractMessageText(message);
        if (!text) continue;

        const regex = new RegExp(pattern.source, flags);
        const match = regex.exec(text);
        if (!match) continue;

        results.push({
            message,
            matchedText: match[0],
            matchPosition: match.index ?? 0,
            relevanceScore: 100
        });

        if (options.limit && results.length >= options.limit) break;
    }

    return results;
};

/** Standalone searchable index; feed it messages independently of the main Store. */
export class MessageSearchManager {
    messages = [];
    messageIndex = new Map();

    addMessages(messages) {
        for (const message of messages) {
            const id = message.key?.id;
            if (!id || this.messageIndex.has(id)) continue;
            this.messages.push(message);
            this.messageIndex.set(id, message);
        }
    }

    removeMessages(messageIds) {
        const ids = new Set(messageIds);
        this.messages = this.messages.filter((message) => !ids.has(message.key?.id || ''));
        for (const id of ids) this.messageIndex.delete(id);
    }

    clear() {
        this.messages = [];
        this.messageIndex.clear();
    }

    get count() {
        return this.messages.length;
    }

    search(query, options) {
        return searchMessages(this.messages, query, options);
    }

    searchRegex(pattern, options) {
        return searchMessagesRegex(this.messages, pattern, options);
    }

    getByJid(jid) {
        return this.messages.filter((message) => message.key?.remoteJid === jid);
    }

    getBySender(sender) {
        return this.messages.filter((message) => message.key?.participant === sender || message.key?.remoteJid === sender);
    }

    getByType(type) {
        return this.messages.filter((message) => getMessageType(message) === type);
    }

    getById(id) {
        return this.messageIndex.get(id);
    }
}

export const createMessageSearch = () => new MessageSearchManager();
