/**
 * Flood guard — detect users spamming messages (N messages within a time
 * window, per chat) and react once per burst.
 *
 * ```js
 * import { createFloodGuard } from '@japofc/baileys'
 *
 * const flood = createFloodGuard({ maxMessages: 8, windowMs: 10_000 })
 * flood.bind(sock)
 *
 * flood.onFlood(({ chat, user, count }) =>
 *     sock.sendMessage(chat, { text: `@${user.split('@')[0]} slow down! (${count} msgs)`, mentions: [user] }))
 * ```
 *
 * `onFlood` fires once per burst (cooldown = one window) so your warning
 * doesn't itself become spam.
 */
import { isJidGroup } from '../WABinary/index.js';

const DEFAULT_MAX_TRACKED = 2000;

export const createFloodGuard = (options = {}) => {
	const {
		maxMessages = 10,
		windowMs = 10_000,
		groupsOnly = true,
		includeFromMe = false,
		/** JAP@Upgrade: auto-ignore a flooder for this long after an alert. */
		autoMuteMs = 0,
		maxTracked = DEFAULT_MAX_TRACKED
	} = options;

	/** `${chat}:${user}` -> { times: number[], mutedUntil } */
	const buckets = new Map();
	const floodCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (payload) => {
		for (const cb of floodCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	/** Handler for `messages.upsert`. */
	const handler = ({ messages }) => {
		const now = Date.now();
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
			const user = msg.key.participant || chat;
			const id = `${chat}:${user}`;
			let bucket = buckets.get(id);
			if (!bucket) {
				bucket = { times: [], mutedUntil: 0 };
			} else {
				buckets.delete(id); // LRU re-insert
			}
			buckets.set(id, bucket);
			while (buckets.size > maxTracked) {
				const oldest = buckets.keys().next().value;
				buckets.delete(oldest);
			}
			bucket.times.push(now);
			while (bucket.times.length && bucket.times[0] <= now - windowMs) {
				bucket.times.shift();
			}
			if (bucket.times.length >= maxMessages && now >= bucket.mutedUntil) {
				bucket.mutedUntil = now + Math.max(windowMs, autoMuteMs); // one alert per burst (+ mute)
				emit({ chat, user, count: bucket.times.length, windowMs, mutedUntil: autoMuteMs ? bucket.mutedUntil : undefined, msg });
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
		onFlood(cb) {
			floodCbs.add(cb);
			return () => floodCbs.delete(cb);
		},
		/** Current message count inside the window for a user in a chat. */
		getCount(chat, user) {
			const bucket = buckets.get(`${chat}:${user}`);
			if (!bucket) {
				return 0;
			}
			const cutoff = Date.now() - windowMs;
			return bucket.times.filter(t => t > cutoff).length;
		},
		reset(chat, user) {
			buckets.delete(`${chat}:${user}`);
		},
		/** JAP@Upgrade: is this user currently in the post-alert mute window? */
		isMuted(chat, user) {
			const bucket = buckets.get(`${chat}:${user}`);
			return !!bucket && Date.now() < bucket.mutedUntil;
		},
		/** Manually mute a user for `ms` (suppresses further alerts too). */
		muteFor(chat, user, ms) {
			const id = `${chat}:${user}`;
			let bucket = buckets.get(id);
			if (!bucket) {
				bucket = { times: [], mutedUntil: 0 };
				buckets.set(id, bucket);
			}
			bucket.mutedUntil = Date.now() + ms;
		},
		unmute(chat, user) {
			const bucket = buckets.get(`${chat}:${user}`);
			if (bucket) {
				bucket.mutedUntil = 0;
			}
		},
		/** JAP@Upgrade: users with the most messages inside the window now. */
		getTopFlooders(limit = 10) {
			const cutoff = Date.now() - windowMs;
			return [...buckets]
				.map(([id, bucket]) => {
					const [chat, user] = id.split(/:(.+)/).length > 1 ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, ''];
					return { chat, user, count: bucket.times.filter(t => t > cutoff).length };
				})
				.filter(e => e.count > 0)
				.sort((a, b) => b.count - a.count)
				.slice(0, limit);
		},
		clear() {
			buckets.clear();
		}
	};
};
