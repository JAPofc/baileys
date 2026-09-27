/**
 * WhatsApp link helpers — build and parse wa.me / chat.whatsapp.com /
 * channel URLs, and pull every URL out of a text.
 *
 * ```js
 * import { buildWaMeLink, parseWaLink, extractUrls } from '@japofc/baileys'
 *
 * buildWaMeLink('+62 812-3456-789', 'Halo!')
 * // 'https://wa.me/62812345678 9?text=Halo%21' → normalized digits + encoded text
 *
 * parseWaLink('https://wa.me/628123?text=Hi')
 * // { type: 'chat', phone: '628123', text: 'Hi' }
 * parseWaLink('https://chat.whatsapp.com/AbCdEf...')
 * // { type: 'group-invite', code: 'AbCdEf...' }
 *
 * extractUrls('cek https://a.id dan http://b.com ya')
 * // ['https://a.id', 'http://b.com']
 * ```
 */

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

/** Every http(s) URL in a text (trailing punctuation stripped). */
export const extractUrls = (text) => {
	const out = [];
	for (const match of String(text || '').matchAll(URL_RE)) {
		out.push(match[0].replace(/[.,;:!?]+$/, ''));
	}
	return out;
};

const digitsOf = (phone) => {
	let d = String(phone || '').replace(/\D/g, '');
	if (d.startsWith('00')) {
		d = d.slice(2);
	}
	return d;
};

/**
 * Build a click-to-chat link. Accepts any human phone format
 * ('+62 812…', '0062…', jid '628…@s.whatsapp.net'); text is URL-encoded.
 */
export const buildWaMeLink = (phone, text) => {
	const digits = digitsOf(String(phone).split('@')[0]);
	if (!digits || digits.length < 5 || digits.length > 15 || digits.startsWith('0')) {
		throw new Error('buildWaMeLink: phone must be an international number (no leading 0)');
	}
	const qs = text ? `?text=${encodeURIComponent(text)}` : '';
	return `https://wa.me/${digits}${qs}`;
};

/** Build a group invite URL from an invite code (or pass-through a full URL). */
export const buildGroupInviteUrl = (code) => {
	const clean = String(code || '').replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').trim();
	if (!/^[A-Za-z0-9]{16,}$/.test(clean)) {
		throw new Error('buildGroupInviteUrl: invalid invite code');
	}
	return `https://chat.whatsapp.com/${clean}`;
};

/** Build a channel URL from an invite slug. */
export const buildChannelUrl = (inviteCode) => {
	const clean = String(inviteCode || '').trim();
	if (!clean) {
		throw new Error('buildChannelUrl: invite code required');
	}
	return `https://whatsapp.com/channel/${clean}`;
};

/**
 * Parse any WhatsApp URL. Returns one of:
 * - `{ type: 'chat', phone, text? }` — wa.me / api.whatsapp.com click-to-chat
 * - `{ type: 'group-invite', code, url }`
 * - `{ type: 'channel', code, url }`
 * - `null` — not a WhatsApp link
 */
export const parseWaLink = (input) => {
	let url;
	try {
		url = new URL(String(input));
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	if (host === 'wa.me' || host === 'api.whatsapp.com' || host === 'whatsapp.com') {
		if (host !== 'wa.me' && url.pathname.toLowerCase().startsWith('/channel/')) {
			const code = url.pathname.split('/')[2] || '';
			return code ? { type: 'channel', code, url: url.href } : null;
		}
		let phone = '';
		if (host === 'wa.me') {
			phone = digitsOf(url.pathname.slice(1));
		} else if (url.pathname.toLowerCase().replace(/\/$/, '') === '/send') {
			phone = digitsOf(url.searchParams.get('phone'));
		} else {
			return null;
		}
		if (!phone) {
			return null;
		}
		const text = url.searchParams.get('text') ?? undefined;
		return { type: 'chat', phone, ...(text !== undefined ? { text } : {}) };
	}
	if (host === 'chat.whatsapp.com') {
		const code = url.pathname.slice(1).replace(/\/$/, '');
		return /^[A-Za-z0-9]{16,}$/.test(code) ? { type: 'group-invite', code, url: url.href } : null;
	}
	return null;
};

/** True when the text contains at least one WhatsApp link of any kind. */
export const containsWaLink = (text) => extractUrls(text).some(u => parseWaLink(u) !== null);
