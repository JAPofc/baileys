/**
 * Status watcher — the receive side of stories: get a callback for every
 * status your contacts post, with media type and a download hook.
 *
 * ```js
 * import { createStatusWatcher } from '@japofc/baileys'
 *
 * const statuses = createStatusWatcher({ contacts: [bestie] }) // omit = everyone
 * statuses.bind(sock)
 *
 * statuses.onStatus(async ({ sender, mediaType, msg, download }) => {
 *     console.log(sender, 'posted a', mediaType, 'status')
 *     if (mediaType === 'image') {
 *         const buffer = await download()          // save the story
 *     }
 * })
 * statuses.getSeen(sender)   // how many statuses we've seen from them
 * ```
 */
import { downloadMediaMessage } from './messages.js';
import { detectMediaType } from './media-guard.js';

export const createStatusWatcher = (options = {}) => {
	const { contacts, includeText = true } = options;

	const watched = contacts ? new Set(contacts) : null;
	const statusCbs = new Set();
	/** sender -> count */
	const seen = new Map();
	let boundSock = null;
	let boundHandler = null;

	const emit = (payload) => {
		for (const cb of statusCbs) {
			try {
				const result = cb(payload);
				if (result && typeof result.catch === 'function') {
					result.catch(() => { });
				}
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	/** Handler for `messages.upsert`. */
	const handler = ({ messages }) => {
		for (const msg of messages || []) {
			if (msg?.key?.remoteJid !== 'status@broadcast' || !msg.message || msg.key.fromMe) {
				continue;
			}
			const sender = msg.key.participant;
			if (!sender) {
				continue;
			}
			if (watched && !watched.has(sender)) {
				continue;
			}
			const mediaType = detectMediaType(msg.message) || 'text';
			if (mediaType === 'text' && !includeText) {
				continue;
			}
			seen.set(sender, (seen.get(sender) || 0) + 1);
			emit({
				sender,
				mediaType,
				msg,
				key: msg.key,
				/** Download the status media as a Buffer. */
				download: (type = 'buffer', downloadOptions = {}) => downloadMediaMessage(msg, type, downloadOptions)
			});
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
		onStatus(cb) {
			statusCbs.add(cb);
			return () => statusCbs.delete(cb);
		},
		watch(jid) {
			if (watched) {
				watched.add(jid);
			}
		},
		unwatch(jid) {
			return watched ? watched.delete(jid) : false;
		},
		getSeen: (sender) => seen.get(sender) || 0,
		get totalSeen() {
			let total = 0;
			for (const n of seen.values()) {
				total += n;
			}
			return total;
		}
	};
};
