import type { proto } from '../../WAProto/index.js';

export declare const MUSIC_ALLOWED_HOSTS: string[];
export declare const STICKER_TYPES: {
    readonly LINK: 'link'; readonly LOCATION: 'location'; readonly MUSIC: 'music';
    readonly CHANNEL: 'channel'; readonly MESSAGE: 'message';
};
export declare const MESSAGE_ASSOCIATION_TYPES: Record<string, number>;

export interface StickerPosition { x: number; y: number; scale?: number; rotation?: number }
export declare function linkSticker(url: string, opts?: { label?: string; position?: StickerPosition }): Record<string, any>;
export declare function locationSticker(opts: {
    latitude: number; longitude: number; name?: string; address?: string; position?: StickerPosition;
}): Record<string, any>;
export declare function musicSticker(opts: {
    title: string; artist?: string; url?: string; artworkUrl?: string; startMs?: number; position?: StickerPosition;
}): Record<string, any>;
export declare function channelSticker(newsletterJid: string, opts?: { name?: string; position?: StickerPosition }): Record<string, any>;
export declare function messageSticker(key: proto.IMessageKey, opts?: { preview?: string; position?: StickerPosition }): Record<string, any>;
/** Validate + clamp + de-duplicate a sticker list. */
export declare function normalizeStickers(stickers: Record<string, any> | Record<string, any>[]): Record<string, any>[];
/** Read the stickers/annotations off a received message. */
export declare function readStickers(message: any): Record<string, any>[];

export declare function buildMusicMessage(opts: {
    title: string; artist?: string; songUri?: string; artworkUri?: string; durationMs?: number; previewUri?: string; countryBlocklist?: string[];
}): { music: Record<string, any> };
export declare function readMusicMessage(message: any): {
    title: string | null; artist: string | null; songUri: string | null; artworkUri: string | null; durationMs: number | null; host: string | null;
} | null;
export declare function buildSocialPreview(opts: {
    url: string; title?: string; description?: string; thumbnail?: any; author?: string; platform?: string; publishedAt?: Date | number;
}): { socialPreview: Record<string, any> };
export declare function readSocialPreview(message: any): Record<string, any> | null;

export declare function makeCommentMessage(targetKey: proto.IMessageKey, text: string): proto.IMessage;
export declare function commentSection(comments: (string | { text: string; author?: string; timestamp?: number })[], opts?: {
    title?: string; total?: number;
}): { comments: Record<string, any> };
export declare function makeEventInviteMessage(opts: {
    eventId?: string; eventTitle: string; startTime?: Date | number; endTime?: Date | number;
    caption?: string; callLink?: string; jpegThumbnail?: Uint8Array | Buffer; isCanceled?: boolean;
}): proto.IMessage;
export declare function calendarEvent(title: string, opts?: {
    start?: Date | number; end?: Date | number; location?: string; description?: string; allDay?: boolean;
}): { calendarEvent: Record<string, any> };
export declare function makeMessageAssociation(parentKey: proto.IMessageKey, opts?: {
    type?: number; messageIndex?: number;
}): { messageContextInfo: { messageAssociation: Record<string, any> } };

export declare function placeItem(opts: {
    name: string; latitude: number; longitude: number; address?: string; rating?: number; url?: string; distanceMeters?: number;
}): Record<string, any>;
export declare function mapSection(places: Record<string, any> | Record<string, any>[], opts?: {
    title?: string; center?: { latitude: number; longitude: number }; zoom?: number;
}): { map: Record<string, any> };
export declare function sportsSection(opts: {
    league?: string;
    home: string | { name: string; score?: number; logo?: any };
    away: string | { name: string; score?: number; logo?: any };
    status?: 'scheduled' | 'live' | 'finished' | 'postponed';
    startTime?: Date | number; venue?: string;
}): { sports: Record<string, any> };
export declare function reminderSection(text: string, when: Date | number, opts?: {
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; id?: string;
}): { reminder: Record<string, any> };
export declare function taskSection(tasks: (string | { title?: string; text?: string; status?: string; detail?: string })[], opts?: {
    title?: string;
}): { tasks: { title: string; items: Record<string, any>[]; done: number; total: number; complete: boolean } };
export declare function transparencySection(opts: {
    sources?: (string | { url: string; title?: string; quote?: string })[]; model?: string; disclaimer?: string; generatedAt?: number;
}): { transparency: Record<string, any> };
