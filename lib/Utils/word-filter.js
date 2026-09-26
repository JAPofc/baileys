/**
 * Word filter — keyword/regex moderation ("antikata") over the full extracted
 * text of every incoming message (captions, poll names etc. included).
 *
 * ```js
 * import { createWordFilter } from '@japofc/baileys'
 *
 * const filter = createWordFilter({
 *     words: ['judol', 'slot gacor'],
 *     patterns: [/j\s*u\s*d\s*o\s*l/i],   // catches spaced-out evasion
 *     autoDelete: true                    // delete for everyone (bot = admin)
 * })
 * filter.bind(sock)
 *
 * filter.onMatch(({ chat, sender, matched }) =>
 *     console.log(sender, 'said a banned word:', matched))
 *
 * filter.addWords('pinjol')               // manage the list at runtime
 * filter.removeWords('judol')
 * ```
 *
 * Word entries match on word boundaries, case-insensitively. Multi-word
 * entries ("slot gacor") match as phrases.
 */
import { extractMessageText } from './message-search.js';
import { isJidGroup } from '../WABinary/index.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createWordFilter = (options = {}) => {
	const {
		words = [],
		patterns = [],
		groupsOnly = false,
		allowlist = [],
		autoDelete = false,
		includeFromMe = false
	} = options;

	const wordSet = new Set(words.map(w => String(w).toLowerCase()));
	const regexes = [...patterns];
	const allowed = new Set(allowlist);
	const matchCbs = new Set();
	const errorCbs = new Set();
	let compiled = null;
	let boundSock = null;
	let boundHandler = null;

	const compile = () => {
		if (!wordSet.size) {
			compiled = null;
			return;
		}
		const alternatives = [...wordSet].map(escapeRegex).join('|');
		compiled = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${alternatives})(?![\\p{L}\\p{N}])`, 'iu');
	};
	compile();

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	const findMatch = (text) => {
		if (compiled) {
			const m = text.match(compiled);
			if (m) {
				return m[1];
			}
		}
		for (const re of regexes) {
			const m = text.match(re);
			if (m) {
				return m[0];
			}
		}
		return null;
	};

	/** Handler for `messages.upsert`. Pass the socket to enable auto-delete. */
	const handler = async ({ messages }, sock = boundSock) => {
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
			if (allowed.has(chat)) {
				continue;
			}
			const text = extractMessageText(msg);
			if (!text) {
				continue;
			}
			const matched = findMatch(text);
			if (!matched) {
				continue;
			}
			const sender = isJidGroup(chat) ? msg.key.participant : chat;
			let deleted = false;
			if (autoDelete && sock) {
				try {
					await sock.sendMessage(chat, { delete: msg.key });
					deleted = true;
				} catch (error) {
					emit(errorCbs, { msg, error });
				}
			}
			emit(matchCbs, { msg, key: msg.key, chat, sender, text, matched, deleted });
		}
	};

	return {
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = (events) => {
				handler(events, sock).catch(() => { });
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
		onMatch(cb) {
			matchCbs.add(cb);
			return () => matchCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		/** Check a text directly (no message needed). Returns the match or null. */
		test: (text) => (typeof text === 'string' && text ? findMatch(text) : null),
		addWords(...items) {
			for (const w of items.flat()) {
				wordSet.add(String(w).toLowerCase());
			}
			compile();
		},
		removeWords(...items) {
			for (const w of items.flat()) {
				wordSet.delete(String(w).toLowerCase());
			}
			compile();
		},
		addPatterns(...items) {
			regexes.push(...items.flat());
		},
		getWords: () => [...wordSet],
		get size() {
			return wordSet.size + regexes.length;
		}
	};
};
