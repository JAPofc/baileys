import type { proto } from '../../WAProto/index.js';

export declare const STATUS_AUDIENCE_TYPE: {
    readonly CONTACTS: 'contacts';
    readonly ALLOWLIST: 'allowlist';
    readonly DENYLIST: 'denylist';
};
export type StatusAudienceType = 'contacts' | 'allowlist' | 'denylist';
export declare const STATUS_AUDIENCE_DEFAULT_TYPE: StatusAudienceType;
export declare const STATUS_AUDIENCE_DEFAULT_LIMIT: number;
export declare const STATUS_AUDIENCE_DEFAULT_STICKER_TYPE: number;

export interface StatusAudienceOptions {
    /** Everyone who may see it (your contact list, typically). */
    contacts?: string | string[];
    /** Allowlist: only these JIDs. Mutually exclusive with `except`. */
    only?: string | string[];
    /** Denylist: everyone in `contacts` except these. */
    except?: string | string[];
    /** Hard cap on recipients (default 999). */
    limit?: number;
}
export interface StatusAudience {
    type: StatusAudienceType;
    statusJidList: string[];
    excluded: string[];
    truncated: number;
    limit: number;
}
/** Resolve who a status goes to, in the shape `sendMessage()` wants. */
export declare function makeStatusAudienceMetadata(opts?: StatusAudienceOptions): StatusAudience;
/** Reshare a status you were mentioned in (`statusMentionMessage`). */
export declare function makeStatusMentionMessage(status: any, opts?: {
    attributionType?: number;
    group?: boolean;
}): proto.IMessage;
/** Answer a question sticker on a status. */
export declare function makeStatusQuestionAnswerMessage(statusKey: proto.IMessageKey, text: string): proto.IMessage;
/** React to a sticker placed on a status. */
export declare function makeStatusStickerInteractionMessage(statusKey: proto.IMessageKey, stickerKey?: proto.IMessageKey, opts?: {
    type?: number;
}): proto.IMessage;

export declare const StatusFont: Record<string, number>;
export declare const StatusLinkType: { NONE: 0; PREVIEW: 1; STICKER: 2; CTA: 3 };
export declare const STATUS_NOTIFICATION_TYPES: Record<string, number>;
export declare const STATUS_QUOTED_TYPES: Record<string, number>;
/** A reply that quotes a status. */
export declare function makeStatusQuotedMessage(statusKey: proto.IMessageKey, opts?: {
    text?: string; thumbnail?: Uint8Array | Buffer; type?: number;
}): proto.IMessage;
/** Join an "Add yours" chain with your own status. */
export declare function makeStatusAddYoursAssociation<T extends Record<string, any>>(content: T, originalKey: proto.IMessageKey, opts?: {
    promptText?: string;
}): T & Record<string, any>;
/** The notification sent back to a status author when someone interacts. */
export declare function makeStatusNotificationMessage(originalKey: proto.IMessageKey, responseKey: proto.IMessageKey, opts?: {
    type?: number;
}): proto.IMessage;
/** Attribute a status to a group. */
export declare function makeGroupStatusAttribution<T extends Record<string, any>>(content: T, groupJid: string, opts?: {
    subject?: string; participant?: string;
}): T & Record<string, any>;
/** React to a group status. */
export declare function makeGroupStatusReactionMessage(statusKey: proto.IMessageKey, emoji: string, opts?: {
    groupJid?: string; senderTimestampMs?: number;
}): proto.IMessage;
