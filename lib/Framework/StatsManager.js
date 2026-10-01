/**
 * lib/Framework/StatsManager.js
 * Author: J.AP (@japofc/baileys)
 *
 * Group activity tracking: per-member message/sticker counts, leaderboards, and
 * "ghost" (inactive-member) detection. All participant JIDs are normalised so
 * PN / LID / device (:0, :42) variants collapse to a single row. better-sqlite3
 * is an optional peer dep, loaded lazily via the async `create()` factory.
 */
import { Boom } from '@hapi/boom';
import { jidNormalizedUser } from '../WABinary/index.js';

/** Lazily load the optional better-sqlite3 dependency with a helpful error. */
async function loadBetterSqlite3() {
    try {
        const mod = await import('better-sqlite3');
        return mod.default ?? mod;
    } catch (err) {
        const helpful = new Error('`better-sqlite3` is required for the Framework StatsManager. Install it as a peer dependency: `npm install better-sqlite3` (or `yarn add better-sqlite3`).');
        helpful.cause = err;
        throw helpful;
    }
}

export class StatsManager {
    constructor(db, groupMetaFn) {
        this.db = db;
        this.groupMetaFn = groupMetaFn;
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS group_stats (
                group_jid     TEXT NOT NULL,
                user_jid      TEXT NOT NULL,
                msg_count     INTEGER NOT NULL DEFAULT 0,
                sticker_count INTEGER NOT NULL DEFAULT 0,
                last_active   INTEGER NOT NULL,
                PRIMARY KEY (group_jid, user_jid)
            )
        `);
        this.insertStmt = this.db.prepare(`
            INSERT INTO group_stats (group_jid, user_jid, msg_count, sticker_count, last_active)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(group_jid, user_jid) DO UPDATE SET
                msg_count     = msg_count + excluded.msg_count,
                sticker_count = sticker_count + excluded.sticker_count,
                last_active   = excluded.last_active
        `);
        this.getStatsStmt = this.db.prepare('SELECT user_jid, msg_count, sticker_count, last_active FROM group_stats WHERE group_jid = ?');
        this.getTopMsgStmt = (limit) => this.db.prepare(`SELECT user_jid AS jid, msg_count AS count FROM group_stats WHERE group_jid = ? ORDER BY msg_count DESC LIMIT ${limit}`);
        this.getTopStickerStmt = (limit) => this.db.prepare(`SELECT user_jid AS jid, sticker_count AS count FROM group_stats WHERE group_jid = ? ORDER BY sticker_count DESC LIMIT ${limit}`);
    }

    /** Async factory — opens the database once better-sqlite3 is loaded. */
    static async create(dbPath, groupMetaFn) {
        const Database = await loadBetterSqlite3();
        return new StatsManager(new Database(dbPath), groupMetaFn);
    }

    /** Record one message observation (both JIDs normalised before storing). */
    observeMessage(groupJid, userJid, isSticker) {
        this.insertStmt.run(
            jidNormalizedUser(groupJid),
            jidNormalizedUser(userJid),
            1,
            isSticker ? 1 : 0,
            Date.now()
        );
    }

    #sanitizeLimit(limit) {
        return Math.max(1, Math.floor(limit));
    }

    /** Top message senders for a group. */
    getTopUsers(groupJid, limit = 10) {
        return this.getTopMsgStmt(this.#sanitizeLimit(limit)).all(jidNormalizedUser(groupJid));
    }

    /** Top sticker senders for a group. */
    getTopStickers(groupJid, limit = 10) {
        return this.getTopStickerStmt(this.#sanitizeLimit(limit)).all(jidNormalizedUser(groupJid));
    }

    /** Find members who are inactive ("ghosts") — never seen, or silent past the cutoff. */
    async getGhosts(groupJid, socketConnected, inactiveDays = 30) {
        if (!socketConnected) {
            throw new Boom('Socket not connected — cannot fetch group metadata for ghost detection', { statusCode: 503 });
        }
        const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
        const lastActiveByJid = new Map();
        for (const row of this.getStatsStmt.all(jidNormalizedUser(groupJid))) {
            lastActiveByJid.set(jidNormalizedUser(row.user_jid), row.last_active);
        }

        const groupMeta = await this.groupMetaFn(groupJid);
        return groupMeta.participants
            .map((p) => {
                const jid = jidNormalizedUser(p.id);
                const lastActive = lastActiveByJid.get(jid);
                if (!lastActive) return { jid, isTotalGhost: true };
                if (lastActive < cutoff) return { jid, isTotalGhost: false, lastActive };
                return null;
            })
            .filter((g) => g !== null);
    }

    close() {
        this.db.close();
    }
}
