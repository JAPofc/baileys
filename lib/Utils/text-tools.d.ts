/**
 * JAP@Add --- Type declarations for text/JID parsing helpers + broadcast sender.
 */

/** Extract `@<number>` mentions from text → full jids, de-duplicated, in order. */
export declare const parseMentions: (text: string) => string[];

/** Pull the invite code out of a chat.whatsapp.com link (or text containing one). */
export declare const extractGroupInviteCode: (link: string) => string | null;

/** Join a group from an invite link or bare code (extract + groupAcceptInvite). */
export declare const joinGroupViaLink: (sock: any, linkOrCode: string) => Promise<any>;

export interface BroadcastProgress {
    jid: string;
    index: number;
    total: number;
    ok: boolean;
}

export interface BroadcastReport {
    sent: string[];
    failed: Array<{ jid: string; error: unknown }>;
    total: number;
}

export interface BroadcastOptions {
    /** Pause between sends in ms. Default 1000. Keep >= 1000 to avoid rate limits. */
    delayMs?: number;
    /** Called after every attempt (successful or not). */
    onProgress?: (p: BroadcastProgress) => void;
    /** Forwarded to sock.sendMessage as its third argument. */
    sendOptions?: any;
}

/** Send one message to many jids with pacing + per-jid outcomes; never throws mid-run. */
export declare const sendBroadcast: (
    sock: any,
    jids: string[],
    content: any,
    options?: BroadcastOptions
) => Promise<BroadcastReport>;
