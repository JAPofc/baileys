/**
 * Message serializer — turn a raw WAMessage into a flat, bot-friendly object
 * with `.reply()`, `.react()` and `.download()` attached.
 *
 * ```js
 * import { serializeMessage } from '@japofc/baileys'
 *
 * sock.ev.on('messages.upsert', async ({ messages }) => {
 *     const m = serializeMessage(sock, messages[0])
 *     if (!m || m.fromMe) return
 *
 *     console.log(m.sender, m.type, m.body)         // who, what kind, what text
 *     if (m.body === 'ping') await m.reply('pong')  // quotes the original
 *     if (m.body === 'nice') await m.react('👍')
 *     if (m.isMedia) const buf = await m.download() // media as Buffer
 *     if (m.quoted) console.log('replying to:', m.quoted.body)
 * })
 * ```
 */
import { normalizeMessageContent, getContentType, downloadMediaMessage } from './messages.js';
import { extractMessageText } from './message-search.js';
import { isViewOnceMessage, unwrapViewOnce } from './view-once.js';
import { isJidGroup, jidNormalizedUser } from '../WABinary/index.js';

const MEDIA_TYPES = new Set([
	'imageMessage',
	'videoMessage',
	'audioMessage',
	'documentMessage',
	'stickerMessage',
	'ptvMessage'
]);

const toContent = (content) => (typeof content === 'string' ? { text: content } : content);

/**
 * Serialize a WAMessage. Returns `null` for empty/stub-only messages.
 * `sock` may be `null` — the data fields still work, only reply/react/download
 * against the socket become unavailable.
 */
export const serializeMessage = (sock, msg) => {
	if (!msg?.key) {
		return null;
	}
	const raw = msg;
	const key = msg.key;
	const chat = key.remoteJid;
	const fromMe = !!key.fromMe;
	const isGroup = isJidGroup(chat);
	const me = sock?.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
	const sender = fromMe
		? me || key.participant || chat
		: isGroup
			? key.participant
			: chat;

	const message = normalizeMessageContent(msg.message);
	const type = message ? getContentType(message) : undefined;
	const body = msg.message ? extractMessageText(msg) : '';
	const content = type ? message[type] : undefined;
	const contextInfo = (content && typeof content === 'object' && content.contextInfo) || undefined;
	const mentions = contextInfo?.mentionedJid || [];
	const isViewOnce = isViewOnceMessage(msg);
	const viewOnce = isViewOnce ? unwrapViewOnce(msg) : null;
	const expiration = contextInfo?.expiration || undefined;

	let quoted = null;
	if (contextInfo?.quotedMessage) {
		const quotedSender = contextInfo.participant;
		const quotedKey = {
			remoteJid: chat,
			id: contextInfo.stanzaId,
			fromMe: !!(me && quotedSender && jidNormalizedUser(quotedSender) === me),
			...(isGroup ? { participant: quotedSender } : {})
		};
		const quotedNormalized = normalizeMessageContent(contextInfo.quotedMessage);
		const quotedType = quotedNormalized ? getContentType(quotedNormalized) : undefined;
		quoted = {
			key: quotedKey,
			sender: quotedSender,
			type: quotedType,
			message: quotedNormalized,
			body: extractMessageText({ message: contextInfo.quotedMessage }),
			isMedia: !!quotedType && MEDIA_TYPES.has(quotedType),
			/** Download the quoted message's media as a Buffer. */
			download: (downloadType = 'buffer', options = {}) =>
				downloadMediaMessage({ key: quotedKey, message: contextInfo.quotedMessage }, downloadType, options)
		};
	}

	return {
		raw,
		key,
		id: key.id,
		chat,
		sender,
		fromMe,
		isGroup,
		pushName: msg.pushName || undefined,
		timestamp: typeof msg.messageTimestamp === 'object'
			? Number(msg.messageTimestamp?.low ?? msg.messageTimestamp)
			: Number(msg.messageTimestamp) || undefined,
		type,
		body,
		message,
		mentions,
		isMedia: !!type && MEDIA_TYPES.has(type),
		// JAP@Upgrade: epoch-ms timestamp (Long + second units handled).
		timestampMs: (() => {
			let t = raw?.messageTimestamp;
			if (t && typeof t === 'object' && typeof t.toNumber === 'function') {
				t = t.toNumber();
			}
			t = Number(t);
			return Number.isFinite(t) && t > 0 ? (t < 10_000_000_000 ? t * 1000 : t) : null;
		})(),
		isViewOnce,
		/** Unwrapped view-once info ({ message, type, mediaType, media }) or null. */
		viewOnce,
		/** Disappearing-message timer (seconds) from contextInfo, if any. */
		expiration,
		quoted,
		// JAP@Upgrade: text of the replied-to message, or ''.
		quotedText: quoted ? (quoted.body || '') : '',
		/** Reply in the same chat, quoting this message. */
		reply(replyContent, options = {}) {
			if (!sock) {
				throw new Error('serializeMessage: no socket bound, cannot reply');
			}
			return sock.sendMessage(chat, toContent(replyContent), { quoted: raw, ...options });
		},
		/** Send in the same chat WITHOUT quoting. */
		send(sendContent, options = {}) {
			if (!sock) {
				throw new Error('serializeMessage: no socket bound, cannot send');
			}
			return sock.sendMessage(chat, toContent(sendContent), options);
		},
		/** React to this message ('' removes the reaction). */
		react(emoji) {
			if (!sock) {
				throw new Error('serializeMessage: no socket bound, cannot react');
			}
			return sock.sendMessage(chat, { react: { text: emoji, key } });
		},
		/** Download this message's media as a Buffer (or stream). */
		download(downloadType = 'buffer', options = {}) {
			return downloadMediaMessage(raw, downloadType, options);
		},
		/** Forward this message to another chat. */
		forward(jid, options = {}) {
			if (!sock) {
				throw new Error('serializeMessage: no socket bound, cannot forward');
			}
			return sock.sendMessage(jid, { forward: raw }, options);
		},
		/** Delete this message for everyone (own message, or others as group admin). */
		delete() {
			if (!sock) {
				throw new Error('serializeMessage: no socket bound, cannot delete');
			}
			return sock.sendMessage(chat, { delete: key });
		}
	};
};
