/**
 * lib/Utils/read-receipts.js — a global "do not send read receipts" switch.
 *
 * Privacy settings control this account-wide on WhatsApp's side, but a bot often wants to
 * suppress receipts for a single run (a scraper, a logger, a maintenance pass) without
 * touching the user's real privacy setting. This is that switch: local, immediate, and
 * reversible.
 *
 * Part of @japofc/baileys.
 */
let blocked = false;
let blockedChats = new Set();

/** Stop sending read receipts (optionally only for the chats given). Returns the new state. */
export const setBlockReadReceipts = (value = true, { chats } = {}) => {
    if (Array.isArray(chats) && chats.length) {
        for (const chat of chats) {
            if (value) {
                blockedChats.add(String(chat));
            }
            else {
                blockedChats.delete(String(chat));
            }
        }
        return getBlockReadReceipts();
    }
    blocked = !!value;
    return getBlockReadReceipts();
};

/** `{ all, chats }` — whether receipts are blocked globally, and the per-chat list. */
export const getBlockReadReceipts = () => ({ all: blocked, chats: [...blockedChats] });

/** Un-block everything (global switch and every per-chat entry). */
export const clearBlockReadReceipts = () => {
    blocked = false;
    blockedChats = new Set();
    return getBlockReadReceipts();
};

/** Should a read receipt for this chat be suppressed right now? */
export const isReadReceiptBlocked = (jid) => blocked || (!!jid && blockedChats.has(String(jid)));
