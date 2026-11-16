export interface BroadcastRecipientResult<R = any> {
    jid: string;
    ok: boolean;
    attempts: number;
    result?: R;
    error?: any;
}

export interface BroadcastSummary<R = any> {
    total: number;
    sent: number;
    failed: number;
    cancelled: boolean;
    skipped: number;
    results: BroadcastRecipientResult<R>[];
}

export interface BroadcastProgress {
    index: number;
    total: number;
    jid: string;
    ok: boolean;
    sent: number;
    failed: number;
    remaining: number;
}

export interface BroadcastHandle<R = any> {
    cancel(): void;
    readonly cancelled: boolean;
    done: Promise<BroadcastSummary<R>>;
}

export interface BroadcasterOptions<R = any> {
    send: (jid: string, message: any) => Promise<R>;
    throttleMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    onProgress?: (progress: BroadcastProgress) => void;
    sleep?: (ms: number) => Promise<void>;
}

export interface Broadcaster<R = any> {
    broadcast(
        recipients: string[],
        message: any | ((jid: string, index: number) => any | Promise<any>)
    ): BroadcastHandle<R>;
}

export function createBroadcaster<R = any>(opts: BroadcasterOptions<R>): Broadcaster<R>;

export type ScheduledJobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface ScheduledJobInfo {
    id: string;
    runAt: number;
    status: ScheduledJobStatus;
}

export interface SchedulerOptions {
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => any;
    clearTimer?: (handle: any) => void;
    onError?: (err: any, job: ScheduledJobInfo) => void;
}

export interface Scheduler {
    scheduleAt(runAt: number | Date, task: () => any | Promise<any>): string;
    scheduleAfter(ms: number, task: () => any | Promise<any>): string;
    cancel(id: string): boolean;
    cancelAll(): number;
    list(): ScheduledJobInfo[];
    readonly size: number;
}

export function createScheduler(opts?: SchedulerOptions): Scheduler;
