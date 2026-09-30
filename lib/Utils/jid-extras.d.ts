/** JID extras — phone/jid conversions. */

/** Any human phone format → user jid. Throws on local-format numbers. */
export declare const phoneToJid: (phone: string) => string;
/** User jid → bare digits (device stripped), or null. */
export declare const jidToPhone: (jid: string) => string | null;
/** Same account? Ignores :device suffixes. */
export declare const sameUser: (a: string, b: string) => boolean;
/** Device index (0 = primary), or null when absent. */
export declare const deviceOf: (jid: string) => number | null;
/** '+62 812-3456-7890' pretty print, or null when not a phone. */
export declare const prettyPhone: (input: string, options?: { style?: 'intl' | 'plain' }) => string | null;
export declare const jidType: (jid?: string) => 'user' | 'group' | 'broadcast' | 'status' | 'newsletter' | 'lid' | 'bot' | 'unknown';
/** True when the jid addresses a real account you can DM (user or lid). */
export declare const isJidUser: (jid?: string) => boolean;
/** Server part of a jid, or null. */
export declare const serverOf: (jid?: string) => string | null;
/** Set/replace the :device suffix (0/null strips it). Non-mutating. */
export declare const withDevice: (jid: string, device?: number | null) => string;
/** Device-agnostic "is this me?" check. */
export declare const isMe: (jid?: string, meId?: string) => boolean;
/** Normalize a recipients input (jid/phone/array/delimited string) into a de-duplicated jid list. */
export declare const toJidList: (input: string | number | Array<string | number>) => string[];
/** WhatsApp mention token for a jid ('@62812…'), or '' for non-user jids. */
export declare const mentionText: (jid?: string) => string;
