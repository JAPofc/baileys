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
	let boundHandlers = [];
	/** jid -> in-flight groupMetadata() promise (§2.190) */
	const inFlight = new Map();
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
	// JAP@Fix (§2.189): reads did not move an entry, so eviction was insertion order (FIFO)
	// despite the "TTL-LRU" in the docs -- the group you send to constantly was thrown out
	// while a group touched once at startup stayed. Touch on every fresh read.
	const touch = (jid, entry) => {
		cache.delete(jid);
		cache.set(jid, entry);
	};

	const cachedGroupMetadata = async (jid) => {
		const entry = cache.get(jid);
		if (entry && now() - entry.at < ttlMs) {
			hits++;
			touch(jid, entry);
			return entry.metadata;
		}
		misses++;
		if (!boundSock?.groupMetadata) {
			return entry?.metadata ?? null; // stale-if-unbound beats nothing
		}
		// JAP@Fix (§2.190): a burst of sends to the same cold group issued one
		// groupMetadata() query each -- the exact case this cache exists to avoid, and a good
		// way to get rate-limited. Share one in-flight fetch per jid.
		const pending = inFlight.get(jid);
		if (pending) {
			return pending;
		}
		const sock = boundSock;
		const fetch = (async () => {
			try {
				const metadata = await sock.groupMetadata(jid);
				put(jid, metadata);
				return metadata;
			} catch {
				return cache.get(jid)?.metadata ?? entry?.metadata ?? null; // serve stale if any
			} finally {
				inFlight.delete(jid);
			}
		})();
		inFlight.set(jid, fetch);
		return fetch;
	};

	let bindGeneration = 0;
	const detach = () => {
		if (boundSock) {
			for (const [event, handler] of boundHandlers) {
				boundSock.ev.off?.(event, handler);
			}
		}
		bindGeneration++;
		boundHandlers = [];
		boundSock = null;
	};

	return {
		cachedGroupMetadata,
		/** Wire fetching + auto-invalidation (groups.update, participants). */
		bind(sock) {
			// JAP@Fix (§2.188): binding a second socket overwrote `boundSock` while leaving the
			// first socket's listeners attached, and unbind() then called .off() on the NEW
			// socket with the OLD handlers -- so after a reconnect the dead socket kept a live
			// reference to this cache forever. Detach whatever is bound first.
			detach();
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
			// `() => this.unbind()` threw when bind() was destructured off the object
			// (`const { bind } = createGroupMetadataCache()`), which is how the docstring
			// example reads. Close over the detach helper instead of `this` (§2.188).
			const generation = ++bindGeneration;
			return () => {
				if (generation === bindGeneration) {
					detach();
				}
			};
		},
		unbind: detach,
		/** Seed the cache manually (e.g. right after groupMetadata calls). */
		set: put,
		get: (jid) => {
			const entry = cache.get(jid);
			if (!entry || now() - entry.at >= ttlMs) {
				return null;
			}
			touch(jid, entry); // a read is a use (§2.189)
			return entry.metadata;
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
