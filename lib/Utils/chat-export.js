// JAP@Add --- Chat export & statistics (offline, pure logic)
//
// Mirrors the official WhatsApp "Export chat" text format from an array of
// WAMessage objects (e.g. collected via a store, anti-delete cache, or
// messages.upsert). Also produces JSON/CSV exports and per-chat statistics.
// No network, no media downloads — media messages are rendered as the same
// placeholders the official export uses ("<Media omitted>", or a descriptive
// tag with exportMediaPlaceholders: 'descriptive').
import { extractMessageText } from './message-search.js';
import { toNumber } from './generics.js';
const unwrap = (content) => {
    if (!content) {
        return content;
    }
    return (content.ephemeralMessage?.message ||
        content.viewOnceMessage?.message ||
        content.viewOnceMessageV2?.message ||
        content.documentWithCaptionMessage?.message ||
        content.editedMessage?.message ||
        content);
};
/** Message kind used for placeholders + statistics. */
export const classifyExportMessage = (msg) => {
    const c = unwrap(msg?.message);
    if (!c) {
        return 'other';
    }
    if (c.conversation || c.extendedTextMessage) {
        return 'text';
    }
    if (c.imageMessage) {
        return 'image';
    }
    if (c.videoMessage) {
        return c.videoMessage.gifPlayback ? 'gif' : 'video';
    }
    if (c.audioMessage) {
        return c.audioMessage.ptt ? 'voice note' : 'audio';
    }
    if (c.stickerMessage) {
        return 'sticker';
    }
    if (c.documentMessage) {
        return 'document';
    }
    if (c.locationMessage || c.liveLocationMessage) {
        return 'location';
    }
    if (c.contactMessage || c.contactsArrayMessage) {
        return 'contact';
    }
    if (c.pollCreationMessage || c.pollCreationMessageV2 || c.pollCreationMessageV3) {
        return 'poll';
    }
    if (c.reactionMessage) {
        return 'reaction';
    }
    if (c.protocolMessage) {
        return 'protocol';
    }
    return 'other';
};
const MEDIA_KINDS = new Set(['image', 'video', 'gif', 'audio', 'voice note', 'sticker', 'document', 'location', 'contact']);
const pad = (n) => String(n).padStart(2, '0');
/** Official-style export timestamp: `DD/MM/YYYY, HH.MM` (24h). */
const formatStamp = (tsSeconds) => {
    const d = new Date(tsSeconds * 1000);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
};
const timestampOf = (msg) => toNumber(msg?.messageTimestamp) || 0;
const senderNameOf = (msg, resolveName) => {
    const jid = msg?.key?.participant || msg?.key?.remoteJid || '';
    if (resolveName) {
        const resolved = resolveName(jid, msg);
        if (resolved) {
            return resolved;
        }
    }
    if (msg?.pushName) {
        return msg.pushName;
    }
    return jid.split('@')[0] || 'unknown';
};
const lineTextOf = (msg, kind, mediaPlaceholders) => {
    if (kind === 'text') {
        return extractMessageText(msg) || '';
    }
    if (kind === 'poll') {
        const c = unwrap(msg.message);
        const poll = c.pollCreationMessage || c.pollCreationMessageV2 || c.pollCreationMessageV3;
        return `POLL: ${poll?.name ?? ''}`.trim();
    }
    if (kind === 'reaction') {
        const c = unwrap(msg.message);
        return `reacted ${c.reactionMessage?.text ?? ''}`.trim();
    }
    if (MEDIA_KINDS.has(kind)) {
        if (mediaPlaceholders === 'descriptive') {
            const caption = extractMessageText(msg);
            return caption ? `<${kind}: ${caption}>` : `<${kind}>`;
        }
        return '<Media omitted>';
    }
    return '';
};
const sortAscending = (messages) => [...messages].sort((a, b) => timestampOf(a) - timestampOf(b));
/**
 * Render messages as an official-WhatsApp-style "Export chat" transcript.
 *
 * ```
 * 14/09/2026, 10.32 - J.AP: halo!
 * 14/09/2026, 10.33 - Rina: <Media omitted>
 * ```
 *
 * Options:
 * - `resolveName(jid, msg)`  → display name (falls back to pushName, then number)
 * - `mediaPlaceholders`      → 'omitted' (default, official style) | 'descriptive'
 * - `includeReactions`       → include reaction lines (default false, like official)
 * - `header`                 → custom first line; pass '' to disable
 */
