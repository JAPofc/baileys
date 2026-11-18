import type { BinaryNode } from '../WABinary/index.js';

export type DetectedMediaType =
    | 'image' | 'gif' | 'video' | 'ptt' | 'audio' | 'vcard' | 'document'
    | 'contact_array' | 'livelocation' | 'sticker' | 'list' | 'list_response'
    | 'buttons_response' | 'order' | 'product' | 'native_flow_response' | 'url' | '';

export type DetectedMessageType = 'reaction' | 'poll' | 'event' | 'media' | 'text';
export type DetectedButtonType = 'list' | 'buttons' | 'native_flow' | undefined;

export declare function getMediaType(message: any): DetectedMediaType;
export declare function getMessageType(message: any): DetectedMessageType;
export declare function getButtonType(message: any): DetectedButtonType;
/** Derive the binary node(s) that must accompany a button/interactive/list message. */
export declare function getButtonArgs(message: any): BinaryNode;
/** Build contextInfo for @mention or @all. */
export declare const buildMentionContextInfo: (message: any) => {
    contextInfo: Record<string, any>;
};
/** Extract embedded media from buttons/interactive message (top-level or header-nested). */
export declare const extractFromButtonsMessage: (msg: any) => {
    imageMessage?: any;
    videoMessage?: any;
    documentMessage?: any;
} | null;
/** Normalise media input: string → { url }, Buffer → as-is, others → as-is. */
export declare const normalizeMediaInput: (media: any) => any;
/** Wrap buttons/template/list/interactive in viewOnceMessageV2Extension for MD clients. */
export declare const patchMessageForMdIfRequired: (message: any) => any;

export interface AlbumMessageOptions {
    userJid: string;
    /** Socket surface used for relay + upload (`sock`). */
    suki: any;
}

/** Build and relay an album (multi-image/video) message. Returns the individual media WAMessages. */
export declare const prepareAlbumMessageContent: (jid: string, albums: any[], options: AlbumMessageOptions) => Promise<any[]>;

export interface MessageExtrasContext {
    query: (...args: any[]) => Promise<any>;
    newsletterWMexQuery?: (...args: any[]) => Promise<any>;
}

export interface MessageExtrasAddon {
    /** Fetch profile picture URL for any JID, including newsletters. */
    profilePictureUrl: (jid: string) => Promise<string | null>;
    /** Query the ephemeral (disappearing messages) timer for a group. 0 if not set. */
    getEphemeralGroup: (jid: string) => Promise<number | string>;
}

/** Addon factory for socket-level message extras (profilePictureUrl, getEphemeralGroup). */
export declare const makeMessageExtrasAddon: (ctx: MessageExtrasContext) => MessageExtrasAddon;
