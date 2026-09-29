// JAP@Add --- anti-edit: capture what a message said BEFORE it was edited.
// The missing sibling of anti-delete.js: WhatsApp delivers an edit as a new
// message carrying a protocolMessage of type MESSAGE_EDIT whose
// `editedMessage` holds only the NEW content — the original is gone unless
// something stored it. Reuses the same MessageStore that anti-delete fills
// via createMessageStoreHandler, so one store powers both features.
//
// ```js
// import { MessageStore, createMessageStoreHandler, createAntiEditUpsertHandler } from '@japofc/baileys'
//
// const store = new MessageStore()
// sock.ev.on('messages.upsert', createMessageStoreHandler(store))
// sock.ev.on('messages.upsert', createAntiEditUpsertHandler(store, (info) => {
//     console.log(`${info.editedBy} edited: "${info.beforeText}" -> "${info.afterText}" (edit #${info.editCount})`)
// }))
// ```
import { proto } from '../../WAProto/index.js';
import { extractMessageText } from './message-search.js';

/** True when `message` is an edit notification (protocolMessage MESSAGE_EDIT with new content). */
export const isEditMessage = (message) => {
    const pm = message?.message?.protocolMessage;
    return pm?.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && !!pm.editedMessage;
};

/** Key of the message that was edited (remoteJid falls back to the envelope's chat). */
export const getEditedMessageKey = (message) => {
    const pm = message?.message?.protocolMessage;
    if (!pm?.key) {
        return null;
    }
    return {
        ...pm.key,
        remoteJid: pm.key.remoteJid || message.key?.remoteJid
    };
};

/**
 * The NEW content carried by the edit. Edits produced by some clients wrap the
 * content in one more `message` envelope — unwrap it either way.
 */
export const getEditedContent = (message) => {
    const edited = message?.message?.protocolMessage?.editedMessage;
    if (!edited) {
        return null;
    }
    return edited.message ?? edited;
};

/**
 * Wire into `sock.ev.on('messages.upsert', ...)` (alongside
 * createMessageStoreHandler, which must be registered FIRST so originals are
 * captured before any edit arrives). For every incoming edit it reports
 * `{ key, editedBy, editedAt, before, after, beforeText, afterText, editCount, history }`
 * and then updates the store in place, so consecutive edits chain correctly:
 * the "before" of edit #2 is the content edit #1 produced, and `history`
 * accumulates every previous revision (oldest first).
 */
export const createAntiEditUpsertHandler = (store, onEdit) => {
    return ({ messages } = {}) => {
        const edits = [];
        for (const message of messages ?? []) {
            if (!isEditMessage(message)) {
                continue;
            }
            const key = getEditedMessageKey(message);
            if (!key?.id || !key.remoteJid) {
                continue;
            }
            const after = getEditedContent(message);
            const stored = store.getMessage(key);
            const before = stored?.message?.message ?? null;
            const beforeText = stored ? extractMessageText(stored.message) : '';
            const afterText = extractMessageText({ message: after });
            const editedAt = Date.now();
            const editedBy = message.key?.participant || key.participant || message.key?.remoteJid;
            let editCount = 1;
            let history = [];
            if (stored) {
                stored.editHistory = stored.editHistory ?? [];
                if (before) {
                    stored.editHistory.push({ message: before, replacedAt: editedAt });
                }
                history = stored.editHistory.map((h) => h.message);
                editCount = stored.editHistory.length;
                // swap the stored content for the new revision so the NEXT edit
                // reports this one as its "before"
                stored.message = { ...stored.message, message: after };
                stored.editedAt = editedAt;
            }
            const info = { key, editedBy, editedAt, before, after, beforeText, afterText, editCount, history };
            edits.push(info);
            onEdit?.(info);
        }
        return edits;
    };
};

export default {
    isEditMessage,
    getEditedMessageKey,
    getEditedContent,
    createAntiEditUpsertHandler
};
