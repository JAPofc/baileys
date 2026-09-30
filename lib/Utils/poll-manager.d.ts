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
    /** Voters who currently pick a given option (by name or zero-based index). */
    getVotersFor(idOrMsg: string | any, option: string | number): string[];
    /** Freeze a poll: further votes are ignored and the frozen tally is returned. */
    close(idOrMsg: string | any): boolean;
    /** Re-open a previously closed poll. */
    reopen(idOrMsg: string | any): boolean;
    /** Is this poll registered and still accepting votes? */
    isOpen(idOrMsg: string | any): boolean;
    list(): string[];
    reset(idOrMsg?: string | any): void;
}
export declare const createPollManager: (options?: { meId?: string }) => PollManager;
