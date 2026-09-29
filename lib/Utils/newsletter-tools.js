/**
 * Newsletter tools — batch channel operations with pacing: follow or
 * unfollow many channels in one call without tripping rate limits.
 *
 * ```js
 * import { followManyNewsletters, unfollowManyNewsletters } from '@japofc/baileys'
 *
 * const report = await followManyNewsletters(sock, [
 *     '123@newsletter', '456@newsletter', '789@newsletter'
 * ], { delayMs: 1500 })
 * // { ok: ['123@newsletter', …], failed: [{ jid, error }], total: 3 }
 *
 * await unfollowManyNewsletters(sock, staleChannels)
 * ```
 *
 * Failures never abort the batch — every jid gets its own verdict.
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const runBatch = async (sock, jids, method, { delayMs = 1500, onProgress } = {}) => {
	if (typeof sock?.[method] !== 'function') {
		throw new Error(`socket has no ${method}() — is this a newsletter-capable socket?`);
	}
	const list = (Array.isArray(jids) ? jids : [jids]).filter(Boolean);
	const ok = [];
	const failed = [];
	for (let i = 0; i < list.length; i++) {
		const jid = list[i];
		try {
			await sock[method](jid);
			ok.push(jid);
		} catch (error) {
			failed.push({ jid, error });
		}
		if (onProgress) {
			try {
				onProgress({ jid, index: i + 1, total: list.length, ok: ok.length, failed: failed.length });
			} catch {
				// progress callback errors must not abort the batch
			}
		}
		if (delayMs && i < list.length - 1) {
			await sleep(delayMs);
		}
	}
	return { ok, failed, total: list.length };
};

/** Follow many channels, paced. Returns `{ ok, failed, total }`. */
export const followManyNewsletters = (sock, jids, options) =>
	runBatch(sock, jids, 'newsletterFollow', options);

/** Unfollow many channels, paced. Returns `{ ok, failed, total }`. */
export const unfollowManyNewsletters = (sock, jids, options) =>
	runBatch(sock, jids, 'newsletterUnfollow', options);

/** Mute many channels, paced. */
export const muteManyNewsletters = (sock, jids, options) =>
	runBatch(sock, jids, 'newsletterMute', options);
