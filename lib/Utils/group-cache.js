/**
 * Group metadata cache — the missing piece for fast group sends:
 * `sendMessage` to groups re-fetches metadata unless you provide
 * `cachedGroupMetadata` in the socket config. This builds that function
 * with a TTL-LRU AND keeps it fresh by listening to group events.
 *
 * ```js
 * import { createGroupMetadataCache } from '@japofc/baileys'
 *
 * const groupCache = createGroupMetadataCache({ ttlMs: 5 * 60_000 })
 * const sock = makeWASocket({ auth: state, cachedGroupMetadata: groupCache.cachedGroupMetadata })
 * groupCache.bind(sock)   // fetches through sock + invalidates on updates
 *
 * groupCache.stats        // { hits, misses, invalidations, size }
 * groupCache.invalidate(groupJid)
 * ```
 */

export const createGroupMetadataCache = (options = {}) => {
	const {
		ttlMs = 5 * 60_000,
		maxSize = 500,
		now = () => Date.now()
	} = options;

	/** jid -> { metadata, at } */
	const cache = new Map();
	let boundSock = null;
	const boundHandlers = [];
	let hits = 0;
	let misses = 0;
	let invalidations = 0;

	const put = (jid, metadata) => {
		if (cache.has(jid)) {
			cache.delete(jid);
		}
		cache.set(jid, { metadata, at: now() });
		while (cache.size > maxSize) {
			cache.delete(cache.keys().next().value);
		}
	};

	const invalidate = (jid) => {
		if (cache.delete(jid)) {
			invalidations++;
			return true;
		}
		return false;
	};

	/**
	 * The function you pass as `cachedGroupMetadata` in the socket config.
	 * Returns cached metadata when fresh; fetches through the bound socket
	 * otherwise (null when nothing is bound yet and the cache is cold).
	 */
	const cachedGroupMetadata = async (jid) => {
		const entry = cache.get(jid);
		if (entry && now() - entry.at < ttlMs) {
			hits++;
			return entry.metadata;
		}
		misses++;
		if (!boundSock?.groupMetadata) {
			return entry?.metadata ?? null; // stale-if-unbound beats nothing
		}
		try {
			const metadata = await boundSock.groupMetadata(jid);
			put(jid, metadata);
			return metadata;
		} catch {
			return entry?.metadata ?? null; // fetch failed — serve stale if any
		}
	};

	return {
		cachedGroupMetadata,
		/** Wire fetching + auto-invalidation (groups.update, participants). */
		bind(sock) {
			boundSock = sock;
			const onGroupsUpdate = (updates) => {
				for (const update of updates || []) {
					if (update?.id) {
						invalidate(update.id);
					}
				}
			};
			const onParticipants = (update) => {
				if (update?.id) {
					invalidate(update.id);
				}
			};
			sock.ev.on('groups.update', onGroupsUpdate);
			sock.ev.on('group-participants.update', onParticipants);
			boundHandlers.push(['groups.update', onGroupsUpdate], ['group-participants.update', onParticipants]);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock) {
				for (const [event, handler] of boundHandlers) {
					boundSock.ev.off(event, handler);
				}
			}
			boundHandlers.length = 0;
			boundSock = null;
		},
		/** Seed the cache manually (e.g. right after groupMetadata calls). */
		set: put,
		get: (jid) => {
			const entry = cache.get(jid);
			return entry && now() - entry.at < ttlMs ? entry.metadata : null;
		},
		invalidate,
		clear() {
			cache.clear();
		},
		get stats() {
			return { hits, misses, invalidations, size: cache.size };
		}
	};
};
