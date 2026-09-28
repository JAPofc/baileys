/** Task queue — bounded concurrency + retries; results never reject. */
export interface TaskOutcome<T = unknown> {
	ok: boolean;
	result?: T;
	error?: unknown;
	attempts: number;
}
export interface TaskQueue {
	push<T>(fn: () => T | Promise<T>, meta?: { id?: unknown }): Promise<TaskOutcome<T>>;
	pause(): void;
	resume(): void;
	/** Resolves when fully drained. */
	onIdle(): Promise<void>;
	onTaskDone(cb: (info: TaskOutcome & { id?: unknown }) => void): () => void;
	/** Drop queued (not running) tasks. Returns how many. */
	clearPending(): number;
	readonly stats: { done: number; failed: number; pending: number; running: number };
	readonly isPaused: boolean;
}
export declare const createTaskQueue: (options?: { concurrency?: number; retries?: number; retryDelayMs?: number }) => TaskQueue;
