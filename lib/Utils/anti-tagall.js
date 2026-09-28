/**
 * Anti-tagall guard — catch members mass-mentioning the group (visible
 * tag-all AND invisible "hidetag" pings) and let you act on it.
 *
 * ```js
 * import { createAntiTagAllGuard } from '@japofc/baileys'
 *
 * const guard = createAntiTagAllGuard({ threshold: 5, autoDelete: true })
 * guard.bind(sock)
 *
 * guard.onDetected(({ chat, sender, mentionCount, hidden }) =>
 *     sock.sendMessage(chat, {
 *         text: `@${sender.split('@')[0]} no ${hidden ? 'hidetag' : 'mass mentions'} here! (${mentionCount} tags)`,
 *         mentions: [sender]
 *     }))
 * ```
 *
 * `hidden: true` means the mentions were invisible (jids in contextInfo but
 * not written as @user in the text) — the classic hidetag spam.
 * Exempt your admins/bots via `exemptUsers` or a dynamic `isExempt` callback.
 */
import { isJidGroup } from '../WABinary/index.js';

export const createAntiTagAllGuard = (options = {}) => {
	const {
		threshold = 5,
		exemptUsers = [],
		isExempt,
		autoDelete = false,
		includeFromMe = false
	} = options;

	const exempt = new Set(exemptUsers);
	const detectedCbs = new Set();
	const errorCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
	};

	const collectMentions = (message) => {
		let mentions = [];
		let text = '';
		for (const [type, content] of Object.entries(message || {})) {
			if (!content || typeof content !== 'object') {
				continue;
			}
			// unwrap ephemeral/view-once wrappers one level
			if (content.message) {
				const inner = collectMentions(content.message);
				if (inner.mentions.length > mentions.length) {
					mentions = inner.mentions;
					text = inner.text;
				}
				continue;
			}
			const ctx = content.contextInfo;
			if (ctx?.mentionedJid?.length > mentions.length) {
				mentions = ctx.mentionedJid;
				text = content.text || content.caption || (type === 'conversation' ? content : '') || '';
			}
		}
		if (!text && typeof message?.conversation === 'string') {
			text = message.conversation;
		}
		return { mentions, text: typeof text === 'string' ? text : '' };
	};

	/** Handler for `messages.upsert`. Pass the socket to enable auto-delete. */
	const handler = async ({ messages }, sock = boundSock) => {
		for (const msg of messages || []) {
			const chat = msg?.key?.remoteJid;
			if (!chat || !msg.message || !isJidGroup(chat)) {
				continue;
			}
			if (msg.key.fromMe && !includeFromMe) {
				continue;
			}
			const sender = msg.key.participant || chat;
			if (exempt.has(sender)) {
				continue;
			}
			const { mentions, text } = collectMentions(msg.message);
			if (mentions.length < threshold) {
				continue;
			}
			if (isExempt) {
				try {
					if (await isExempt({ chat, sender, msg })) {
						continue;
					}
				} catch {
					// exemption check failure → treat as not exempt
				}
			}
			// hidetag: mentioned jids are NOT written out as @123… in the text
			const written = mentions.filter(jid => text.includes(`@${String(jid).split('@')[0]}`)).length;
			const hidden = written < mentions.length / 2;
			let deleted = false;
			if (autoDelete && sock) {
				try {
					await sock.sendMessage(chat, { delete: msg.key });
					deleted = true;
				} catch (error) {
					emit(errorCbs, { msg, error });
				}
			}
			emit(detectedCbs, { msg, key: msg.key, chat, sender, mentionCount: mentions.length, mentions, hidden, deleted });
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
		onDetected(cb) {
			detectedCbs.add(cb);
			return () => detectedCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		addExempt(jid) {
			exempt.add(jid);
		},
		removeExempt(jid) {
			return exempt.delete(jid);
		}
	};
};
