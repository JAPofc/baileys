/**
 * View-once toolkit — detect, unwrap and capture view-once messages before
 * they disappear.
 *
 * ```js
 * import { isViewOnceMessage, unwrapViewOnce, createViewOnceCapture } from '@japofc/baileys'
 *
 * const vault = createViewOnceCapture()
 * vault.bind(sock) // listens on messages.upsert
 *
 * vault.onViewOnce(async ({ msg, unwrapped }) => {
 *     console.log('view-once', unwrapped.mediaType, 'from', msg.key.remoteJid)
 *     const buf = await downloadMediaMessage(msg, 'buffer', {}) // save it while you can
 * })
 *
 * vault.get(someKey) // captured view-once message for that key, if still stored
 * ```
 */

const VIEW_ONCE_WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const DEFAULT_MAX_MESSAGES = 200;

const MEDIA_FIELD_TO_TYPE = {
	imageMessage: 'image',
	videoMessage: 'video',
	audioMessage: 'audio'
};

/** True if the message is a view-once (wrapper form or `viewOnce` media flag). */
export const isViewOnceMessage = (msg) => {
	const content = msg?.message;
	if (!content) {
		return false;
	}
	// unwrap ephemeral first — view-once inside disappearing chats
	const c = content.ephemeralMessage?.message || content;
	for (const wrapper of VIEW_ONCE_WRAPPERS) {
		if (c[wrapper]?.message) {
			return true;
		}
	}
	for (const field of Object.keys(MEDIA_FIELD_TO_TYPE)) {
		if (c[field]?.viewOnce) {
			return true;
		}
	}
	return false;
};

/**
 * Unwrap a view-once message. Returns `{ message, type, mediaType, media }`
 * where `message` is the inner content, `type` the inner field name
 * (e.g. 'imageMessage') and `media` that inner media object — or `null`
 * if the message is not view-once.
 */
export const unwrapViewOnce = (msg) => {
	const content = msg?.message;
	if (!content) {
		return null;
	}
	const c = content.ephemeralMessage?.message || content;
	let inner = null;
	for (const wrapper of VIEW_ONCE_WRAPPERS) {
		if (c[wrapper]?.message) {
			inner = c[wrapper].message;
			break;
		}
	}
	if (!inner) {
		// flag form: media message carrying viewOnce: true directly
		for (const field of Object.keys(MEDIA_FIELD_TO_TYPE)) {
			if (c[field]?.viewOnce) {
				inner = c;
				break;
			}
		}
	}
	if (!inner) {
		return null;
	}
	for (const [field, mediaType] of Object.entries(MEDIA_FIELD_TO_TYPE)) {
		if (inner[field]) {
			return { message: inner, type: field, mediaType, media: inner[field] };
		}
	}
	const [type] = Object.keys(inner);
	return type ? { message: inner, type, mediaType: undefined, media: inner[type] } : null;
};

/**
 * Capture view-once messages from `messages.upsert` into an LRU store so they
 * can be recovered after being opened/removed on the phone.
 */
export const createViewOnceCapture = (options = {}) => {
	const { maxMessages = DEFAULT_MAX_MESSAGES } = options;
	const store = new Map();
	const cbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const keyStr = (key) => `${key.remoteJid}:${key.id}`;

	/** Handler for `messages.upsert`. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			if (!msg?.key?.id || !isViewOnceMessage(msg)) {
				continue;
			}
			const unwrapped = unwrapViewOnce(msg);
			const k = keyStr(msg.key);
			if (store.has(k)) {
				store.delete(k);
			}
			store.set(k, { msg, unwrapped, at: Date.now() });
			while (store.size > maxMessages) {
				const oldest = store.keys().next().value;
				store.delete(oldest);
			}
			for (const cb of cbs) {
				try {
					cb({ msg, unwrapped });
				} catch {
					// listener errors must not break the upsert pipeline
				}
			}
		}
	};

	return {
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = handler;
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
		onViewOnce(cb) {
			cbs.add(cb);
			return () => cbs.delete(cb);
		},
		/** Get a captured view-once entry by message key. */
		get(key) {
			return store.get(keyStr(key));
		},
		getAll: () => [...store.values()],
		get size() {
			return store.size;
		},
		clear() {
			store.clear();
		}
	};
};
