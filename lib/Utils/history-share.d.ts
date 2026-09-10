export declare const getGroupHistoryFromStore: (store: any, groupJid: string, limit?: number) => any[];
export interface ShareGroupHistoryOptions {
    groupJid: string;
    members: string | string[];
    messages: any[];
    limit?: number;
    greeting?: string | boolean;
    delayMs?: number;
    forceForward?: boolean;
}
export declare const shareGroupHistory: (sock: any, opts: ShareGroupHistoryOptions) => Promise<{ groupJid: string; members: string[]; perMember: number; sent: number; failed: { member: string; error: string }[] }>;
