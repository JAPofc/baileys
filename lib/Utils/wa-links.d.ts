/** WhatsApp link helpers — build/parse wa.me, invite and channel URLs. */

export declare const extractUrls: (text: string) => string[];

/** Click-to-chat link from any human phone format; text is URL-encoded. */
export declare const buildWaMeLink: (phone: string, text?: string) => string;

export declare const buildGroupInviteUrl: (code: string) => string;
export declare const buildChannelUrl: (inviteCode: string) => string;

export type ParsedWaLink =
	| { type: 'chat'; phone: string; text?: string }
	| { type: 'group-invite'; code: string; url: string }
	| { type: 'channel'; code: string; url: string };

/** Parse any WhatsApp URL, or null when it isn't one. */
export declare const parseWaLink: (input: string) => ParsedWaLink | null;

/** True when the text contains at least one WhatsApp link. */
export declare const containsWaLink: (text: string) => boolean;
