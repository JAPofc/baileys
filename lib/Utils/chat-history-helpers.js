/** Chat-history helper functions for @japofc/baileys. */

import { generateForwardMessageContent, prepareWAMessageMedia } from './messages.js';

const getMessageArray = (store, jid) => {
    const bucket = store?.messages?.[jid];
    if (!bucket) return [];
    if (Array.isArray(bucket)) return bucket;
    if (Array.isArray(bucket.array)) return bucket.array;
    if (bucket instanceof Map) return Array.from(bucket.values());
    return [];
};

/** Get the most recently stored message in a chat. */
export const getLastMessageInChat = (store, jid) => {
    const messages = getMessageArray(store, jid);
    return messages.length ? messages[messages.length - 1] : undefined;
};

/** Get the oldest stored message in a chat. */
export const getOldestMessageInChat = (store, jid) => {
    const messages = getMessageArray(store, jid);
    return messages.length ? messages[0] : undefined;
};

/** Re-send an existing message to another chat using Baileys' forward builder. */
export const copyNForward = async (sock, jid, message, forceForward = false) => {
    const content = generateForwardMessageContent(message, forceForward);
    return sock.sendMessage(jid, content);
};

/** Upload media to WhatsApp's encrypted media CDN and return send-ready content. */
export const uploadMediaToWhatsApp = async (sock, message, opts = {}) => {
    if (typeof sock?.waUploadToServer !== 'function') {
        throw new Error('uploadMediaToWhatsApp requires sock.waUploadToServer');
    }

    return prepareWAMessageMedia(message, {
        upload: sock.waUploadToServer,
        logger: opts.logger,
        mediaTypeOverride: opts.mediaTypeOverride
    });
};
