/** Media probe — pure-JS image format + dimension detection. */

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp';

/** Detect the image format from magic bytes, or null. */
export declare const getImageFormat: (buffer: Buffer) => ImageFormat | null;

/**
 * Format + dimensions, or null when the buffer is not a recognizable
 * image. Never throws on truncated/corrupt data.
 */
export declare const getImageDimensions: (
	buffer: Buffer
) => { format: ImageFormat; width: number; height: number } | null;
