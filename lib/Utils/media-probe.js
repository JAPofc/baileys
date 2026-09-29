/**
 * Media probe — identify image buffers and read their dimensions in pure
 * JS (PNG, JPEG, GIF, WebP, BMP): validate uploads before sending, size
 * thumbnails, reject fakes — without pulling in an image library.
 *
 * ```js
 * import { getImageFormat, getImageDimensions } from '@japofc/baileys'
 *
 * getImageFormat(buffer)          // 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | null
 * getImageDimensions(buffer)      // { format: 'png', width: 512, height: 512 }
 * ```
 */
import { getWebPDimensions, isWebP } from './sticker-exif.js';

/** Detect the image format from magic bytes, or null. */
export const getImageFormat = (buffer) => {
	if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
		return null;
	}
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return 'png';
	}
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'jpeg';
	}
	if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
		return 'gif';
	}
	if (isWebP(buffer)) {
		return 'webp';
	}
	if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
		return 'bmp';
	}
	return null;
};

const pngDimensions = (buffer) => {
	// IHDR is always the first chunk: width/height at offsets 16/20 (BE)
	if (buffer.length < 24) {
		return null;
	}
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const gifDimensions = (buffer) => ({
	width: buffer.readUInt16LE(6),
	height: buffer.readUInt16LE(8)
});

const bmpDimensions = (buffer) => {
	if (buffer.length < 26) {
		return null;
	}
	return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
};

const jpegDimensions = (buffer) => {
	// walk the segment chain until a Start-Of-Frame marker
	let offset = 2;
	while (offset + 9 < buffer.length) {
		if (buffer[offset] !== 0xff) {
			offset++;
			continue;
		}
		const marker = buffer[offset + 1];
		// SOF0-SOF15 minus DHT(C4)/JPG(C8)/DAC(CC)
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return {
				height: buffer.readUInt16BE(offset + 5),
				width: buffer.readUInt16BE(offset + 7)
			};
		}
		if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
			offset += 2; // standalone marker
			continue;
		}
		const length = buffer.readUInt16BE(offset + 2);
		if (length < 2) {
			return null;
		}
		offset += 2 + length;
	}
	return null;
};

/**
 * Format + dimensions of an image buffer, or `null` when the buffer is not
 * a recognizable image. Never throws on truncated/corrupt data.
 */
export const getImageDimensions = (buffer) => {
	const format = getImageFormat(buffer);
	if (!format) {
		return null;
	}
	try {
		let dims = null;
		if (format === 'png') {
			dims = pngDimensions(buffer);
		} else if (format === 'jpeg') {
			dims = jpegDimensions(buffer);
		} else if (format === 'gif') {
			dims = gifDimensions(buffer);
		} else if (format === 'webp') {
			dims = getWebPDimensions(buffer);
		} else if (format === 'bmp') {
			dims = bmpDimensions(buffer);
		}
		return dims ? { format, ...dims } : null;
	} catch {
		return null;
	}
};
