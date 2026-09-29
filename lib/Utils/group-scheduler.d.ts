/** Group scheduler — open/close groups on a daily schedule. */

export interface GroupScheduleRule {
	group: string;
	/** 'close' → announcement mode, 'open' → everyone can send. */
	action: 'open' | 'close';
	/** Local time "HH:MM" (24h). */
	at: string;
	/** Weekdays (0 = Sunday). Omit for every day. */
	days?: number[];
}

export interface GroupSchedulerOptions {
	/** Default 30000. */
	checkIntervalMs?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface GroupSchedulerAction {
	id: number;
	group: string;
	action: 'open' | 'close';
	setting: 'announcement' | 'not_announcement';
	at: number;
}

export interface GroupScheduler {
	add(rule: GroupScheduleRule): number;
	remove(id: number): boolean;
	list(): Array<GroupScheduleRule & { id: number; nextRun: number }>;
	/** Run one pass manually (fires every due rule). */
	tick(sock?: unknown): Promise<void>;
	start(sock: unknown): () => void;
	stop(): void;
	readonly isRunning: boolean;
	onAction(cb: (action: GroupSchedulerAction) => void): () => void;
	onError(cb: (info: { id: number; group: string; action: string; error: unknown }) => void): () => void;
	readonly size: number;
	clear(): void;
}

export declare const createGroupScheduler: (options?: GroupSchedulerOptions) => GroupScheduler;
