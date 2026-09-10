export interface StatRow {
    jid: string;
    count: number;
}

export interface GhostEntry {
    jid: string;
    isTotalGhost: boolean;
    lastActive?: number;
}

/** Group activity tracking: message/sticker counts, leaderboards, ghost detection. */
export class StatsManager {
    constructor(db: any, groupMetaFn: (groupJid: string) => Promise<any>);
    /** Async factory (better-sqlite3 is lazy-loaded). Replaces `new StatsManager(dbPath, …)`. */
    static create(dbPath: string, groupMetaFn: (groupJid: string) => Promise<any>): Promise<StatsManager>;
    /** Record a message observation for stats. */
    observeMessage(groupJid: string, userJid: string, isSticker?: boolean): void;
    /** Top message senders for a group. */
    getTopUsers(groupJid: string, limit?: number): StatRow[];
    /** Top sticker senders for a group. */
    getTopStickers(groupJid: string, limit?: number): StatRow[];
    /** Detect inactive members ("ghosts"). Throws Boom(503) when disconnected. */
    getGhosts(groupJid: string, socketConnected: boolean, inactiveDays?: number): Promise<GhostEntry[]>;
    close(): void;
}
