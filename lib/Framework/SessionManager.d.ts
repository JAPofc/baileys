import type { SQLiteStore } from './Store/SQLiteStore.js';

/** Per-JID session CRUD backed by a SQLiteStore. */
export class SessionManager {
    constructor(store: SQLiteStore);
    store: SQLiteStore;
    key(jid: string): string;
    get(jid: string): Record<string, unknown>;
    set(jid: string, data: Record<string, unknown>): void;
    update(jid: string, updater: (prev: Record<string, unknown>) => Record<string, unknown>): void;
    delete(jid: string): void;
    has(jid: string): boolean;
}
