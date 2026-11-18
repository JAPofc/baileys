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
	// JAP@Upgrade: extra banned words per chat (checked on top of global).
	const chatWords = new Map();
	const regexes = [...patterns];
	const allowed = new Set(allowlist);
	const matchCbs = new Set();
	const errorCbs = new Set();
	// JAP@Upgrade: runtime-toggleable auto-delete + match/delete counters.
	let autoDeleteEnabled = !!autoDelete;
	let totalMatches = 0;
	let totalDeleted = 0;
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
			let matched = findMatch(text);
			if (!matched) {
				// per-chat extras
				const extras = chatWords.get(chat);
				if (extras) {
					const lower = text.toLowerCase();
					for (const w of extras) {
						const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
						const m = text.match(new RegExp(`(?:^|[^\\p{L}\\p{N}])(${esc})(?![\\p{L}\\p{N}])`, 'iu'));
						if (m) {
							matched = m[1];
							break;
						}
					}
				}
				if (!matched) {
					continue;
				}
			}
			const sender = isJidGroup(chat) ? msg.key.participant : chat;
			totalMatches++;
			let deleted = false;
			if (autoDeleteEnabled && sock) {
				try {
					await sock.sendMessage(chat, { delete: msg.key });
					deleted = true;
					totalDeleted++;
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
		/** JAP@Upgrade: star out every configured word in a text. */
		getCensored(text, { char = '*' } = {}) {
			let out = String(text ?? '');
			for (const w of wordSet) {
				const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu');
				out = out.replace(re, (m) => m.length <= 2 ? char.repeat(m.length) : m[0] + char.repeat(m.length - 2) + m[m.length - 1]);
			}
			return out;
		},
		/** Check a text directly (no message needed). Returns the match or null. */
		test: (text) => (typeof text === 'string' && text ? findMatch(text) : null),
		/** JAP@Upgrade: chat-specific banned words (on top of the global list). */
		addChatWords(chat, ...items) {
			let set = chatWords.get(chat);
			if (!set) {
				set = new Set();
				chatWords.set(chat, set);
			}
			for (const w of items.flat()) {
				set.add(String(w).toLowerCase());
			}
		},
		removeChatWords(chat, ...items) {
			const set = chatWords.get(chat);
			if (!set) {
				return;
			}
			for (const w of items.flat()) {
				set.delete(String(w).toLowerCase());
			}
			if (!set.size) {
				chatWords.delete(chat);
			}
		},
		getChatWords: (chat) => [...(chatWords.get(chat) || [])],
		/**
		 * JAP@Upgrade: manage the allowlist (exempt chats) at runtime — previously
		 * it could only be fixed at creation, unlike the word list. `allow`/`unallow`
		 * accept one jid or several. Returns the current allowlist size.
		 */
		allow(...chats) {
			for (const c of chats.flat()) {
				if (c) allowed.add(String(c));
			}
			return allowed.size;
		},
		unallow(...chats) {
			for (const c of chats.flat()) {
				allowed.delete(String(c));
			}
			return allowed.size;
		},
		isAllowed: (chat) => allowed.has(String(chat)),
		getAllowlist: () => [...allowed],
		/** JAP@Upgrade: flip auto-delete on/off after creation. Returns the new state. */
		setAutoDelete(on) {
			autoDeleteEnabled = !!on;
			return autoDeleteEnabled;
		},
		get autoDelete() {
			return autoDeleteEnabled;
		},
		/** JAP@Upgrade: running counters — { matches, deleted }. */
		get stats() {
			return { matches: totalMatches, deleted: totalDeleted };
		},
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
