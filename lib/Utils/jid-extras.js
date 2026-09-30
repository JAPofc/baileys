/**
 * JID extras — friendly conversions between phone numbers and jids.
 *
 * ```js
 * import { phoneToJid, jidToPhone, sameUser, deviceOf, prettyPhone } from '@japofc/baileys'
 *
 * phoneToJid('+62 812-3456-7890')       // '6281234567890@s.whatsapp.net'
 * jidToPhone('628123@s.whatsapp.net')   // '628123'
 * sameUser('a:12@s.whatsapp.net', 'a@s.whatsapp.net') // true (device-insensitive)
 * deviceOf('a:12@s.whatsapp.net')       // 12
 * prettyPhone('6281234567890')          // '+62 812-3456-7890'
 * ```
 */

/** Any human phone format → user jid. Throws on local-format numbers. */
export const phoneToJid = (phone) => {
	let digits = String(phone ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
	if (digits.startsWith('00')) {
		digits = digits.slice(2);
	}
	if (!digits || digits.length < 5 || digits.length > 15 || digits.startsWith('0')) {
		throw new Error('phoneToJid: needs an international number (no leading 0)');
	}
	return `${digits}@s.whatsapp.net`;
};

/** User jid → bare phone digits (device suffix stripped), or null. */
export const jidToPhone = (jid) => {
	const s = String(jid ?? '');
	if (!s.endsWith('@s.whatsapp.net')) {
		return null;
	}
	const digits = s.split('@')[0].split(':')[0];
	return /^\d{5,15}$/.test(digits) ? digits : null;
};

/** Same underlying account? Ignores the :device suffix. */
export const sameUser = (a, b) => {
	const norm = (jid) => {
		const [user, server] = String(jid ?? '').split('@');
		return `${(user || '').split(':')[0]}@${server || ''}`;
	};
	return !!a && !!b && norm(a) === norm(b);
};

/** Device index from a jid (0 = primary), or null when absent. */
export const deviceOf = (jid) => {
	const m = /^[^:@]+:(\d+)@/.exec(String(jid ?? ''));
	return m ? parseInt(m[1], 10) : null;
};

/**
 * Pretty-print a phone/jid: '+62 812-3456-7890'. Groups digits 3-4-4-…
 * after the country code; pass `{ style: 'plain' }` for bare digits.
 */
export const prettyPhone = (input, { style = 'intl' } = {}) => {
	let digits = String(input ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
	if (digits.startsWith('00')) {
		digits = digits.slice(2);
	}
	if (!/^\d{5,15}$/.test(digits)) {
		return null;
	}
	if (style === 'plain') {
		return digits;
	}
	// heuristic country-code split: 1-3 digits (longest match ≤ 3, rest ≥ 4)
	const ccLen = digits.length > 10 ? 2 : 1;
	const cc = digits.slice(0, ccLen);
	const rest = digits.slice(ccLen);
	const groups = [];
	let i = 0;
	while (i < rest.length) {
		const take = rest.length - i > 4 ? (groups.length === 0 ? 3 : 4) : rest.length - i;
		groups.push(rest.slice(i, i + take));
		i += take;
	}
	return `+${cc} ${groups.join('-')}`;
};

/** Classify a JID: 'user' | 'group' | 'broadcast' | 'status' | 'newsletter' | 'lid' | 'bot' | 'unknown'. */
export const jidType = (jid) => {
	const j = String(jid || '');
	if (!j.includes('@')) {
		return 'unknown';
	}
	if (j === 'status@broadcast') {
		return 'status';
	}
	if (j.endsWith('@g.us')) {
		return 'group';
	}
	if (j.endsWith('@broadcast')) {
		return 'broadcast';
	}
	if (j.endsWith('@newsletter')) {
		return 'newsletter';
	}
	if (j.endsWith('@lid')) {
		return 'lid';
	}
	if (j.endsWith('@bot')) {
		return 'bot';
	}
	if (j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us')) {
		return 'user';
	}
	return 'unknown';
};

// JAP@Add 29-09-26 (v2.4.6) — JID convenience helpers (heavily-used, pure).

/** True when the jid addresses a real account you can DM (user/c.us or lid), not a group/broadcast/newsletter. */
export const isJidUser = (jid) => {
	const t = jidType(jid);
	return t === 'user' || t === 'lid';
};

/** The server part of a jid ('s.whatsapp.net' | 'g.us' | 'lid' | 'newsletter' | 'broadcast' | 'c.us'), or null. */
export const serverOf = (jid) => {
	const s = String(jid ?? '');
	const at = s.indexOf('@');
	return at === -1 ? null : s.slice(at + 1) || null;
};

/** Set/replace the `:device` suffix on a jid. device 0/null/undefined strips it. Non-mutating. */
export const withDevice = (jid, device) => {
	const s = String(jid ?? '');
	const at = s.indexOf('@');
	if (at === -1) return s;
	const server = s.slice(at + 1);
	const base = s.slice(0, at).split(':')[0];
	const d = Number(device);
	return d ? `${base}:${d}@${server}` : `${base}@${server}`;
};

/** Device-agnostic "is this me?" check against your own id. */
export const isMe = (jid, meId) => sameUser(jid, meId);

/**
 * Normalize a recipients input into a de-duplicated jid list. Accepts a jid, a
 * phone number, an array of either, or a comma/space/semicolon-separated string.
 * Already-jids are kept; bare phone-looking entries are converted; anything
 * unconvertible is skipped (never throws).
 */
export const toJidList = (input) => {
	const raw = Array.isArray(input)
		? input
		: String(input ?? '').split(/[,;\s]+/);
	const out = [];
	const seen = new Set();
	for (const item of raw) {
		const s = String(item ?? '').trim();
		if (!s) continue;
		let jid = null;
		if (s.includes('@')) {
			jid = s;
		} else {
			try { jid = phoneToJid(s); } catch { jid = null; }
		}
		if (jid && !seen.has(jid)) {
			seen.add(jid);
			out.push(jid);
		}
	}
	return out;
};

/** WhatsApp mention token for a jid ('@62812…'), for building mention text. Returns '' for non-user jids. */
export const mentionText = (jid) => {
	const digits = String(jid ?? '').split('@')[0].split(':')[0];
	return /^\d{3,15}$/.test(digits) ? `@${digits}` : '';
};
