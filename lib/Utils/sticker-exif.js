/**
 * Sticker EXIF tools — read & write WhatsApp sticker metadata (pack name,
 * author, emojis) on WebP buffers in pure JavaScript. No native module, no
 * optional dependency: the RIFF container is manipulated directly.
 *
 * ```js
 * import { setStickerExif, readStickerExif } from '@japofc/baileys'
 *
 * const branded = setStickerExif(webpBuffer, {
 *     packName: 'My Pack',
 *     author: 'me',
 *     emojis: ['🔥']
 * })
 * await sock.sendMessage(jid, { sticker: branded })
 *
 * readStickerExif(branded)
 * // { 'sticker-pack-id': '…', 'sticker-pack-name': 'My Pack', … }
 * ```
 *
 * Works on static (VP8/VP8L) and animated (VP8X+ANIM) WebP files: a VP8X
 * header is created when missing, the EXIF flag is set, and any existing
 * EXIF chunk is replaced.
 */
import { randomBytes } from 'crypto';

const RIFF = 0x52494646; // 'RIFF'
const WEBP = 0x57454250; // 'WEBP'
const VP8X_EXIF_FLAG = 0x08;
const VP8X_ALPHA_FLAG = 0x10;

const fourCC = (buffer, offset) => buffer.toString('latin1', offset, offset + 4);

/** True if the buffer looks like a WebP file. */
export const isWebP = (buffer) => Buffer.isBuffer(buffer) &&
	buffer.length >= 12 &&
	buffer.readUInt32BE(0) === RIFF &&
	buffer.readUInt32BE(8) === WEBP;

/** Parse the RIFF chunks of a WebP buffer: `[{ id, offset, size, payload }]`. */
export const parseWebPChunks = (buffer) => {
	if (!isWebP(buffer)) {
		throw new Error('Not a WebP buffer (missing RIFF/WEBP header)');
	}
	const chunks = [];
	let offset = 12;
	while (offset + 8 <= buffer.length) {
		const id = fourCC(buffer, offset);
		const size = buffer.readUInt32LE(offset + 4);
		const payload = buffer.subarray(offset + 8, Math.min(offset + 8 + size, buffer.length));
		chunks.push({ id, offset, size, payload });
		offset += 8 + size + (size % 2); // chunks are padded to even sizes
	}
	return chunks;
};

/** Canvas dimensions from VP8X/VP8L/VP8 data. */
export const getWebPDimensions = (buffer) => {
	for (const chunk of parseWebPChunks(buffer)) {
		if (chunk.id === 'VP8X' && chunk.payload.length >= 10) {
			return {
				width: chunk.payload.readUIntLE(4, 3) + 1,
				height: chunk.payload.readUIntLE(7, 3) + 1
			};
		}
		if (chunk.id === 'VP8L' && chunk.payload.length >= 5 && chunk.payload[0] === 0x2f) {
			const bits = chunk.payload.readUInt32LE(1);
			return {
				width: (bits & 0x3fff) + 1,
				height: ((bits >> 14) & 0x3fff) + 1
			};
		}
		if (chunk.id === 'VP8 ' && chunk.payload.length >= 10 &&
			chunk.payload[3] === 0x9d && chunk.payload[4] === 0x01 && chunk.payload[5] === 0x2a) {
			return {
				width: chunk.payload.readUInt16LE(6) & 0x3fff,
				height: chunk.payload.readUInt16LE(8) & 0x3fff
			};
		}
	}
	throw new Error('Could not determine WebP dimensions (no VP8X/VP8L/VP8 chunk)');
};

/**
 * Build the WhatsApp sticker EXIF payload (22-byte TIFF/IFD header + JSON).
 * Accepts `{ packId, packName, author, emojis, ...extra }`.
 */
