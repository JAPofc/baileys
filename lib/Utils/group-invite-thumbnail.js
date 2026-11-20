/**
 * group-invite-thumbnail.js --- JAP@Fix (§2.62 / v2.4.7)
 *
 * Fetching the group icon for a `groupInvite` message used to be an unguarded
 * `await options.getProfilePicUrl(jid, 'preview')` followed by an unguarded, un-timed
 * `fetch()`. `profilePictureUrl()` goes through `query()`, which runs
 * `assertNodeErrorFree()` -- a group with **no icon** answers `404 item-not-found`, so the
 * whole `sendMessage({ groupInvite })` call rejected over a decoration. The raw `fetch()`
 * had no timeout either, so a stalled CDN hung the send forever.
 *
 * This module makes the thumbnail strictly best-effort and finally answers the upstream
 * `//TODO: cache / use store!?` with a small TTL cache that also remembers "this group has
 * no icon", so repeat invites to the same group do not re-query the server.
 */
/** Default lifetime of a cached group-icon lookup. */
export const DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS = 10 * 60 * 1000;
/** Default number of groups kept in the cache. */
export const DEFAULT_GROUP_INVITE_THUMBNAIL_MAX = 100;
/** Default budget for the profile-picture query and the CDN download, each. */
export const DEFAULT_GROUP_INVITE_THUMBNAIL_TIMEOUT_MS = 5000;

/**
 * A tiny insertion-ordered TTL cache for group-icon lookups.
 * A cached `undefined` means "looked it up, there is no icon" -- a negative hit, which is
 * exactly the case the old code paid a failing round-trip for every single time.
 */
export const createGroupInviteThumbnailCache = (opts = {}) => {
	const ttlMs = typeof opts.ttlMs === 'number' && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS;
	const max = typeof opts.max === 'number' && opts.max > 0 ? Math.floor(opts.max) : DEFAULT_GROUP_INVITE_THUMBNAIL_MAX;
	const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
	const store = new Map();

	const fresh = (entry) => !!entry && entry.expiresAt > now();

	const prune = () => {
		for (const [key, entry] of store) {
			if (!fresh(entry)) {
				store.delete(key);
			}
		}
		while (store.size > max) {
			const oldest = store.keys().next();
			if (oldest.done) {
				break;
			}
			store.delete(oldest.value);
		}
	};

	return {
		get ttlMs() {
			return ttlMs;
		},
		get max() {
			return max;
		},
		/** `{ hit: boolean, value?: Buffer }` -- a hit with no value is a known-iconless group. */
		get(jid) {
			const entry = store.get(jid);
			if (!fresh(entry)) {
				store.delete(jid);
				return { hit: false };
			}
			return { hit: true, value: entry.value };
		},
		set(jid, value) {
			store.delete(jid);
			store.set(jid, { value: value || undefined, expiresAt: now() + ttlMs });
			prune();
			return value;
		},
		delete(jid) {
			return store.delete(jid);
		},
		clear() {
			store.clear();
		},
		get size() {
			prune();
			return store.size;
		}
	};
};

const withTimeout = (promise, timeoutMs, label) => {
	if (!(timeoutMs > 0)) {
		return promise;
	}

	let timer;
	return Promise.race([
		promise.finally(() => clearTimeout(timer)),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
		})
	]);
};

/**
 * Best-effort group icon for a group-invite message. **Never throws** -- every failure
 * (no icon, privacy-gated, offline, slow CDN, non-200) resolves to `undefined` so the
 * invite itself still goes out.
 */
export const fetchGroupInviteThumbnail = async ({
	jid,
	getProfilePicUrl,
	fetchImpl = fetch,
	dispatcher,
	cache,
	timeoutMs = DEFAULT_GROUP_INVITE_THUMBNAIL_TIMEOUT_MS,
	logger
} = {}) => {
	if (!jid || typeof getProfilePicUrl !== 'function') {
		return undefined;
	}

	const cached = cache?.get(jid);
	if (cached?.hit) {
		return cached.value;
	}

	let buffer;
	try {
		const url = await withTimeout(Promise.resolve(getProfilePicUrl(jid, 'preview')), timeoutMs, 'profile picture query');
		if (url) {
			const resp = await withTimeout(Promise.resolve(fetchImpl(url, { method: 'GET', dispatcher })), timeoutMs, 'thumbnail download');
			if (resp?.ok) {
				buffer = Buffer.from(await resp.arrayBuffer());
			} else {
				logger?.debug?.({ jid, status: resp?.status }, 'group invite thumbnail download returned a non-ok status');
			}
		}
	} catch (err) {
		// A missing icon answers 404 item-not-found; that is normal, not a send failure.
		logger?.debug?.({ jid, err }, 'could not fetch group invite thumbnail, sending without one');
		buffer = undefined;
	}

	cache?.set(jid, buffer);
	return buffer;
};
