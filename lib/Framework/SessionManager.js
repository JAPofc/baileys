/**
 * lib/Framework/SessionManager.js
 * Author: J.AP (@japofc/baileys)
 *
 * Per-JID conversation session CRUD, backed by a SQLiteStore instance (created
 * via SQLiteStore.create()).
 */
export class SessionManager {
    constructor(store) {
        this.store = store;
    }

    key(jid) {
        return `session_${jid}`;
    }

    get(jid) {
        return this.store.get(this.key(jid));
    }

    set(jid, data) {
        this.store.set(this.key(jid), data);
    }

    update(jid, updater) {
        this.set(jid, updater(this.get(jid)));
    }

    delete(jid) {
        this.store.del(this.key(jid));
    }

    has(jid) {
        return this.get(jid) !== undefined;
    }
}
