/**
 * JAP@Add --- Type declarations for the humanized sender.
 */
export interface HumanizeOptions {
    wpm?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    jitter?: number;
    typing?: boolean;
    queue?: boolean;
}
export declare const sendHumanized: (sock: any, jid: any, content: any, humanOpts?: HumanizeOptions, sendOptions?: any) => Promise<any>;
