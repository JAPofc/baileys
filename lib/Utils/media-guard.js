/**
 * Media guard — moderate media types per chat: "no stickers in this group",
 * "images only in #media", auto-delete violations.
 *
 * ```js
 * import { createMediaGuard } from '@japofc/baileys'
 *
 * const guard = createMediaGuard({
 *     blocked: ['sticker', 'video'],      // blocked everywhere…
 *     rules: { 'serious@g.us': ['image', 'sticker', 'video', 'audio'] }, // …or per chat
 *     autoDelete: true
 * })
 * guard.bind(sock)
 *
 * guard.onDetected(({ chat, sender, mediaType }) =>
 *     sock.sendMessage(chat, { text: `@${sender.split('@')[0]} no ${mediaType}s here!`, mentions: [sender] }))
 * ```
 *
 * Media types: image, video, audio, sticker, document, contact, location,
 * poll, viewOnce (wrappers are unwrapped one level first).
 */
import { isJidGroup } from '../WABinary/index.js';

const TYPE_OF = {
	imageMessage: 'image',
	videoMessage: 'video',
	audioMessage: 'audio',
	stickerMessage: 'sticker',
	documentMessage: 'document',
	documentWithCaptionMessage: 'document',
	contactMessage: 'contact',
	contactsArrayMessage: 'contact',
	locationMessage: 'location',
	liveLocationMessage: 'location',
	pollCreationMessage: 'poll',
	pollCreationMessageV2: 'poll',
	pollCreationMessageV3: 'poll',
	ptvMessage: 'video'
};

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];

/** Detect the media type of a message content, unwrapping one wrapper level. */
export const detectMediaType = (message) => {
	if (!message || typeof message !== 'object') {
		return null;
	}
	for (const [key, value] of Object.entries(message)) {
		if (TYPE_OF[key] && key !== 'documentWithCaptionMessage') {
			return TYPE_OF[key];
		}
		if (WRAPPERS.includes(key) && value?.message) {
			const inner = detectMediaType(value.message);
			if (inner) {
				return inner;
			}
			if (key === 'documentWithCaptionMessage') {
				return 'document';
			}
		}
	}
	return null;
};

export const createMediaGuard = (options = {}) => {
	const {
		blocked = [],
		rules = {},
		groupsOnly = true,
		exemptUsers = [],
		autoDelete = false,
		includeFromMe = false
	} = options;

	const globalBlocked = new Set(blocked);
	const chatRules = new Map(Object.entries(rules).map(([chat, types]) => [chat, new Set(types)]));
	const exempt = new Set(exemptUsers);
	const detectedCbs = new Set();
	const errorCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	const isBlocked = (chat, mediaType) => {
		const rule = chatRules.get(chat);
		if (rule) {
			return rule.has(mediaType);
		}
		return globalBlocked.has(mediaType);
	};

	/** Handler for `messages.upsert`. Pass the socket to enable auto-delete. */
	const handler = async ({ messages }, sock = boundSock) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message) {
				continue;
			}
			if (msg.key.fromMe && !includeFromMe) {
				continue;
			}
			if (groupsOnly && !isJidGroup(chat)) {
				continue;
			}
			const sender = msg.key.participant || chat;
			if (exempt.has(sender)) {
				continue;
			}
			const mediaType = detectMediaType(msg.message);
			if (!mediaType || !isBlocked(chat, mediaType)) {
				continue;
			}
			let deleted = false;
			if (autoDelete && sock) {
				try {
					await sock.sendMessage(chat, { delete: msg.key });
					deleted = true;
				} catch (error) {
					emit(errorCbs, { msg, error });
				}
			}
			emit(detectedCbs, { msg, key: msg.key, chat, sender, mediaType, deleted });
		}
	};

	return {
		handler,
		detectMediaType,
		bind(sock) {
			boundSock = sock;
			// return the (error-swallowed) promise so awaited emitters can wait
			boundHandler = (events) => handler(events, sock).catch(() => { });
			sock.ev.on('messages.upsert', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('messages.upsert', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		onDetected(cb) {
			detectedCbs.add(cb);
			return () => detectedCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		/** Replace the blocked types for one chat (or remove the rule with null). */
		setRule(chat, types) {
			if (types === null || types === undefined) {
				return chatRules.delete(chat);
			}
			chatRules.set(chat, new Set(types));
			return true;
		},
		getRule: (chat) => (chatRules.has(chat) ? [...chatRules.get(chat)] : null),
		block(type) {
			globalBlocked.add(type);
		},
		unblock(type) {
			return globalBlocked.delete(type);
		},
		addExempt(jid) {
			exempt.add(jid);
		},
		removeExempt(jid) {
			return exempt.delete(jid);
		}
	};
};
