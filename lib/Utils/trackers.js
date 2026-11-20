// JAP@Add --- event trackers: reaction / receipt / presence.
// Three tiny state machines over events the socket already emits, answering
// the questions every bot ends up hand-rolling:
//   - "who reacted what on this message?"        -> createReactionTracker
//   - "who has my group message been read by?"   -> createReceiptTracker
//   - "is this user online / typing right now?"  -> createPresenceTracker
// Each returns pure handler functions (fully unit-testable) plus a `bind(sock)`
// convenience that wires them to the right events and returns an unsubscribe.
import { proto } from '../../WAProto/index.js';

const keyStr = (key) => `${key?.remoteJid}:${key?.id}`;

/** Evict the oldest entry once a Map grows past `max` (insertion order = age). */
const capMap = (map, max) => {
    while (map.size > max) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
};

// ── Reactions ──────────────────────────────────────────────────────────────
/**
 * Track reactions per message. Wire `.handler` into `sock.ev.on('messages.reaction', ...)`
 * (or call `.bind(sock)`). An empty reaction text is a removal, exactly as WA sends it.
 */
export const createReactionTracker = ({ maxMessages = 5000 } = {}) => {
    const reactions = new Map(); // keyStr -> Map<userJid, { emoji, at }>
    const listeners = [];
    const handler = (events) => {
        for (const { reaction, key } of events ?? []) {
            if (!key?.id || !key.remoteJid) {
                continue;
            }
            const id = keyStr(key);
            let perUser = reactions.get(id);
            if (!perUser) {
                perUser = new Map();
                reactions.set(id, perUser);
                capMap(reactions, maxMessages);
            }
            const user = reaction?.key?.participant || reaction?.key?.remoteJid || 'unknown';
            const emoji = reaction?.text ?? '';
            const removed = !emoji;
            const at = Number(reaction?.senderTimestampMs) || Date.now();
            if (removed) {
                perUser.delete(user);
            }
            else {
                perUser.set(user, { emoji, at });
            }
            const info = { key, user, emoji, removed, fromMe: !!reaction?.key?.fromMe, at };
            for (const cb of listeners) {
                try {
                    cb(info);
                }
                catch { }
            }
        }
    };
    return {
        handler,
        /** All current reactions on a message: `[{ user, emoji, at }]`. */
        getReactions: (key) => Array.from(reactions.get(keyStr(key))?.entries() ?? []).map(([user, r]) => ({ user, ...r })),
        /** Reactions grouped by emoji: `{ '👍': [jid, ...], ... }`. */
        getSummary: (key) => {
            const out = {};
            for (const [user, { emoji }] of reactions.get(keyStr(key)) ?? []) {
                (out[emoji] = out[emoji] ?? []).push(user);
            }
            return out;
        },
        onReaction: (cb) => {
            listeners.push(cb);
            return () => listeners.splice(listeners.indexOf(cb) >>> 0, 1);
        },
        bind: (sock) => {
            sock.ev.on('messages.reaction', handler);
            return () => sock.ev.off('messages.reaction', handler);
        },
        get size() {
            return reactions.size;
        },
        clear: () => reactions.clear()
    };
};

// ── Receipts ───────────────────────────────────────────────────────────────
const STATUS = proto.WebMessageInfo.Status;

/**
 * Track delivery/read/played receipts per message. Groups report per-participant
 * via `message-receipt.update`; DMs report via `messages.update` status changes.
 * Read implies delivered (a user never appears in `read` without `delivered`).
 */
