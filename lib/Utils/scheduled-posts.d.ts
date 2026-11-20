/**
 * JAP@Add --- Type declarations for the status/channel schedulers.
 */
export interface TimedPostOptions {
    repeatMs?: number;
    maxRepeats?: number;
}
export interface StatusPostOptions extends TimedPostOptions {
    jids?: string[];
}
declare class BaseTimedPoster {
    protected sock: any;
    constructor(sock: any, opts?: {
        onError?: (err: any, id: string) => void;
    });
    cancel(id: string): boolean;
    clear(): void;
    pending(): {
        id: string;
        runs: number;
    }[];
}
export declare class StatusScheduler extends BaseTimedPoster {
    schedule(content: any, when: Date | number, opts?: StatusPostOptions): string;
    scheduleIn(content: any, delayMs: number, opts?: StatusPostOptions): string;
}
export declare class ChannelScheduler extends BaseTimedPoster {
    schedule(channelJid: string, content: any, when: Date | number, opts?: TimedPostOptions): string;
    scheduleIn(channelJid: string, content: any, delayMs: number, opts?: TimedPostOptions): string;
}
