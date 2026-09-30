/**
 * media-mime — MIME ⇆ extension mapping and magic-byte sniffing.
 *
 * WhatsApp media often arrives without a trustworthy filename or content-type,
 * so detecting the real type from the bytes (and mapping between MIME and file
 * extension) is a constant chore. These helpers are pure and dependency-free.
 *
 * ```js
 * import { sniffMediaType, mimeToExtension, mediaKindFromMime } from '@japofc/baileys'
 * sniffMediaType(buffer)              // { mime: 'image/jpeg', ext: 'jpg', kind: 'image' }
 * mimeToExtension('audio/ogg')        // 'ogg'
 * mediaKindFromMime('video/mp4')      // 'video'
 * ```
 */

// canonical MIME → primary extension
const MIME_TO_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/bmp': 'bmp',
	'image/tiff': 'tiff',
	'image/heic': 'heic',
	'video/mp4': 'mp4',
	'video/3gpp': '3gp',
	'video/quicktime': 'mov',
	'video/webm': 'webm',
	'video/x-matroska': 'mkv',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/aac': 'aac',
	'audio/ogg': 'ogg',
	'audio/wav': 'wav',
	'audio/flac': 'flac',
	'audio/amr': 'amr',
	'application/pdf': 'pdf',
	'application/zip': 'zip',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'application/json': 'json'
};

// extension → MIME (built from the table above + a few extra aliases)
const EXT_TO_MIME = (() => {
	const m = {};
	for (const [mime, ext] of Object.entries(MIME_TO_EXT)) {
		if (!(ext in m)) m[ext] = mime;
	}
	Object.assign(m, {
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		htm: 'text/html',
		html: 'text/html',
		opus: 'audio/ogg',
		oga: 'audio/ogg',
		mpeg: 'video/mp4',
		mpg: 'video/mp4'
	});
	return m;
})();

/** Normalize a MIME string (lowercase, strip parameters like `; codecs=opus`). */
export const normalizeMime = (mime) => String(mime ?? '').split(';')[0].trim().toLowerCase();

/** MIME → primary file extension (no dot), or '' when unknown. */
export const mimeToExtension = (mime) => MIME_TO_EXT[normalizeMime(mime)] ?? '';

/** File extension (with or without a leading dot) → canonical MIME, or '' when unknown. */
export const extensionToMime = (ext) => {
	const e = String(ext ?? '').trim().toLowerCase().replace(/^\./, '');
	return EXT_TO_MIME[e] ?? '';
};

/**
 * Map a MIME to a WhatsApp media kind: 'image' | 'video' | 'audio' | 'sticker'
 * | 'document'. `image/webp` is reported as 'sticker' (WA stickers are webp) —
 * pass `{ webpAsImage: true }` to get 'image' instead.
 */
export const mediaKindFromMime = (mime, { webpAsImage = false } = {}) => {
	const m = normalizeMime(mime);
	if (!m) return 'document';
	if (m === 'image/webp') return webpAsImage ? 'image' : 'sticker';
	if (m.startsWith('image/')) return 'image';
	if (m.startsWith('video/')) return 'video';
	if (m.startsWith('audio/')) return 'audio';
	return 'document';
};

const asBytes = (input) => {
	if (Buffer.isBuffer(input) || input instanceof Uint8Array) return input;
	if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	return null;
};

const startsWith = (bytes, sig, offset = 0) => {
	for (let i = 0; i < sig.length; i++) {
		if (bytes[offset + i] !== sig[i]) return false;
	}
	return true;
};

const result = (mime) => ({ mime, ext: mimeToExtension(mime), kind: mediaKindFromMime(mime, { webpAsImage: true }) });

/**
 * Detect the media type from a buffer's magic bytes. Returns
 * `{ mime, ext, kind }` or `null` when unrecognized. Covers the image/audio/
 * video/document formats WhatsApp actually carries.
 */
export const sniffMediaType = (input) => {
	const b = asBytes(input);
	if (!b || b.length < 4) return null;

	// images
	if (startsWith(b, [0xff, 0xd8, 0xff])) return result('image/jpeg');
	if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return result('image/png');
	if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return result('image/gif');
	if (startsWith(b, [0x42, 0x4d])) return result('image/bmp');
	// RIFF containers: WEBP vs WAV share the RIFF header
	if (startsWith(b, [0x52, 0x49, 0x46, 0x46])) {
		if (startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return result('image/webp');
		if (startsWith(b, [0x57, 0x41, 0x56, 0x45], 8)) return result('audio/wav');
	}
	// documents / archives
	if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return result('application/pdf');
	if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return result('application/zip'); // also docx/xlsx/pptx containers
	// audio
	if (startsWith(b, [0x49, 0x44, 0x33]) || startsWith(b, [0xff, 0xfb]) || startsWith(b, [0xff, 0xf3]) || startsWith(b, [0xff, 0xf2])) return result('audio/mpeg');
	if (startsWith(b, [0x4f, 0x67, 0x67, 0x53])) return result('audio/ogg'); // OggS (vorbis/opus)
	if (startsWith(b, [0x66, 0x4c, 0x61, 0x43])) return result('audio/flac'); // fLaC
	// video / ISO-BMFF (mp4/m4a/mov/3gp) — 'ftyp' at offset 4
	if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) {
		const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
		if (brand.startsWith('3g')) return result('video/3gpp');
		if (brand.startsWith('qt')) return result('video/quicktime');
		if (brand.startsWith('m4a')) return result('audio/mp4');
		return result('video/mp4');
	}
	// matroska / webm (EBML header)
	if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return result('video/webm');

	return null;
};
