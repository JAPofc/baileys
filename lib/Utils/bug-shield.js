/**
 * Bug shield — detect and neutralize "bug messages": the oversized,
 * mention-bombed, zalgo-flooded payloads people send to freeze WhatsApp
 * clients and crash bots.
 *
 * ```js
 * import { createBugShield, analyzeMessageThreat, sanitizeText } from '@japofc/baileys'
 *
 * const shield = createBugShield({ autoDelete: true })
 * shield.bind(sock)
 * shield.onDetected(({ chat, sender, reasons, score }) => {
 *     console.log('bug message from', sender, reasons)   // e.g. ['mentionBomb', 'invisibleFlood']
 *     gate.banUser(sender, 'bug message')                // your call
 * })
 *
 * analyzeMessageThreat(msg)      // { threat, score, reasons } — pure, no socket
 * sanitizeText(dirtyText)        // strips RTL-override, invisible flood, zalgo
 * ```
 *
 * Detection is score-based: each signal adds points; `threat` is true at
 * `scoreThreshold` (default 2 — a single big text alone can also trip it).
 */
import { isJidGroup } from '../WABinary/index.js';

export const DEFAULT_THREAT_THRESHOLDS = {
	/** Text/caption length that is instantly suspicious. */
	maxTextLength: 50_000,
	/** Mentioned jids in one message. */
	maxMentions: 500,
	/** Zero-width / invisible characters. */
	maxInvisibleChars: 2_000,
	/** Combining diacritics (zalgo) as a fraction of visible chars. */
	maxCombiningRatio: 0.5,
	/** Minimum text length before the combining ratio applies. */
	combiningMinLength: 20,
	/** Nested quoted-message depth. */
	maxQuotedDepth: 4,
	/** Score needed to flag the message. */
	scoreThreshold: 2
};

const INVISIBLE_RE = /[\u200b-\u200f\u2060-\u2064\ufeff]/g;
const RTL_OVERRIDE_RE = /[\u202a-\u202e\u2066-\u2069]/;
const COMBINING_RE = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u06d6-\u06dc\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\ufe20-\ufe2f]/g;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const collectTexts = (message, depth = 0, out = { texts: [], mentions: 0, quotedDepth: depth }) => {
	if (!message || typeof message !== 'object' || depth > 8) {
		return out;
	}
	for (const value of Object.values(message)) {
		if (!value || typeof value !== 'object') {
			if (typeof value === 'string' && value.length > 64) {
				out.texts.push(value);
			}
			continue;
		}
		if (typeof value.text === 'string') {
			out.texts.push(value.text);
		}
		if (typeof value.caption === 'string') {
			out.texts.push(value.caption);
		}
		const ctx = value.contextInfo;
		if (ctx) {
			out.mentions += ctx.mentionedJid?.length || 0;
			if (ctx.quotedMessage) {
				out.quotedDepth = Math.max(out.quotedDepth, depth + 1);
				collectTexts(ctx.quotedMessage, depth + 1, out);
			}
		}
		if (value.message) {
			collectTexts(value.message, depth, out);
		}
	}
	if (typeof message.conversation === 'string') {
		out.texts.push(message.conversation);
	}
	return out;
};

/**
 * Pure threat analysis of a WAMessage (or bare message content).
 * Returns `{ threat, score, reasons, stats }` — never throws.
 */
export const analyzeMessageThreat = (msg, thresholds = {}) => {
	const t = { ...DEFAULT_THREAT_THRESHOLDS, ...thresholds };
	const reasons = [];
	let score = 0;
	const message = msg?.message || msg || {};
	let stats = { textLength: 0, mentions: 0, invisible: 0, combiningRatio: 0, quotedDepth: 0 };
	try {
		const { texts, mentions, quotedDepth } = collectTexts(message);
		const joined = texts.join('');
		const invisible = (joined.match(INVISIBLE_RE) || []).length;
		const combining = (joined.match(COMBINING_RE) || []).length;
		const visibleLength = Math.max(1, joined.length - invisible - combining);
		stats = {
			textLength: joined.length,
			mentions,
			invisible,
			combiningRatio: combining / visibleLength,
			quotedDepth
		};
		if (joined.length > t.maxTextLength) {
			score += 2;
			reasons.push('hugeText');
		}
		if (mentions > t.maxMentions) {
			score += 2;
			reasons.push('mentionBomb');
		}
		if (invisible > t.maxInvisibleChars) {
			score += 1;
			reasons.push('invisibleFlood');
		}
		if (joined.length >= t.combiningMinLength && stats.combiningRatio > t.maxCombiningRatio) {
			score += 1;
			reasons.push('zalgo');
		}
		if (RTL_OVERRIDE_RE.test(joined)) {
			score += 1;
			reasons.push('rtlOverride');
		}
		if (quotedDepth > t.maxQuotedDepth) {
			score += 1;
			reasons.push('deepNesting');
		}
	} catch {
		// analysis must never throw on adversarial input
	}
	return { threat: score >= t.scoreThreshold, score, reasons, stats };
};

/**
 * Clean a text for safe display/processing: strips control chars and
 * directional overrides, caps invisible characters and zalgo stacking.
 */
export const sanitizeText = (text, options = {}) => {
	const { maxCombiningPerChar = 2, keepInvisible = 0 } = options;
	let s = String(text ?? '');
	s = s.replace(CONTROL_RE, '');
	s = s.replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
	let invisibleSeen = 0;
	s = s.replace(INVISIBLE_RE, () => (invisibleSeen++ < keepInvisible ? '\u200b' : ''));
	// cap consecutive combining marks (zalgo flattening)
	s = s.replace(/(\p{M}{2})\p{M}+/gu, (m, keep) => keep.slice(0, maxCombiningPerChar));
	return s;
};

export const createBugShield = (options = {}) => {
	const {
		thresholds = {},
		autoDelete = false,
		groupsOnly = false,
		includeFromMe = false,
		exemptUsers = []
	} = options;

	const exempt = new Set(exemptUsers);
	const detectedCbs = new Set();
	const errorCbs = new Set();
	let boundSock = null;
	let boundHandler = null;
	let scanned = 0;
	let blocked = 0;
	// JAP@Upgrade: which attack patterns are hitting us, per reason.
	const reasonCounts = new Map();

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the upsert pipeline
			}
		}
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
			const sender = msg.key.participant || chat;
			if (exempt.has(sender)) {
				continue;
			}
			scanned++;
			const analysis = analyzeMessageThreat(msg, thresholds);
			if (!analysis.threat) {
				continue;
			}
			blocked++;
			for (const reason of analysis.reasons) {
				reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
			}
			let deleted = false;
			if (autoDelete && sock) {
				try {
					await sock.sendMessage(chat, { delete: msg.key });
					deleted = true;
				} catch (error) {
					emit(errorCbs, { msg, error });
				}
			}
			emit(detectedCbs, { msg, key: msg.key, chat, sender, ...analysis, deleted });
		}
	};

	return {
		handler,
		analyze: analyzeMessageThreat,
		bind(sock) {
			boundSock = sock;
			boundHandler = (events) => handler(events, sock).catch(() => { });
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
		},
		get stats() {
			return { scanned, blocked };
		},
		/** JAP@Upgrade: detection counts per reason (mentionBomb: 4, …). */
		getReasonStats() {
			return Object.fromEntries(reasonCounts);
		}
	};
};
