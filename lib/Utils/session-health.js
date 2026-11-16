/**
 * Session-health monitor + JID canonicalization helpers.
 *
 * WhatsApp's Signal sessions can silently drift out of sync (a peer rotates
 * keys, a session is half-migrated between PN and LID, a device is re-linked),
 * and the symptom is a stream of messages that arrive as an undecryptable
 * `CIPHERTEXT` stub instead of real content. A handful of these is normal; a
 * *burst* from one contact almost always means that contact's session is dead
 * and every future message from them will fail until the session is rebuilt.
 *
 * This monitor watches `messages.upsert`, counts decryption failures per
 * contact inside a sliding time window, and fires `onUnhealthy` once a contact
 * crosses a threshold — so callers can request a resend, clear the session, or
 * simply surface the problem instead of losing messages in silence.
 *
 * ```js
 * import { createSessionHealthMonitor } from '@japofc/baileys'
 *
 * const health = createSessionHealthMonitor({ badMacThreshold: 3, windowMs: 60_000 })
 * health.bind(sock)
 * health.onUnhealthy(({ jid, failures }) =>
 *     console.warn(`session with ${jid} looks broken (${failures} decrypt fails)`))
 * health.onRecover(({ jid }) => console.log(`${jid} recovered`))
 * ```
 *
 * It is purely observational unless you give it an `onUnhealthy` handler — it
 * never throws into the event loop and never mutates the socket on its own.
 */
import { WAMessageStubType } from '../Types/index.js';
import { jidDecode, jidNormalizedUser, isLidUser, isPnUser } from '../WABinary/index.js';

/**
 * Reduce any JID to a stable per-contact key: the bare normalized user JID,
 * with the device suffix dropped so `123:4@s.whatsapp.net` and
 * `123@s.whatsapp.net` collapse to one identity. Never throws — an
 * undecodable input is returned unchanged.
 */
export const canonicalizeJid = (jid) => {
	if (!jid || typeof jid !== 'string') {
		return jid;
	}
	try {
		const normalized = jidNormalizedUser(jid);
		return normalized || jid;
	}
	catch {
		return jid;
	}
};

/**
 * Build an async canonicalizer bound to a socket that additionally unifies the
 * two identities of a contact by resolving a LID to its phone-number JID (and
 * vice-versa when `prefer: 'lid'`), using the socket's LID<->PN mapping. This
 * guarantees a contact is keyed the same way whether WhatsApp addressed them by
 * PN or LID. Falls back to {@link canonicalizeJid} when no mapping is known.
 *
 * @param {any} sock a connected socket (needs `getPNForLID`/`getLIDForPN` or `signalRepository.lidMapping`)
 * @param {{ prefer?: 'pn' | 'lid' }} [opts]
 */
export const makeJidCanonicalizer = (sock, opts = {}) => {
	const prefer = opts.prefer === 'lid' ? 'lid' : 'pn';
	const mapping = sock?.signalRepository?.lidMapping;
	const getPNForLID = sock?.getPNForLID || mapping?.getPNForLID?.bind(mapping);
	const getLIDForPN = sock?.getLIDForPN || mapping?.getLIDForPN?.bind(mapping);
	return async (jid) => {
		const base = canonicalizeJid(jid);
		if (!base || typeof base !== 'string') {
			return base;
		}
		try {
			if (prefer === 'pn' && isLidUser(base) && typeof getPNForLID === 'function') {
				return canonicalizeJid(await getPNForLID(base)) || base;
			}
			if (prefer === 'lid' && isPnUser(base) && typeof getLIDForPN === 'function') {
				return canonicalizeJid(await getLIDForPN(base)) || base;
			}
		}
		catch {
			// mapping lookup failed — fall back to the syntactic canonical form
		}
		return base;
	};
};

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_TRACKED = 1000;

