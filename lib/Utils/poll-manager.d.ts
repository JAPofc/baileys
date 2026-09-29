/**
 * Stateful poll manager — the missing companion to
 * `getAggregateVotesInPollMessage`. Register a poll once, feed it decrypted
 * votes, and read live tallies where each voter counts once with their latest
 * choice. Accepts option names, sha256 hex hashes, or raw hash Buffers.
 */
export interface PollTallyRow {
    name: string;
    hash: string;
    count: number;
    voters: string[];
}
export interface PollWinner {
    winners: string[];
    count: number;
}
export interface PollManager {
    register(pollMsg: any, extra?: { id?: string; creator?: string; selectableCount?: number; at?: number }): string | null;
    has(idOrMsg: string | any): boolean;
    applyVote(idOrMsg: string | any, voterJid: string, selection?: Array<string | Uint8Array> | string | Uint8Array): PollTallyRow[] | null;
    applyUpdate(idOrMsg: string | any, update: any): PollTallyRow[] | null;
    getVoterChoice(idOrMsg: string | any, voterJid: string): string[];
    totalVoters(idOrMsg: string | any): number;
    tally(idOrMsg: string | any): PollTallyRow[];
    winner(idOrMsg: string | any): PollWinner | null;
    render(idOrMsg: string | any, opts?: { width?: number }): string;
    list(): string[];
    reset(idOrMsg?: string | any): void;
}
export declare const createPollManager: (options?: { meId?: string }) => PollManager;
