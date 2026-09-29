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
