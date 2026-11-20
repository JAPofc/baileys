/**
 * Collapse jids that resolve to the same user, keeping the first occurrence and preserving
 * order. Used before the USync device fan-out so a user listed twice is not enumerated
 * twice (BUGREPORT §2.46).
 */
export declare function dedupeJidsByUser<T extends { jid: string; user?: string }>(entries: T[] | null | undefined): T[];

/**
 * Collapse duplicate device entries, keyed by user + device index (so `user@server` and
 * `user:0@server` count as the same device). Keeps the first occurrence, preserves order.
 */
export declare function dedupeDeviceList<T extends { jid?: string; user?: string; device?: number }>(devices: T[] | null | undefined): T[];
