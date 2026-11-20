/** A message key (remoteJid + id identify the message). */
type MsgKey = { remoteJid?: string; id?: string;[k: string]: any };

export interface ReactionInfo {
    key: MsgKey;
    user: string;
    emoji: string;
    removed: boolean;
    fromMe: boolean;
    at: number;
}

export interface ReactionTracker {
    /** Wire into `sock.ev.on('messages.reaction', handler)`. */
    handler: (events: Array<{ reaction: any; key: MsgKey }>) => void;
    /** All current reactions on a message. */
    getReactions: (key: MsgKey) => Array<{ user: string; emoji: string; at: number }>;
    /** Reactions grouped by emoji: `{ '👍': [jid, ...] }`. */
    getSummary: (key: MsgKey) => Record<string, string[]>;
    /** Fires per reaction event (adds AND removals). Returns unsubscribe. */
    onReaction: (cb: (info: ReactionInfo) => void) => () => void;
    /** Attach to the socket events; returns unsubscribe. */
    bind: (sock: any) => () => void;
    readonly size: number;
    clear: () => void;
}

/** Track who reacted what on which message (empty text = removal, as WA sends it). */
export function createReactionTracker(options?: { maxMessages?: number }): ReactionTracker;

export interface ReceiptTracker {
    /** Wire into `sock.ev.on('message-receipt.update', ...)` — group/status receipts. */
    receiptHandler: (updates: Array<{ key: MsgKey; receipt: any }>) => void;
    /** Wire into `sock.ev.on('messages.update', ...)` — DM status changes. */
    statusHandler: (updates: Array<{ key: MsgKey; update: any }>) => void;
    /** `{ delivered, read, played }` jid lists for a message (read implies delivered). */
    getReceipts: (key: MsgKey) => { delivered: string[]; read: string[]; played: string[] };
    /** Has `user` read this message? Omit user for "read by anyone". */
    isReadBy: (key: MsgKey, user?: string) => boolean;
    /** Fires once per user per message on first read. Returns unsubscribe. */
    onRead: (cb: (info: { key: MsgKey; user: string; at: number }) => void) => () => void;
    bind: (sock: any) => () => void;
    readonly size: number;
    clear: () => void;
}

/** Track delivery/read/played receipts per message (groups per-participant, DMs via status). */
export function createReceiptTracker(options?: { maxMessages?: number }): ReceiptTracker;

export interface PresenceTracker {
    /** Wire into `sock.ev.on('presence.update', handler)`. */
    handler: (update: { id?: string; presences?: Record<string, any> }) => void;
    get: (user: string) => { presence: string; lastSeen?: number; updatedAt: number; chatId?: string } | undefined;
    isOnline: (user: string) => boolean;
    isTyping: (user: string) => boolean;
    getOnlineUsers: () => string[];
    /** Fires on every presence CHANGE (not repeats). Returns unsubscribe. */
    onChange: (cb: (info: { chatId?: string; user: string; presence: string; lastSeen?: number; wasPresence?: string }) => void) => () => void;
    bind: (sock: any) => () => void;
    readonly size: number;
    clear: () => void;
}

/**
 * Track who is online/typing and last-seen times. WA only streams presence
 * for jids you called `sock.presenceSubscribe(jid)` on.
 */
export function createPresenceTracker(options?: { maxUsers?: number }): PresenceTracker;
export { };
