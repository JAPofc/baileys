/** Message tools — quick answers about any WAMessage. */

/** 'text' | 'image' | … | 'reaction' | 'protocol' | 'unknown'. */
export declare const messageTypeOf: (msg: unknown) => string;
export declare const isMediaMessage: (msg: unknown) => boolean;
/** Quoted message info from contextInfo, or null. */
export declare const getQuotedInfo: (msg: unknown) => { participant?: string; stanzaId?: string; message: Record<string, unknown> } | null;
/** Timestamp as epoch ms (Long + second units handled), or null. */
export declare const getMessageTimestampMs: (msg: unknown) => number | null;
/** Forwarding info: { forwarded, score, frequentlyForwarded (score ≥ 5) }. */
export declare const getForwardInfo: (msg: unknown) => { forwarded: boolean; score: number; frequentlyForwarded: boolean };
export declare const isForwarded: (msg: unknown) => boolean;

/** One-line human preview: '📷 image: caption…'. */
export declare const summarizeMessage: (msg: unknown, options?: { maxLength?: number }) => string;
