/**
 * JAP@Add --- Type declarations for JID helpers.
 */
export declare const getPhoneNumber: (sock: any, jid: string) => Promise<string | null>;
export declare const resolveSenderPn: (sock: any, webMessage: any) => Promise<string | null>;
export declare const getLidForPhone: (sock: any, phone: string) => Promise<string | null>;

export declare const META_AI_PN_JID: string;
/** `jidDecode` that returns null for junk. */
export declare function parseJid(jid: string): { user: string; server: string; device: number; domainType?: number } | null;
/** `jidEncode`, tolerant of a full jid as input. */
export declare function encodeJid(user: string, server?: string, device?: number): string;
/** Strip the device suffix and normalise `@c.us`; `''` for junk. */
export declare function normalizeJid(jid?: string): string;
export declare function isJidLid(jid?: string): boolean;
export declare function isJidMetaAi(jid?: string): boolean;
export declare function isJidUserLike(jid?: string): boolean;
/** Resolve a LID to the phone jid the session mapped it to (null when unknown). */
export declare function lidToJid(lid: string, sock: any): Promise<string | null>;
/** Resolve a phone jid to its LID (null when unknown). */
export declare function jidToLid(jid: string, sock: any): Promise<string | null>;
export declare function getSenderJid(msg: any): string;
export declare function getSenderLid(msg: any): string;
export declare function getSenderPn(msg: any): string;
export declare function getBotJid(msg: any): string;
/** Any readable text in a message, whatever shape it arrived in. */
export declare function getTextFromMessage(msg: any): string;
/** The structured answer to an interactive message, or null. */
export declare function getInteractiveResponse(msg: any): {
    type: 'button' | 'template' | 'list' | 'native_flow';
    id: string | null;
    text: string | null;
    index?: number | null;
    name?: string | null;
    params?: Record<string, any> | null;
} | null;
/** Which media kind a status carries. */
export declare function getStatusMediaType(msg: any): 'text' | 'image' | 'video' | 'audio' | null;