export const createReceiptTracker = ({ maxMessages = 5000 } = {}) => {
    const receipts = new Map(); // keyStr -> { key, delivered: Map, read: Map, played: Map }
    const readListeners = [];
    const entryFor = (key) => {
        const id = keyStr(key);
        let e = receipts.get(id);
        if (!e) {
            e = { key, delivered: new Map(), read: new Map(), played: new Map() };
            receipts.set(id, e);
            capMap(receipts, maxMessages);
        }
        return e;
    };
    const markRead = (e, user, at) => {
        if (!e.read.has(user)) {
            e.read.set(user, at);
            for (const cb of readListeners) {
                try {
                    cb({ key: e.key, user, at });
                }
                catch { }
            }
        }
        if (!e.delivered.has(user)) {
            e.delivered.set(user, at);
        }
    };
    /** For `sock.ev.on('message-receipt.update', ...)` — group/status receipts. */
    const receiptHandler = (updates) => {
        for (const { key, receipt } of updates ?? []) {
            if (!key?.id || !receipt?.userJid) {
                continue;
            }
            const e = entryFor(key);
            const user = receipt.userJid;
            if (receipt.receiptTimestamp) {
                if (!e.delivered.has(user)) {
                    e.delivered.set(user, Number(receipt.receiptTimestamp));
                }
            }
            if (receipt.readTimestamp) {
                markRead(e, user, Number(receipt.readTimestamp));
            }
            if (receipt.playedTimestamp) {
                e.played.set(user, Number(receipt.playedTimestamp));
                markRead(e, user, Number(receipt.playedTimestamp));
            }
        }
    };
    /** For `sock.ev.on('messages.update', ...)` — DM status changes. */
    const statusHandler = (updates) => {
        for (const { key, update } of updates ?? []) {
            const status = update?.status;
            if (!key?.id || typeof status === 'undefined' || !key.remoteJid) {
                continue;
            }
            const e = entryFor(key);
            const user = key.remoteJid;
            const at = Number(update.messageTimestamp) || Date.now();
            if (status >= STATUS.DELIVERY_ACK && !e.delivered.has(user)) {
                e.delivered.set(user, at);
            }
            if (status >= STATUS.READ) {
                markRead(e, user, at);
            }
            if (status === STATUS.PLAYED) {
                e.played.set(user, at);
            }
        }
    };
    return {
        receiptHandler,
        statusHandler,
        /** `{ delivered: [jid], read: [jid], played: [jid] }` for a message. */
        getReceipts: (key) => {
            const e = receipts.get(keyStr(key));
            return {
                delivered: Array.from(e?.delivered.keys() ?? []),
                read: Array.from(e?.read.keys() ?? []),
                played: Array.from(e?.played.keys() ?? [])
            };
        },
        /** Convenience: has `user` read this message? Omit user for "read by anyone". */
        isReadBy: (key, user) => {
            const e = receipts.get(keyStr(key));
            if (!e) {
                return false;
            }
            return user ? e.read.has(user) : e.read.size > 0;
        },
        /** Fires once per user per message on first read. */
        onRead: (cb) => {
            readListeners.push(cb);
            return () => readListeners.splice(readListeners.indexOf(cb) >>> 0, 1);
        },
        bind: (sock) => {
            sock.ev.on('message-receipt.update', receiptHandler);
            sock.ev.on('messages.update', statusHandler);
            return () => {
                sock.ev.off('message-receipt.update', receiptHandler);
                sock.ev.off('messages.update', statusHandler);
            };
        },
        get size() {
            return receipts.size;
        },
        clear: () => receipts.clear()
    };
};

// ── Presence ───────────────────────────────────────────────────────────────
const TYPING = new Set(['composing', 'recording']);

/**
 * Track who is online / typing and when they were last seen. Wire `.handler`
 * into `sock.ev.on('presence.update', ...)` (or `.bind(sock)`). Remember: WA
 * only streams presence for jids you called `sock.presenceSubscribe(jid)` on.
 */
export const createPresenceTracker = ({ maxUsers = 10_000 } = {}) => {
    const users = new Map(); // userJid -> { presence, lastSeen, updatedAt, chatId }
    const listeners = [];
    const handler = ({ id, presences } = {}) => {
        for (const [user, p] of Object.entries(presences ?? {})) {
            const prev = users.get(user);
            const next = {
                presence: p?.lastKnownPresence ?? 'unavailable',
                lastSeen: p?.lastSeen ?? prev?.lastSeen,
                updatedAt: Date.now(),
                chatId: id
            };
            users.delete(user); // re-insert to keep Map ordered by recency
            users.set(user, next);
            capMap(users, maxUsers);
            if (prev?.presence !== next.presence) {
                const info = { chatId: id, user, presence: next.presence, lastSeen: next.lastSeen, wasPresence: prev?.presence };
                for (const cb of listeners) {
                    try {
                        cb(info);
                    }
                    catch { }
                }
            }
        }
    };
    return {
        handler,
        get: (user) => users.get(user),
        isOnline: (user) => {
            const p = users.get(user)?.presence;
            return p === 'available' || TYPING.has(p);
        },
        isTyping: (user) => TYPING.has(users.get(user)?.presence),
        getOnlineUsers: () => Array.from(users.entries()).filter(([, u]) => u.presence === 'available' || TYPING.has(u.presence)).map(([jid]) => jid),
        /** Fires on every presence CHANGE (not on repeats of the same state). */
        onChange: (cb) => {
            listeners.push(cb);
            return () => listeners.splice(listeners.indexOf(cb) >>> 0, 1);
        },
        bind: (sock) => {
            sock.ev.on('presence.update', handler);
            return () => sock.ev.off('presence.update', handler);
        },
        get size() {
            return users.size;
        },
        clear: () => users.clear()
    };
};
