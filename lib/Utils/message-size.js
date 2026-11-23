import { proto } from '../../WAProto/index.js'
import { generateWAMessageContent } from './messages.js'

/**
 * JAP@Add (§2.221): how big is this message, actually?
 *
 * Nothing in this library — or in any fork of it that I could find — can answer that
 * before a send. The question matters in three real situations:
 *
 *   1. WhatsApp rejects oversized nodes. A long enough interactive payload, a list with
 *      hundreds of rows, a contact array of a few thousand vCards: they fail at the
 *      server, after upload, with an error that does not mention size.
 *   2. Bots on metered or mobile links want to know what a broadcast will cost before
 *      committing to it.
 *   3. "Why is this message slow?" is usually answered by a number nobody measured.
 *
 * The number here is not a guess. The content is built through the library's own
 * `generateWAMessageContent()` and encoded with the real protobuf encoder, so what you get
 * is the serialised byte length of the message node this library would actually send.
 *
 * What it deliberately does NOT include, because pretending otherwise would be worse than
 * being silent:
 *   - Signal/Noise encryption overhead, which depends on session state.
 *   - WebSocket framing.
 *   - Follow-up messages. An album is one small node announcing a count; the pictures
 *     themselves travel as separate messages, so a two-image album measures ~44 bytes and
 *     that is correct, not a bug.
 *   - The media file itself. Media travels out-of-band to WhatsApp's CDN; the message only
 *     carries a pointer. Media bytes are reported SEPARATELY as `mediaBytes` when the size
 *     is knowable locally (a Buffer), and as `undefined` when it is not (a URL or stream),
 *     because an unknown is not a zero.
 */

/** Conservative node-size ceiling; past this, WhatsApp starts rejecting payloads. */
export const MESSAGE_SIZE_WARN_BYTES = 64 * 1024
export const MESSAGE_SIZE_MAX_BYTES = 1024 * 1024

const bufferLength = value => {
	if (Buffer.isBuffer(value)) return value.length
	if (value instanceof Uint8Array) return value.byteLength
	return undefined
}

/**
 * Media bytes we can measure without touching the network. A `{ url }` or a stream is
 * reported as unknown rather than silently counted as nothing.
 */
const measureMedia = content => {
	let known = 0
	let hasUnknown = false
	for (const kind of ['image', 'video', 'audio', 'document', 'sticker', 'ptv']) {
		const media = content?.[kind]
		if (media === undefined || media === null) continue
		const direct = bufferLength(media) ?? bufferLength(media?.stream)
		if (direct === undefined) {
			hasUnknown = true
		} else {
			known += direct
		}
	}
	for (const item of Array.isArray(content?.album) ? content.album : []) {
		const nested = measureMedia(item)
		known += nested.mediaBytes ?? 0
		if (nested.mediaBytes === undefined) hasUnknown = true
	}
	return { mediaBytes: hasUnknown && known === 0 ? undefined : known, hasUnknownMedia: hasUnknown }
}

/**
 * Walk the encoded message and report the biggest single contributor, so a caller staring
 * at "412 KB" learns *which* field to cut.
 */
const heaviestField = messageContent => {
	let worst = { field: undefined, bytes: 0 }
	for (const [field, value] of Object.entries(messageContent || {})) {
		if (value === undefined || value === null) continue
		let bytes = 0
		try {
			bytes = proto.Message.encode(proto.Message.create({ [field]: value })).finish().length
		} catch {
			continue
		}
		if (bytes > worst.bytes) worst = { field, bytes }
	}
	return worst.field ? worst : undefined
}

/**
 * Measure what `sendMessage(jid, content)` would put on the wire.
 *
 * @param {object} content the same object you would pass to `sendMessage`
 * @param {object} [options]
 * @param {string} [options.userJid] your own jid; only affects a few content types
 * @returns {Promise<{
 *   bytes: number,
 *   mediaBytes: number|undefined,
 *   hasUnknownMedia: boolean,
 *   withinLimit: boolean,
 *   nearLimit: boolean,
 *   heaviest: { field: string, bytes: number }|undefined,
 *   excludes: string[]
 * }>}
 */
