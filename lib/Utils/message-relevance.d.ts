import type { WAMessageStubType } from '../Types/index.js';

/** Stub types representing a missed call — real chat-list entries despite carrying no content. */
export declare const MISSED_CALL_STUB_TYPES: readonly WAMessageStubType[];

/** Whether the message is a missed-call notification. */
export declare function isMissedCallMessage(message: any): boolean;

/** Whether a stub's `messageStubParameters` name us (the "… added you" case). */
export declare function isStubAboutMe(message: any, meId?: string): boolean;

/** The chat-list classification of a message, in one call. */
export interface MessageRelevance {
    /** Belongs in the chat list: bumps `conversationTimestamp`, unarchives. */
    isReal: boolean;
    isStub: boolean;
    isMissedCall: boolean;
    /** A stub whose parameters name `meId`. */
    isAboutMe: boolean;
    incrementsUnread: boolean;
    contentType: string | undefined;
}

export declare function classifyMessage(message: any, meId?: string): MessageRelevance;