export const exportChatAsText = (messages, options = {}) => {
    if (!Array.isArray(messages)) {
        throw new TypeError('exportChatAsText: messages must be an array');
    }
    const { resolveName, mediaPlaceholders = 'omitted', includeReactions = false, header } = options;
    const lines = [];
    const headerLine = header !== undefined
        ? header
        : 'Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.';
    if (headerLine) {
        lines.push(`${messages.length ? formatStamp(timestampOf(sortAscending(messages)[0])) : ''} - ${headerLine}`.trim());
    }
    for (const msg of sortAscending(messages)) {
        const kind = classifyExportMessage(msg);
        if (kind === 'protocol' || kind === 'other') {
            continue;
        }
        if (kind === 'reaction' && !includeReactions) {
            continue;
        }
        const text = lineTextOf(msg, kind, mediaPlaceholders);
        if (!text) {
            continue;
        }
        const stamp = formatStamp(timestampOf(msg));
        const who = senderNameOf(msg, resolveName);
        // multi-line messages: official export keeps continuation lines bare
        const [first, ...restLines] = String(text).split('\n');
        lines.push(`${stamp} - ${who}: ${first}`);
        for (const cont of restLines) {
            lines.push(cont);
        }
    }
    return lines.join('\n');
};
/** Export as structured JSON rows (stable shape for archiving/processing). */
export const exportChatAsJSON = (messages, options = {}) => {
    if (!Array.isArray(messages)) {
        throw new TypeError('exportChatAsJSON: messages must be an array');
    }
    const { resolveName } = options;
    return sortAscending(messages).map((msg) => {
        const kind = classifyExportMessage(msg);
        return {
            id: msg?.key?.id ?? null,
            timestamp: timestampOf(msg),
            fromMe: !!msg?.key?.fromMe,
            senderJid: msg?.key?.participant || msg?.key?.remoteJid || null,
            senderName: senderNameOf(msg, resolveName),
            kind,
            text: kind === 'text' ? (extractMessageText(msg) || '') : (extractMessageText(msg) || null)
        };
    });
};
const csvEscape = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Export as CSV (same rows as exportChatAsJSON; RFC 4180 quoting). */
export const exportChatAsCSV = (messages, options = {}) => {
    const rows = exportChatAsJSON(messages, options);
    const headers = ['id', 'timestamp', 'fromMe', 'senderJid', 'senderName', 'kind', 'text'];
    const out = [headers.join(',')];
    for (const row of rows) {
        out.push(headers.map((h) => csvEscape(row[h])).join(','));
    }
    return out.join('\n');
};
/**
 * Per-chat statistics: totals, per-sender counts, per-kind counts, busiest
 * hour/day, first/last timestamps, and the top words (≥ minWordLength,
 * lowercased, mentions/URLs stripped).
 */
export const chatStatistics = (messages, options = {}) => {
    if (!Array.isArray(messages)) {
        throw new TypeError('chatStatistics: messages must be an array');
    }
    const { resolveName, topWords = 10, minWordLength = 3 } = options;
    const stats = {
        total: 0,
        bySender: {},
        byKind: {},
        byHour: Array.from({ length: 24 }, () => 0),
        byWeekday: Array.from({ length: 7 }, () => 0),
        firstTimestamp: null,
        lastTimestamp: null,
        topWords: []
    };
    const wordCounts = new Map();
    for (const msg of messages) {
        const kind = classifyExportMessage(msg);
        if (kind === 'protocol' || kind === 'other') {
            continue;
        }
        stats.total++;
        const who = senderNameOf(msg, resolveName);
        stats.bySender[who] = (stats.bySender[who] || 0) + 1;
        stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
        const ts = timestampOf(msg);
        if (ts) {
            const d = new Date(ts * 1000);
            stats.byHour[d.getHours()]++;
            stats.byWeekday[d.getDay()]++;
            if (stats.firstTimestamp === null || ts < stats.firstTimestamp) {
                stats.firstTimestamp = ts;
            }
            if (stats.lastTimestamp === null || ts > stats.lastTimestamp) {
                stats.lastTimestamp = ts;
            }
        }
        if (kind === 'text') {
            const text = (extractMessageText(msg) || '')
                .toLowerCase()
                .replace(/https?:\/\/\S+/g, ' ')
                .replace(/@\d{5,20}/g, ' ');
            for (const word of text.split(/[^\p{L}\p{N}_']+/u)) {
                if (word.length >= minWordLength) {
                    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
                }
            }
        }
    }
    stats.topWords = [...wordCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, topWords)
        .map(([word, count]) => ({ word, count }));
    return stats;
};
