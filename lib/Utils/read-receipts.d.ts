/** Stop sending read receipts globally, or only for specific chats. */
export declare function setBlockReadReceipts(value?: boolean, opts?: { chats?: string[] }): { all: boolean; chats: string[] };
/** Current state of the switch. */
export declare function getBlockReadReceipts(): { all: boolean; chats: string[] };
/** Un-block everything. */
export declare function clearBlockReadReceipts(): { all: boolean; chats: string[] };
/** Should a read receipt for this chat be suppressed? */
export declare function isReadReceiptBlocked(jid?: string): boolean;