/**
 * A stand-in for the media upload. Measuring a message must never put bytes on the wire,
 * but the encoded node still has to contain pointer fields of a realistic length, because
 * those are what the recipient's node actually carries. The placeholder lengths below
 * match the shape WhatsApp returns (a ~110 character CDN url and a ~90 character direct
 * path), so the estimate is honest to within a few dozen bytes rather than missing the
 * entire media header.
 */
const STUB_MEDIA_URL = `https://mmg.whatsapp.net/v/t62.0-24/${'0'.repeat(74)}`
const STUB_DIRECT_PATH = `/v/t62.0-24/${'0'.repeat(78)}`
const stubUpload = async () => ({ mediaUrl: STUB_MEDIA_URL, directPath: STUB_DIRECT_PATH })

/** Media this function would have to fetch to describe. It refuses to; it reports instead. */
const hasRemoteMedia = content => {
	if (!content || typeof content !== 'object') return false
	for (const kind of ['image', 'video', 'audio', 'document', 'sticker', 'ptv', 'thumbnail']) {
		const media = content[kind]
		if (!media) continue
		if (Buffer.isBuffer(media) || media instanceof Uint8Array) continue
		if (typeof media === 'object' && (Buffer.isBuffer(media.stream) || media.stream instanceof Uint8Array)) continue
		return true
	}
	return (Array.isArray(content.album) ? content.album : []).some(hasRemoteMedia)
}

/**
 * Measure what `sendMessage(jid, content)` would put on the wire.
 *
 * Never performs network I/O: remote media (`{ url }`, a stream) is reported as
 * unmeasurable rather than fetched.
 *
 * @param {object} content the same object you would pass to `sendMessage`
 * @param {object} [options]
 * @param {string} [options.userJid] your own jid; only affects a few content types
 * @returns {Promise<import('./message-size.js').MessageSizeEstimate>}
 */
export const estimateMessageSize = async (content, options = {}) => {
	const userJid = typeof options.userJid === 'string' ? options.userJid : '0@s.whatsapp.net'
	const { mediaBytes, hasUnknownMedia } = measureMedia(content)

	const unmeasurable = reason => ({
		bytes: undefined,
		mediaBytes,
		hasUnknownMedia,
		withinLimit: undefined,
		nearLimit: undefined,
		heaviest: undefined,
		unmeasurable: reason,
		excludes: EXCLUDES
	})

	if (!content || typeof content !== 'object' || Array.isArray(content)) {
		return unmeasurable(`message content must be an object, got ${content === null ? 'null' : typeof content}`)
	}

	if (hasRemoteMedia(content)) {
		// Downloading it to measure it would make a read-only helper perform I/O, and on a
		// metered link the measurement would cost more than the send.
		return unmeasurable('remote media (url or stream) cannot be measured without fetching it')
	}

	let messageContent
	try {
		messageContent = await generateWAMessageContent(content, { userJid, upload: stubUpload, ...options.generateOptions })
	} catch (err) {
		return unmeasurable(err instanceof Error ? err.message : String(err))
	}

	let bytes
	try {
		bytes = proto.Message.encode(proto.Message.create(messageContent)).finish().length
	} catch (err) {
		return unmeasurable(err instanceof Error ? err.message : String(err))
	}

	return {
		bytes,
		mediaBytes,
		hasUnknownMedia,
		withinLimit: bytes <= MESSAGE_SIZE_MAX_BYTES,
		nearLimit: bytes >= MESSAGE_SIZE_WARN_BYTES,
		heaviest: heaviestField(messageContent),
		excludes: EXCLUDES
	}
}

const EXCLUDES = ['signal-encryption-overhead', 'websocket-framing', 'media-file-body']

/**
 * NOTE: this module intentionally does NOT export a byte formatter. `formatBytes()` from
 * `text-extras.js` already exists, and it renders `undefined` as `'0 B'` — which is the
 * exact confusion this module is built to avoid, since an unmeasurable media size is not a
 * size of zero. Check `mediaBytes === undefined` (or `hasUnknownMedia`) before formatting.
 */
