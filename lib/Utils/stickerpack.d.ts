import type { ILogger } from './logger.js';
import type { WAMediaUpload } from '../Types/index.js';
import { proto } from '../../WAProto/index.js';
export declare const isWebPBuffer: (buffer: Buffer) => boolean;
export declare const isAnimatedWebP: (buffer: Buffer) => boolean;
/**
 * Build the media-cache key for a sticker pack, or `false` when it must not be cached.
 * Caching requires every sticker and the cover to be URL-based.
 */
export declare const stickerPackCacheKey: (pack: {
    cover?: any;
    stickers?: Array<{ data?: any; emojis?: string[] }>;
    name?: string;
    publisher?: string;
    description?: string;
    packId?: string | null;
}) => string | false;
/**
 * JAP@Add (§2.186/§2.187) — the single place that turns an image buffer into a sticker-shaped
 * WebP. Pass `allowAnimated: false` for a pack cover, which WhatsApp renders as a still.
 */
export declare const _toStickerWebP: (buffer: Buffer, lib: any, opts?: {
    allowAnimated?: boolean;
}) => Promise<{
    buffer: Buffer;
    isAnimated: boolean;
}>;
export declare const convertToWebP: (input: WAMediaUpload) => Promise<{
    buffer: Buffer;
    isAnimated: boolean;
}>;
export declare const generateStickerPackId: () => string;
export declare const buildStickerPackProto: (pack: {
    name: string;
    publisher: string;
    packId?: string;
    description?: string;
}) => {
    name: string;
    publisher: string;
    packId: string;
    description: string;
};
export declare const STICKER_PACK_MESSAGE_TYPE: 'sticker_pack';
export type JapStickerInput = {
    data: WAMediaUpload;
    emojis?: string[];
    accessibilityLabel?: string;
};
export type JapStickerPackInput = {
    cover: WAMediaUpload;
    stickers: JapStickerInput[];
    name?: string;
    publisher?: string;
    description?: string;
};
export type JapStickerPackOptions = {
    logger?: ILogger;
    upload: (filePath: string, opts: {
        fileEncSha256B64: string;
        mediaType: string;
        timeoutMs?: number;
    }) => Promise<{
        directPath: string;
    }>;
    options?: RequestInit;
    mediaUploadTimeoutMs?: number;
    mediaCache?: {
        get: (key: string) => Promise<Buffer | undefined>;
        set: (key: string, value: Buffer) => void;
    };
};
export declare const prepareStickerPackMessage: (message: JapStickerPackInput, options: JapStickerPackOptions) => Promise<any>;