/**
 * @param {object} [options]
 * @param {number} [options.badMacThreshold=3]  failures within the window before a contact is flagged unhealthy
 * @param {number} [options.windowMs=60000]     sliding window for counting failures
 * @param {number} [options.maxTracked=1000]    LRU cap on distinct contacts tracked
 * @param {boolean} [options.ignoreFromMe=true] ignore our own (fromMe) messages
 * @param {(sock:any)=>((jid:string)=>string|Promise<string>)} [options.keyBy] custom contact-key resolver (defaults to canonicalizeJid)
 * @param {()=>number} [options.now]
 */
export const createSessionHealthMonitor = (options = {}) => {
	const {
		badMacThreshold = DEFAULT_THRESHOLD,
		windowMs = DEFAULT_WINDOW_MS,
		maxTracked = DEFAULT_MAX_TRACKED,
		ignoreFromMe = true,
		keyBy,
		now = () => Date.now()
	} = options;

	if (!(badMacThreshold >= 1)) {
		throw new Error('createSessionHealthMonitor: badMacThreshold must be >= 1');
	}
	if (!(windowMs >= 1)) {
		throw new Error('createSessionHealthMonitor: windowMs must be >= 1');
	}

	/** contact key -> { hits: number[] (timestamps), unhealthy: boolean, lastFailureAt: number, total: number } */
	const contacts = new Map();
	const unhealthyCbs = new Set();
	const recoverCbs = new Set();
	const errorCbs = new Set();

	let boundEv = null;
	let listener = null;
	let sweepTimer = null;
	let resolveKey = canonicalizeJid;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			}
			catch (err) {
				if (set !== errorCbs) {
					reportError(err);
				}
			}
		}
	};
	const reportError = (err) => {
		for (const cb of errorCbs) {
			try {
				cb(err);
			}
			catch {
				// swallow — an error handler that throws must not crash the loop
			}
		}
	};

	/** drop timestamps older than the window; returns the surviving count */
	const prune = (entry, t) => {
		const cutoff = t - windowMs;
		while (entry.hits.length && entry.hits[0] <= cutoff) {
			entry.hits.shift();
		}
		return entry.hits.length;
	};

	/** enforce the LRU cap by evicting the least-recently-failed healthy contacts */
	const evictIfNeeded = () => {
		if (contacts.size <= maxTracked) {
			return;
		}
		const sorted = [...contacts.entries()].sort((a, b) => a[1].lastFailureAt - b[1].lastFailureAt);
		for (const [key, entry] of sorted) {
			if (contacts.size <= maxTracked) {
				break;
			}
			if (!entry.unhealthy) {
				contacts.delete(key);
			}
		}
	};

	/**
	 * Record one decryption failure for `jid`. Exposed so callers who detect
	 * failures elsewhere (e.g. a custom retry handler) can feed the monitor.
	 */
	const record = (jid) => {
		const key = jid;
		if (!key) {
			return;
		}
		const t = now();
		let entry = contacts.get(key);
		if (!entry) {
			entry = { hits: [], unhealthy: false, lastFailureAt: 0, total: 0 };
			contacts.set(key, entry);
		}
		entry.hits.push(t);
		entry.lastFailureAt = t;
		entry.total += 1;
		const count = prune(entry, t);
		if (!entry.unhealthy && count >= badMacThreshold) {
			entry.unhealthy = true;
			emit(unhealthyCbs, { jid: key, failures: count, total: entry.total, windowMs, at: t });
		}
		evictIfNeeded();
	};

	/** re-check every tracked contact and fire onRecover for any that aged out */
	const sweep = () => {
		const t = now();
		for (const [key, entry] of contacts) {
			const count = prune(entry, t);
			if (entry.unhealthy && count < badMacThreshold) {
				entry.unhealthy = false;
				emit(recoverCbs, { jid: key, failures: count, total: entry.total, at: t });
			}
			if (!entry.unhealthy && entry.hits.length === 0) {
				contacts.delete(key);
			}
		}
	};

	const isDecryptFailure = (msg) => (
		!!msg
		&& msg.messageStubType === WAMessageStubType.CIPHERTEXT
		&& msg.category !== 'peer'
		&& !(ignoreFromMe && msg.key?.fromMe)
	);

	const onUpsert = (upsert) => {
		try {
			const messages = upsert?.messages;
			if (!Array.isArray(messages)) {
				return;
			}
			for (const msg of messages) {
				if (!isDecryptFailure(msg)) {
					continue;
				}
				const raw = msg.key?.remoteJid;
				const sender = msg.key?.participant || raw;
				if (!sender) {
					continue;
				}
				let keyed;
				try {
					keyed = resolveKey(sender);
				}
				catch {
					keyed = canonicalizeJid(sender);
				}
				// keyBy may be async (LID->PN lookup); keep the common sync path sync
				if (keyed && typeof keyed.then === 'function') {
					keyed.then(record).catch(() => record(canonicalizeJid(sender)));
				}
				else {
					record(keyed);
				}
			}
		}
		catch (err) {
			reportError(err);
		}
	};

	return {
		/**
		 * Attach to a socket's event stream and start a periodic recovery sweep.
		 * Returns an unbind function.
		 */
		bind(sock, bindOpts = {}) {
			if (boundEv) {
				this.unbind();
			}
			if (!sock?.ev?.on) {
				throw new Error('createSessionHealthMonitor.bind: socket has no event emitter');
			}
			resolveKey = typeof keyBy === 'function' ? keyBy(sock) : canonicalizeJid;
			listener = (u) => onUpsert(u);
			sock.ev.on('messages.upsert', listener);
			boundEv = sock.ev;
			const sweepMs = bindOpts.sweepMs ?? windowMs;
			if (sweepMs > 0) {
				sweepTimer = setInterval(() => {
					try {
						sweep();
					}
					catch (err) {
						reportError(err);
					}
				}, sweepMs);
				sweepTimer.unref?.();
			}
			return () => this.unbind();
		},
		unbind() {
			if (boundEv && listener) {
				boundEv.off?.('messages.upsert', listener);
			}
			if (sweepTimer) {
				clearInterval(sweepTimer);
				sweepTimer = null;
			}
			boundEv = null;
			listener = null;
		},
		record,
		sweep,
		isHealthy(jid) {
			const entry = contacts.get(canonicalizeJid(jid));
			return !entry || !entry.unhealthy;
		},
		getStatus(jid) {
			const key = canonicalizeJid(jid);
			const entry = contacts.get(key);
			if (!entry) {
				return { jid: key, healthy: true, failures: 0, total: 0, lastFailureAt: 0 };
			}
			const failures = prune(entry, now());
			return { jid: key, healthy: !entry.unhealthy, failures, total: entry.total, lastFailureAt: entry.lastFailureAt };
		},
		getUnhealthy() {
			const out = [];
			for (const [key, entry] of contacts) {
				if (entry.unhealthy) {
					out.push({ jid: key, failures: prune(entry, now()), total: entry.total, lastFailureAt: entry.lastFailureAt });
				}
			}
			return out;
		},
		getStats() {
			let tracked = 0;
			let unhealthy = 0;
			let totalFailures = 0;
			for (const entry of contacts.values()) {
				tracked += 1;
				totalFailures += entry.total;
				if (entry.unhealthy) {
					unhealthy += 1;
				}
			}
			return { tracked, unhealthy, healthy: tracked - unhealthy, totalFailures, badMacThreshold, windowMs };
		},
		reset(jid) {
			if (jid === undefined) {
				contacts.clear();
				return;
			}
			contacts.delete(canonicalizeJid(jid));
		},
		onUnhealthy(cb) {
			if (typeof cb !== 'function') {
				throw new TypeError('onUnhealthy(cb) requires a function');
			}
			unhealthyCbs.add(cb);
			return () => unhealthyCbs.delete(cb);
		},
		onRecover(cb) {
			if (typeof cb !== 'function') {
				throw new TypeError('onRecover(cb) requires a function');
			}
			recoverCbs.add(cb);
			return () => recoverCbs.delete(cb);
		},
		onError(cb) {
			if (typeof cb !== 'function') {
				throw new TypeError('onError(cb) requires a function');
			}
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		}
	};
};
