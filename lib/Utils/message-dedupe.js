/**
 * Message de-duplication / idempotency guard.
 *
 * WhatsApp re-delivers messages to `messages.upsert` more often than people
 * expect: after a reconnect, during history sync, on placeholder resends, and
 * when the same notification is retried. A bot that naively replies inside
 * `messages.upsert` will then answer the same message twice. This is a tiny,
 * bounded LRU of message keys you've already handled so you can skip repeats.
 *
 * ```js
 * import { createMessageDedupe } from '@japofc/baileys'
 *
 * const dedupe = createMessageDedupe({ maxSize: 5000 })
 * sock.ev.on('messages.upsert', async ({ messages }) => {
 *   for (const m of messages) {
 *     if (dedupe.seen(m.key)) continue // already handled — skip
 *     // ...handle m exactly once
 *   }
 * })
 * ```
 *
 * `seen()` both checks and records in one call (the common case). Pass a WA
 * message key object, a full message (`{ key }`), or a plain string id.
 * Optionally set `ttlMs` to let a very old id be processed again.
 */
const DEFAULT_MAX = 5000;

const keyOf = (input) => {
	if (input === null || input === undefined) {
		return null;
	}
	if (typeof input === 'string') {
		return input;
	}
	// accept a full message ({ key }) or a bare key ({ id, remoteJid, fromMe })
	const k = input.key || input;
	if (!k || !k.id) {
		return null;
	}
	return `${k.remoteJid || ''}:${k.fromMe ? 1 : 0}:${k.id}`;
};

export const createMessageDedupe = (options = {}) => {
	const {
		maxSize = DEFAULT_MAX,
		ttlMs = 0,
		now = () => Date.now()
	} = options;
	if (!(maxSize >= 1)) {
		throw new Error('createMessageDedupe: maxSize must be >= 1');
	}
	/** key -> timestamp first seen (Map preserves insertion order for LRU eviction) */
	const store = new Map();

	const isFresh = (ts, t) => !ttlMs || (t - ts) < ttlMs;

	const evict = () => {
		while (store.size > maxSize) {
			const oldest = store.keys().next().value;
			store.delete(oldest);
		}
	};

	return {
		/**
		 * True if this message was already recorded (and still fresh). Records it
		 * when new, so a second call with the same key returns true. Unknown/blank
		 * keys are treated as never-seen (returns false) and are not stored.
		 */
		seen(input) {
			const key = keyOf(input);
			if (!key) {
				return false;
			}
			const t = now();
			const prev = store.get(key);
			if (prev !== undefined && isFresh(prev, t)) {
				return true;
			}
			store.set(key, t);
			evict();
			return false;
		},

		/** Check membership without recording. */
		has(input) {
			const key = keyOf(input);
			if (!key) {
				return false;
			}
			const prev = store.get(key);
			return prev !== undefined && isFresh(prev, now());
		},

		/** Record a key without returning its previous state. */
		add(input) {
			const key = keyOf(input);
			if (!key) {
				return;
			}
			store.set(key, now());
			evict();
		},

		/** Forget a single key. */
		delete(input) {
			const key = keyOf(input);
			return key ? store.delete(key) : false;
		},

		/** Drop everything. */
		clear() {
			store.clear();
		},

		/** Number of keys currently tracked. */
		get size() {
			return store.size;
		}
	};
};
