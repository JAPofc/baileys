/**
 * Anti-link guard — detect (and optionally auto-delete) messages carrying
 * links, with a WhatsApp-group-invite-only mode for classic antilink bots.
 *
 * ```js
 * import { createAntiLinkGuard, containsGroupInvite, extractLinks } from '@japofc/baileys'
 *
 * const antilink = createAntiLinkGuard({
 *     groupsOnly: true,          // ignore DMs (default true)
 *     inviteLinksOnly: true,     // only chat.whatsapp.com invites (default true)
 *     allowlist: ['123@g.us'],   // groups where links are fine
 *     autoDelete: true           // delete for everyone (bot must be admin)
 * })
 * antilink.bind(sock) // listens on messages.upsert
 *
 * antilink.onDetected(({ chat, sender, links, inviteCode, deleted }) => {
 *     sock.sendMessage(chat, { text: `@${sender.split('@')[0]} no links here!`, mentions: [sender] })
 * })
 * ```
 *
 * Detection uses the same text extraction as message search, so captions,
 * poll names etc. are covered — not just plain text messages.
 */
import { extractMessageText } from './message-search.js';
import { extractGroupInviteCode } from './text-tools.js';
import { isJidGroup } from '../WABinary/index.js';

const URL_RE = /https?:\/\/[^\s<>"')\]]+|(?:^|\s)(?:www\.)[^\s<>"')\]]+/gi;

/** All http(s)/www links found in a text (deduped, trimmed). */
export const extractLinks = (text) => {
	if (typeof text !== 'string' || !text) {
		return [];
	}
	const links = new Set();
	for (const match of text.matchAll(URL_RE)) {
		const link = match[0].trim().replace(/[.,;:!?]+$/, '');
		if (link) {
			links.add(link);
		}
	}
	return [...links];
};

/** True if the text contains a WhatsApp group invite link. */
export const containsGroupInvite = (text) => extractGroupInviteCode(text) !== null;

export const createAntiLinkGuard = (options = {}) => {
	const {
		groupsOnly = true,
		inviteLinksOnly = true,
		allowlist = [],
		allowedDomains = [],
		autoDelete = false,
		includeFromMe = false
	} = options;

	const allowed = new Set(allowlist);
	const okDomains = allowedDomains.map(d => d.toLowerCase());
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

	const isDomainAllowed = (link) => {
		if (!okDomains.length) {
			return false;
		}
		const host = (link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '').toLowerCase();
		return okDomains.some(d => host === d || host.endsWith(`.${d}`));
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
			const inviteCode = extractGroupInviteCode(text);
			let links;
			if (inviteLinksOnly) {
				if (!inviteCode) {
					continue;
				}
				links = extractLinks(text).filter(l => extractGroupInviteCode(l));
				if (!links.length) {
					links = [text.match(/\S*chat\.whatsapp\.com\S*/i)?.[0] || 'chat.whatsapp.com'];
				}
			} else {
				links = extractLinks(text).filter(l => !isDomainAllowed(l));
				if (!links.length) {
					continue;
				}
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
			emit(detectedCbs, { msg, key: msg.key, chat, sender, text, links, inviteCode, deleted });
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
		}
	};
};
