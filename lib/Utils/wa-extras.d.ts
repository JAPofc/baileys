import type { proto } from '../../WAProto/index.js';

export declare const LOCATION_BROADCAST_JID: string;
export declare const MEMBER_LABEL_MAX_LENGTH: number;
export declare const VALID_JID_SERVERS: string[];
/** Is this the live-location broadcast chat? */
export declare function isJidLocationBroadcast(jid?: string): boolean;
/** Strict JID validation with a reason. */
export declare function validateJid(jid: any): { valid: boolean; reason: string | null };
/** Boolean shorthand over validateJid. */
export declare function isValidJid(jid: any): boolean;
/** Throw unless valid; returns the normalised JID. */
export declare function assertJid(jid: any, label?: string): string;
/** Throw unless this is a @lid; returns the normalised JID. */
export declare function assertLid(jid: any, label?: string): string;
/** Build a JID from digits, `+62…`, an existing JID, or `{ user, server }`. */
export declare function toJid(input: string | number | { user: string; server?: string; device?: number }, server?: string): string;
/** Which kind of chat a JID points at. */
export declare function jidKind(jid?: string): 'group' | 'newsletter' | 'location' | 'status' | 'broadcast' | 'lid' | 'user' | 'unknown';
/** Set (or clear, with `''`) your label inside a group. */
export declare function buildMemberLabelMessage(label: string, opts?: { timestamp?: number }): proto.IMessage;
/** Schedule a group call. */
export declare function makeScheduledCallCreationMessage(opts: {
    title: string; at: Date | number; callType?: 'voice' | 'video' | number;
}): proto.IMessage;
/** Cancel a scheduled call. */
export declare function makeScheduledCallEditMessage(key: proto.IMessageKey, opts?: { editType?: 'cancel' | number }): proto.IMessage;
/** Read a scheduled call out of a message. */
export declare function readScheduledCall(msg: any): { title: string | null; at: number | null; callType: string } | null;
/** One JPEG frame out of a video (needs ffmpeg). */
export declare function videoToJpeg(input: string | Buffer | Uint8Array, opts?: { at?: string; width?: number }): Promise<Buffer>;
/** Transcode audio into the Opus/OGG a voice note needs (needs ffmpeg). */
export declare function convertToOpusBuffer(input: string | Buffer | Uint8Array, opts?: {
    bitrate?: string; channels?: number; sampleRate?: number;
}): Promise<{ buffer: Buffer; mimetype: string; ptt: true }>;