export const buildStickerExif = (meta = {}) => {
	const {
		packId = `com.jap.sticker.${randomBytes(4).toString('hex')}`,
		packName = '',
		author = '',
		emojis = ['🤖'],
		...extra
	} = meta;
	const json = JSON.stringify({
		'sticker-pack-id': packId,
		'sticker-pack-name': packName,
		'sticker-pack-publisher': author,
		emojis,
		...extra
	});
	const jsonBytes = Buffer.from(json, 'utf8');
	const header = Buffer.from([
		0x49, 0x49, 0x2a, 0x00, // TIFF little-endian + magic
		0x08, 0x00, 0x00, 0x00, // offset to first IFD
		0x01, 0x00, // one IFD entry
		0x41, 0x57, 0x07, 0x00, // tag 0x5741 ('WA'), type 7 (undefined)
		0x00, 0x00, 0x00, 0x00, // payload length — filled below
		0x16, 0x00, 0x00, 0x00 // payload offset (22 = header size)
	]);
	header.writeUInt32LE(jsonBytes.length, 14);
	return Buffer.concat([header, jsonBytes]);
};

/**
 * Read WhatsApp sticker metadata from a WebP buffer. Returns the parsed JSON
 * object, or `null` when there is no (parseable) EXIF chunk.
 */
export const readStickerExif = (buffer) => {
	if (!isWebP(buffer)) {
		return null;
	}
	const exif = parseWebPChunks(buffer).find(c => c.id === 'EXIF');
	if (!exif) {
		return null;
	}
	try {
		const payload = exif.payload;
		if (payload.length > 22 && payload[0] === 0x49 && payload[1] === 0x49) {
			const length = payload.readUInt32LE(14);
			const offset = payload.readUInt32LE(18);
			if (offset + length <= payload.length) {
				return JSON.parse(payload.toString('utf8', offset, offset + length));
			}
		}
		const start = payload.indexOf(0x7b); // '{' fallback
		if (start !== -1) {
			return JSON.parse(payload.toString('utf8', start));
		}
	} catch {
		// corrupt EXIF — treat as absent
	}
	return null;
};

const buildChunk = (id, payload) => {
	const header = Buffer.alloc(8);
	header.write(id, 0, 'latin1');
	header.writeUInt32LE(payload.length, 4);
	const parts = [header, payload];
	if (payload.length % 2) {
		parts.push(Buffer.from([0])); // even padding
	}
	return Buffer.concat(parts);
};

/**
 * Set (or replace) the sticker EXIF metadata on a WebP buffer.
 * `meta` is `{ packId?, packName?, author?, emojis? }` or a prebuilt EXIF
 * payload Buffer. Returns a new WebP buffer; the input is not modified.
 */
export const setStickerExif = (buffer, meta) => {
	const exifPayload = Buffer.isBuffer(meta) ? meta : buildStickerExif(meta);
	const chunks = parseWebPChunks(buffer);
	if (!chunks.length) {
		throw new Error('WebP buffer has no chunks');
	}
	const pieces = [];
	let vp8x = chunks.find(c => c.id === 'VP8X');
	if (vp8x) {
		// copy VP8X with the EXIF flag set
		const payload = Buffer.from(vp8x.payload);
		payload[0] |= VP8X_EXIF_FLAG;
		pieces.push(buildChunk('VP8X', payload));
	} else {
		// synthesize a VP8X header from the image dimensions
		const { width, height } = getWebPDimensions(buffer);
		const payload = Buffer.alloc(10);
		let flags = VP8X_EXIF_FLAG;
		const vp8l = chunks.find(c => c.id === 'VP8L');
		if (chunks.some(c => c.id === 'ALPH') || (vp8l && vp8l.payload.length >= 5 && ((vp8l.payload.readUInt32LE(1) >> 28) & 1))) {
			flags |= VP8X_ALPHA_FLAG;
		}
		payload[0] = flags;
		payload.writeUIntLE(width - 1, 4, 3);
		payload.writeUIntLE(height - 1, 7, 3);
		pieces.push(buildChunk('VP8X', payload));
	}
	for (const chunk of chunks) {
		if (chunk.id === 'VP8X' || chunk.id === 'EXIF') {
			continue; // VP8X rebuilt above, old EXIF replaced below
		}
		pieces.push(buildChunk(chunk.id, chunk.payload));
	}
	pieces.push(buildChunk('EXIF', exifPayload));
	const body = Buffer.concat(pieces);
	const head = Buffer.alloc(12);
	head.write('RIFF', 0, 'latin1');
	head.writeUInt32LE(body.length + 4, 4); // + 'WEBP'
	head.write('WEBP', 8, 'latin1');
	return Buffer.concat([head, body]);
};
