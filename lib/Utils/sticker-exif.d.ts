/** Sticker EXIF tools — pure-JS WebP metadata read/write (no native deps). */

export declare const isWebP: (buffer: Buffer) => boolean;

export interface WebPChunk {
	id: string;
	offset: number;
	size: number;
	payload: Buffer;
}

export declare const parseWebPChunks: (buffer: Buffer) => WebPChunk[];
export declare const getWebPDimensions: (buffer: Buffer) => { width: number; height: number };

export interface StickerExifMeta {
	/** Defaults to a random com.jap.sticker.* id. */
	packId?: string;
	packName?: string;
	author?: string;
	/** Defaults to ['🤖']. */
	emojis?: string[];
	[extra: string]: unknown;
}

/** Build the raw WhatsApp EXIF payload (TIFF header + JSON). */
export declare const buildStickerExif: (meta?: StickerExifMeta) => Buffer;

/** Parse sticker metadata from a WebP buffer, or null when absent. */
export declare const readStickerExif: (buffer: Buffer) => Record<string, unknown> | null;

/**
 * Return a new WebP buffer with the sticker metadata set (VP8X created when
 * missing, existing EXIF replaced). Works on static and animated WebP.
 */
export declare const setStickerExif: (buffer: Buffer, meta: StickerExifMeta | Buffer) => Buffer;
