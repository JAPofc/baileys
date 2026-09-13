import type { AnyMessageContent } from '../Types/index.js';
import type makeWASocket from '../Socket/index.js';
type WASocket = ReturnType<typeof makeWASocket>;
export declare const STATUS_BROADCAST_JID = "status@broadcast";
export declare const STATUS_BACKGROUNDS: {
    solid: Record<string, string>;
    gradient: Record<string, string[]>;
};
export declare const STATUS_FONTS: {
    readonly SANS_SERIF: 0;
    readonly SERIF: 1;
    readonly NORICAN: 2;
    readonly BRYNDAN: 3;
    readonly BEBASNEUE: 4;
    readonly OSWALD: 5;
    readonly DAMION: 6;
    readonly DANCING: 7;
    readonly COMFORTAA: 8;
    readonly EXOTWO: 9;
};
export type StatusFont = (typeof STATUS_FONTS)[keyof typeof STATUS_FONTS];
export declare const generateStatusMessageId: () => string;
export type TextStatusOptions = {
    text: string;
    backgroundColor?: string;
    font?: StatusFont;
    textColor?: string;
    mentions?: string[];
};
export type MediaStatusOptions = {
    caption?: string;
    gifPlayback?: boolean;
    waveform?: Uint8Array;
};
export declare const createTextStatus: (options: TextStatusOptions) => AnyMessageContent;
export declare const createImageStatus: (media: Buffer | string, options?: MediaStatusOptions) => AnyMessageContent;
export declare const createVideoStatus: (media: Buffer | string, options?: MediaStatusOptions) => AnyMessageContent;
export declare const createAudioStatus: (media: Buffer | string, options?: MediaStatusOptions) => AnyMessageContent;
export declare const getStatusJid: () => string;
/** Music metadata for a status music attribution (official Dec-2025 surface). */
export type StatusMusicAttribution = {
    title?: string;
    authorName?: string;
    /** Meta licensed-catalog song id — required for official clients to render the music chip. */
    songId?: string;
    artistAttribution?: string;
    isExplicit?: boolean;
    actionUrl?: string;
};
/**
 * Attach a MUSIC StatusAttribution (enum 3) to a status content object.
 * Wire-verified against WAProto ContextInfo.statusAttributions[].
 * Needs at least { title } or { songId }.
 */
export declare const withMusicAttribution: (content: AnyMessageContent, music: StatusMusicAttribution) => AnyMessageContent;
export declare const StatusHelper: {
    text: (text: string, backgroundColor?: string, font?: StatusFont) => AnyMessageContent;
    image: (buffer: Buffer, caption?: string) => AnyMessageContent;
    imageUrl: (url: string, caption?: string) => AnyMessageContent;
    video: (buffer: Buffer, caption?: string) => AnyMessageContent;
    videoUrl: (url: string, caption?: string) => AnyMessageContent;
    gif: (buffer: Buffer, caption?: string) => AnyMessageContent;
    voiceNote: (buffer: Buffer) => AnyMessageContent;
    send: (sock: WASocket, content: AnyMessageContent, jidList?: string[]) => Promise<any>;
};
export {};
