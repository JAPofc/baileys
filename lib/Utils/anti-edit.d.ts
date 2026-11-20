import type { MessageStore } from './anti-delete.js';

/** Report for one observed edit. */
export interface EditInfo {
    /** key of the message that was edited */
    key: { remoteJid?: string; id?: string; participant?: string; fromMe?: boolean;[k: string]: any };
    /** who performed the edit (participant in groups, chat jid in DMs) */
    editedBy?: string;
    editedAt: number;
    /** original content (null when the store never saw the message) */
    before: any | null;
    /** the new content the edit carries */
    after: any | null;
    beforeText: string;
    afterText: string;
    /** 1 for the first observed edit, 2 for the second, ... */
    editCount: number;
    /** every previous revision, oldest first */
    history: any[];
}

/** True when `message` is an edit notification (protocolMessage MESSAGE_EDIT with new content). */
export function isEditMessage(message: any): boolean;
/** Key of the message that was edited (remoteJid falls back to the envelope's chat). */
export function getEditedMessageKey(message: any): EditInfo['key'] | null;
/** The NEW content carried by the edit (unwraps the optional extra `message` envelope). */
export function getEditedContent(message: any): any | null;
/**
 * messages.upsert handler that reports every incoming edit with its original
 * content (from the shared MessageStore) and keeps the store updated so
 * consecutive edits chain correctly. Register createMessageStoreHandler first.
 */
export function createAntiEditUpsertHandler(store: MessageStore, onEdit?: (info: EditInfo) => void): (upsert: { messages: any[] }) => EditInfo[];

declare const _default: {
    isEditMessage: typeof isEditMessage;
    getEditedMessageKey: typeof getEditedMessageKey;
    getEditedContent: typeof getEditedContent;
    createAntiEditUpsertHandler: typeof createAntiEditUpsertHandler;
};
export default _default;
