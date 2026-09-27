/**
 * URL watcher — poll any HTTP endpoint and get notified when its content
 * changes: price pages, status endpoints, JSON APIs, RSS…
 *
 * ```js
 * import { createUrlWatcher } from '@japofc/baileys'
 *
 * const watcher = createUrlWatcher('https://api.example.com/status.json', {
 *     intervalMs: 60_000
 * })
 * watcher.onChange(({ body, previousHash }) =>
 *     sock.sendMessage(owner, { text: `🔔 Endpoint changed:\n${body.slice(0, 500)}` }))
 * watcher.onError(({ error }) => console.log('poll failed:', error.message))
 * watcher.start()
 *
 * await watcher.check()   // manual poll (also used to prime the baseline)
 * ```
 *
 * The first successful poll sets the baseline silently; `onChange` fires
 * only on actual content changes (SHA-256 of an optionally `extract`ed view).
 */
import { createHash } from 'crypto';

export const createUrlWatcher = (url, options = {}) => {
	if (!url) {
		throw new Error('createUrlWatcher(url) requires a URL');
	}
	const {
		intervalMs = 60_000,
		timeoutMs = 15_000,
		headers = {},
		/** Reduce the body before hashing/reporting (e.g. pick one JSON field). */
		extract,
		fetchImpl = fetch
	} = options;

	const changeCbs = new Set();
	const errorCbs = new Set();
	let timer = null;
	let lastHash = null;
	let lastBody = null;
	let lastEtag = null;
	let lastModified = null;
	let notModifiedHits = 0;
	let checks = 0;
	let changes = 0;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	/** Poll once. Returns `{ changed, hash, body }` (or `{ error }`). */
	const check = async () => {
		checks++;
		try {
			const controller = new AbortController();
			const t = setTimeout(() => controller.abort(), timeoutMs);
			let response;
			try {
				// JAP@Upgrade: conditional requests — servers that support
				// ETag/Last-Modified answer 304 and we skip the body entirely.
				const conditional = { ...headers };
				if (lastEtag) {
					conditional['if-none-match'] = lastEtag;
				}
				if (lastModified) {
					conditional['if-modified-since'] = lastModified;
				}
				response = await fetchImpl(url, { headers: conditional, signal: controller.signal });
			} finally {
				clearTimeout(t);
			}
			if (response.status === 304) {
				notModifiedHits++;
				return { changed: false, notModified: true, hash: lastHash, body: lastBody };
			}
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			lastEtag = response.headers?.get?.('etag') || null;
			lastModified = response.headers?.get?.('last-modified') || null;
			let body = await response.text();
			if (extract) {
				try {
					const view = extract(body);
					body = typeof view === 'string' ? view : JSON.stringify(view);
				} catch {
					// extract failure → hash the raw body
				}
			}
			const hash = createHash('sha256').update(body).digest('hex');
			const previousHash = lastHash;
			const changed = previousHash !== null && hash !== previousHash;
			lastHash = hash;
			lastBody = body;
			if (changed) {
				changes++;
				emit(changeCbs, { url, body, hash, previousHash, at: Date.now() });
			}
			return { changed, hash, body };
		} catch (error) {
			emit(errorCbs, { url, error });
			return { error };
		}
	};

	return {
		check,
		start() {
			if (timer) {
				return () => this.stop();
			}
			void check(); // prime the baseline
			timer = setInterval(() => {
				void check();
			}, intervalMs);
			if (timer.unref) {
				timer.unref();
			}
			return () => this.stop();
		},
		stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		get isRunning() {
			return !!timer;
		},
		onChange(cb) {
			changeCbs.add(cb);
			return () => changeCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		get lastBody() {
			return lastBody;
		},
		get stats() {
			return { checks, changes, notModifiedHits };
		}
	};
};
