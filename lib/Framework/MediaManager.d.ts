export interface StickerMetadata {
    packname?: string;
    author?: string;
}

/** Image/video → WebP sticker and audio → OGG Opus voice-note conversion. */
export class MediaManager {
    /** Generate a temp file path with a given extension. */
    static getTempFile(ext: string): string;
    /**
     * Convert image/video to a WebP sticker buffer.
     * packname/author EXIF needs the optional `node-webpmux` peer dep.
     */
    static convertToSticker(inputPathOrBuffer: string | Buffer, metadata?: StickerMetadata): Promise<Buffer>;
    /** Convert audio to OGG Opus voice-note format (mono, 16kHz, VOIP mode). */
    static convertToVoiceNote(inputPathOrBuffer: string | Buffer): Promise<Buffer>;
}
