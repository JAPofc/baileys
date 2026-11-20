/**
 * Aggregates all poll updates in a poll.
 * @param msg the poll creation message
 * @param meId your jid
 * @returns A list of options & their voters
 */
export function getAggregateVotesInPollMessage({ message, pollUpdates }: {
    message: any;
    pollUpdates: any;
}, meId: any): any[];
/**
 * Aggregates all event responses in an event message.
 * @param msg the event creation message
 * @param meId your jid
 * @returns A list of response types & their responders
 */
export function getAggregateResponsesInEventMessage({ eventResponses }: {
    eventResponses: any;
}, meId: any): any[];
export function extractUrlFromText(text: any): any;
export function generateLinkPreviewIfRequired(text: any, getUrlInfo: any, logger: any): Promise<any>;
export function prepareWAMessageMedia(message: any, options: any): Promise<any>;
export function prepareDisappearingMessageSettingContent(ephemeralExpiration: any): any;
export function generateForwardMessageContent(message: any, forceForward: any): any;
export function hasNonNullishProperty(message: any, key: any): boolean;
export function hasOptionalProperty(obj: any, key: any): boolean;
export function hasValidAlbumMedia(message: any): boolean;
export function hasValidInteractiveHeader(message: any): boolean;
export function hasValidCarouselHeader(message: any): boolean;
export function assessCarouselCard(card: any, isValidHeader: boolean): { ok: boolean; reason: 'invalid-media' | 'empty-card' | null };
export function generateWAMessageContent(message: any, options: any): Promise<any>;
export function generateWAMessageFromContent(jid: any, message: any, options: any): any;
export function generateWAMessage(jid: any, content: any, options: any): Promise<any>;
export function getContentType(content: any): string | undefined;
export function normalizeMessageContent(content: any): any;
export function extractMessageContent(content: any): any;
export function getDevice(id: any): "web" | "unknown" | "android" | "ios" | "desktop";
export function updateMessageWithReceipt(msg: any, receipt: any): void;
export function updateMessageWithReaction(msg: any, reaction: any): void;
export function updateMessageWithPollUpdate(msg: any, update: any): void;
export function updateMessageWithEventResponse(msg: any, update: any): void;
/** Largest receipt list this build will put in one stanza. */
export declare const RECEIPT_BATCH_MAX: number;
/** Hard ceiling on FutureProofMessage wrapper nesting when normalising. */
export declare const NORMALIZE_MAX_DEPTH: number;
/**
 * Group keys per chat/participant for a receipt: keys without a usable id are skipped, ids
 * are de-duplicated, and the result is split into batches of at most `batchSize`.
 */
export function aggregateMessageKeysNotFromMe(keys: any[], opts?: { batchSize?: number }): {
    jid: string; participant?: string; messageIds: string[];
}[];
export function downloadMediaMessage(message: any, type: any, options: any, ctx: any): Promise<any>;
/** Byte range for downloadMediaRange(): `start` inclusive, `end` exclusive (or give `length`). */
export type MediaRange = { start?: number; end?: number; length?: number };
/** Download only part of a media message (resume, slice, or header peek). Returns plaintext bytes. */
export function downloadMediaRange(message: any, range?: MediaRange, options?: any, ctx?: any): Promise<Buffer>;
/** Download just the first `bytes` of a media message — enough to sniff the real file type. */
export function downloadMediaHeader(message: any, bytes?: number, options?: any, ctx?: any): Promise<Buffer>;
export function assertMediaContent(content: any): any;
export function shouldIncludeBizBinaryNode(message: any): boolean;
