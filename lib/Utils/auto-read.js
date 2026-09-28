/**
 * Auto-read — mark incoming messages as read (blue ticks) automatically,
 * with filters so you stay in control of what gets acknowledged.
 *
 * ```js
 * import { createAutoRead } from '@japofc/baileys'
 *
 * const reader = createAutoRead({
 *     groups: true,               // read group chats (default true)
 *     dms: true,                  // read direct chats (default true)
 *     statusBroadcast: false,     // view statuses too? (default false)
 *     denylist: ['boss@s.whatsapp.net'] // never auto-read these chats
 * })
 * reader.bind(sock) // listens on messages.upsert
 *
 * reader.onRead(keys => console.log('read', keys.length, 'messages'))
 * reader.pause(); reader.resume() // toggle at runtime
 * ```
 *
 * Only `type: 'notify'` upserts (real-time messages) are read — history sync
 * and offline replays are left untouched. Own messages are always skipped.
 */
import { isJidGroup, isJidStatusBroadcast } from '../WABinary/index.js';

export const createAutoRead = (options = {}) => {
	const {
		groups = true,
		dms = true,
		statusBroadcast = false,
		allowlist = [],
		denylist = [],
		notifyOnly = true
	} = options;

	const allowed = allowlist.length ? new Set(allowlist) : null;
	const denied = new Set(denylist);
	const readCbs = new Set();
	const errorCbs = new Set();
	let paused = false;
	let totalRead = 0;
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

	const wantsChat = (jid) => {
		if (!jid || denied.has(jid)) {
			return false;
		}
		if (allowed) {
			return allowed.has(jid);
		}
		if (isJidStatusBroadcast(jid)) {
			return statusBroadcast;
		}
		return isJidGroup(jid) ? groups : dms;
	};

	/** Handler for `messages.upsert`. Pass the socket (bind() does it for you). */
	const handler = async ({ messages, type }, sock = boundSock) => {
		if (paused || !sock) {
			return;
		}
		if (notifyOnly && type && type !== 'notify') {
			return;
		}
		const keys = [];
		for (const msg of messages || []) {
			const key = msg?.key;
			if (!key?.id || key.fromMe || !wantsChat(key.remoteJid)) {
				continue;
			}
			keys.push(key);
		}
		if (!keys.length) {
			return;
		}
		try {
			await sock.readMessages(keys);
			totalRead += keys.length;
			emit(readCbs, keys);
		} catch (error) {
			emit(errorCbs, { keys, error });
		}
	};

	return {
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = (upsert) => {
				handler(upsert, sock).catch(() => { });
			};
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
		onRead(cb) {
			readCbs.add(cb);
			return () => readCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		pause() {
			paused = true;
		},
		resume() {
			paused = false;
		},
		get isPaused() {
			return paused;
		},
		/** Total messages auto-read since creation. */
		get count() {
			return totalRead;
		}
	};
};
