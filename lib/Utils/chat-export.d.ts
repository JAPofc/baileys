import type { proto } from '../../WAProto/index.js';
/** Message kind used for placeholders + statistics. */
export type ExportMessageKind = 'text' | 'image' | 'video' | 'gif' | 'audio' | 'voice note' | 'sticker' | 'document' | 'location' | 'contact' | 'poll' | 'reaction' | 'protocol' | 'other';
export declare const classifyExportMessage: (msg: proto.IWebMessageInfo) => ExportMessageKind;
export type ExportChatOptions = {
    /** Resolve a display name for a jid; falls back to pushName, then the number. */
    resolveName?: (jid: string, msg: proto.IWebMessageInfo) => string | undefined | null;
    /** 'omitted' (official style, default) renders `<Media omitted>`; 'descriptive' renders `<image: caption>` etc. */
    mediaPlaceholders?: 'omitted' | 'descriptive';
    /** Include reaction lines (official export skips them). Default false. */
    includeReactions?: boolean;
    /** Custom first line; pass '' to disable the encryption notice header. */
    header?: string;
};
/**
 * Render messages as an official-WhatsApp-style "Export chat" transcript:
 * `DD/MM/YYYY, HH.MM - Sender: text` with `<Media omitted>` placeholders.
 */
export declare const exportChatAsText: (messages: proto.IWebMessageInfo[], options?: ExportChatOptions) => string;
export type ExportedChatRow = {
    id: string | null;
    timestamp: number;
    fromMe: boolean;
    senderJid: string | null;
    senderName: string;
    kind: ExportMessageKind;
    text: string | null;
};
/** Export as structured JSON rows, sorted oldest-first. */
export declare const exportChatAsJSON: (messages: proto.IWebMessageInfo[], options?: Pick<ExportChatOptions, 'resolveName'>) => ExportedChatRow[];
/** Export as CSV (same rows as exportChatAsJSON; RFC 4180 quoting). */
export declare const exportChatAsCSV: (messages: proto.IWebMessageInfo[], options?: Pick<ExportChatOptions, 'resolveName'>) => string;
export type ChatStatistics = {
    total: number;
    bySender: Record<string, number>;
    byKind: Partial<Record<ExportMessageKind, number>>;
    /** Message count per hour of day (local time), index 0-23. */
    byHour: number[];
    /** Message count per weekday (local time), index 0 (Sunday) - 6 (Saturday). */
    byWeekday: number[];
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    topWords: Array<{ word: string; count: number }>;
};
/** Per-chat statistics: totals, per-sender/kind counts, busiest hour/day, top words. */
export declare const chatStatistics: (messages: proto.IWebMessageInfo[], options?: {
    resolveName?: (jid: string, msg: proto.IWebMessageInfo) => string | undefined | null;
    /** How many top words to return (default 10). */
    topWords?: number;
    /** Minimum word length counted (default 3). */
    minWordLength?: number;
}) => ChatStatistics;
