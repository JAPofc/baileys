/**
 * Message tools — quick answers about any WAMessage.
 *
 * ```js
 * import { messageTypeOf, isMediaMessage, getQuotedInfo,
 *          getMessageTimestampMs, summarizeMessage } from '@japofc/baileys'
 *
 * messageTypeOf(msg)          // 'text' | 'image' | 'video' | … | 'unknown'
 * isMediaMessage(msg)         // true for image/video/audio/sticker/document
 * getQuotedInfo(msg)          // { participant, stanzaId, message } | null
 * getMessageTimestampMs(msg)  // epoch ms (handles Long + seconds)
 * summarizeMessage(msg)       // '📷 Photo: caption text…' — one-line preview
 * ```
 */
import { detectMediaType } from './media-guard.js';
import { extractMessageText } from './message-search.js';

/** Friendly type of a message: text/image/video/…/reaction/unknown. */
export const messageTypeOf = (msg) => {
	const message = msg?.message || msg;
	if (!message || typeof message !== 'object') {
		return 'unknown';
	}
	if (message.conversation || message.extendedTextMessage) {
		return 'text';
	}
	if (message.reactionMessage) {
		return 'reaction';
	}
	if (message.protocolMessage) {
		return 'protocol';
	}
	const media = detectMediaType(message);
	if (media) {
		return media;
	}
	const keys = Object.keys(message).filter(k => k !== 'messageContextInfo');
	return keys.length ? keys[0].replace(/Message(V\d+)?$/, '') : 'unknown';
};

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sticker', 'document']);

export const isMediaMessage = (msg) => MEDIA_TYPES.has(messageTypeOf(msg));

/** The quoted message (from any content's contextInfo), or null. */
export const getQuotedInfo = (msg) => {
	const message = msg?.message || msg;
	for (const value of Object.values(message || {})) {
		const ctx = value?.contextInfo;
		if (ctx?.quotedMessage) {
			return {
				participant: ctx.participant,
				stanzaId: ctx.stanzaId,
				message: ctx.quotedMessage
			};
		}
	}
	return null;
};

/** Message timestamp as epoch ms — handles Long objects and second units. */
export const getMessageTimestampMs = (msg) => {
	let t = msg?.messageTimestamp;
	if (t && typeof t === 'object' && typeof t.toNumber === 'function') {
		t = t.toNumber();
	}
	t = Number(t);
	if (!Number.isFinite(t) || t <= 0) {
		return null;
	}
	return t < 10_000_000_000 ? t * 1000 : t; // seconds vs ms
};

const TYPE_ICONS = {
	text: '💬', image: '📷', video: '🎥', audio: '🎵', sticker: '🩹',
	document: '📄', contact: '👤', location: '📍', poll: '📊', reaction: '❤️'
};

/** One-line human preview: '📷 image: caption…'. */
export const summarizeMessage = (msg, { maxLength = 80 } = {}) => {
	const type = messageTypeOf(msg);
	const icon = TYPE_ICONS[type] || '📦';
	let text = '';
	try {
		text = extractMessageText(msg) || '';
	} catch {
		// non-text content
	}
	const clean = text.replace(/\s+/g, ' ').trim();
	const body = clean
		? clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean
		: '';
	return body ? `${icon} ${type}: ${body}` : `${icon} ${type}`;
};
