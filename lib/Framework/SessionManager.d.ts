import type { SQLiteStore } from './Store/SQLiteStore.js';

/** Per-JID session CRUD backed by a SQLiteStore. */
export class SessionManager {
    constructor(store: SQLiteStore);
    store: SQLiteStore;
    key(jid: string): string;
    get(jid: string): any;
    set(jid: string, data: any): void;
    update(jid: string, updater: (prev: any) => any): void;
    delete(jid: string): void;
    has(jid: string): boolean;
}
