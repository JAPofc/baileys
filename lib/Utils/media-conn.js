/**
 * lib/Utils/media-conn.js — parsing + expiry for the `media_conn` upload handshake
 *
 * Part of @japofc/baileys. `refreshMediaConn()` in `lib/Socket/messages-send.js` parsed the
 * `<media_conn>` stanza with bare unary `+` coercions and then compared the cache age
 * against `ttl * 1000`. A missing or non-numeric `ttl` made that comparison `NaN`, which is
 * false for every operator — so the connection was cached forever (BUGREPORT §2.45). The
 * parsing and the expiry predicate live here instead: socket-free and unit-testable.
 */
import { getBinaryNodeChildren } from '../WABinary/index.js';

/**
 * Fallback lifetime (seconds) used when the server omits `ttl` or sends one that is not a
 * finite positive number. Deliberately short: re-fetching the handshake is cheap, while
 * uploading with expired `auth` fails.
 */
export const MEDIA_CONN_DEFAULT_TTL = 300;

/**
 * JAP@Fix (§2.45 / v2.4.7) --- Coerce a stanza attribute to a finite positive number.
 * @param {unknown} value
 * @param {number|undefined} fallback
 * @returns {number|undefined}
 */
const toPositiveNumber = (value, fallback) => {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Parse a `<media_conn>` node into the media-connection record the uploader uses.
 *
 * Numeric attributes can no longer come out as `NaN`: `ttl` falls back to
 * `MEDIA_CONN_DEFAULT_TTL` and a host's `maxContentLengthBytes` is simply omitted when the
 * server does not send a usable value.
 *
 * @param {{attrs?: Record<string, any>, content?: any}|null|undefined} mediaConnNode
 * @param {{now?: number}} [options]
 * @returns {{hosts: Array<{hostname: string, maxContentLengthBytes?: number}>, auth: string|undefined, ttl: number, fetchDate: Date}}
 */
export const parseMediaConnNode = (mediaConnNode, { now = Date.now() } = {}) => {
	const hosts = getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => {
		const maxContentLengthBytes = toPositiveNumber(attrs?.maxContentLengthBytes, undefined);
		return {
			hostname: attrs?.hostname,
			...(maxContentLengthBytes === undefined ? {} : { maxContentLengthBytes })
		};
	});
	return {
		hosts,
		auth: mediaConnNode?.attrs?.auth,
		ttl: toPositiveNumber(mediaConnNode?.attrs?.ttl, MEDIA_CONN_DEFAULT_TTL),
		fetchDate: new Date(now)
	};
};

/**
 * Whether a cached media connection must be re-fetched.
 *
 * The previous inline expression was
 * `new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000`, which silently
 * answered "not expired" forever once `ttl` was `NaN`. Anything that is not a usable
 * record — missing, no fetch date, non-finite ttl — now counts as expired, so the worst
 * case is one extra handshake instead of permanently stale upload credentials.
 *
 * @param {{ttl?: number, fetchDate?: Date|number}|null|undefined} media
 * @param {number} [now]
 * @returns {boolean}
 */
export const isMediaConnExpired = (media, now = Date.now()) => {
	if (!media) {
		return true;
	}
	const fetchedAt = media.fetchDate instanceof Date ? media.fetchDate.getTime() : Number(media.fetchDate);
	if (!Number.isFinite(fetchedAt)) {
		return true;
	}
	const ttl = Number(media.ttl);
	if (!Number.isFinite(ttl) || ttl <= 0) {
		return true;
	}
	return now - fetchedAt > ttl * 1000;
};
