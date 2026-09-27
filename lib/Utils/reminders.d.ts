/** Reminders — parse human durations, arm timers, persist across restarts. */

/** '90s', '10m', '1h30m', '2d 4h' → ms, or null when unparseable. */
export declare const parseDuration: (input: string) => number | null;

export interface Reminder {
	id: number;
	chat: string;
	user: string;
	text: string;
	dueAt: number;
	createdAt: number;
	/** Set when restored past its due time. */
	late?: boolean;
}

export interface ReminderManagerOptions {
	/** Max pending reminders per user. Default 25. */
	maxPerUser?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface ReminderManager {
	/** Schedule with `inMs` (relative) or `atMs` (absolute). Returns the id. */
	add(reminder: { chat: string; user: string; text?: string; inMs?: number; atMs?: number }): number;
	cancel(id: number): boolean;
	list(filter?: { chat?: string; user?: string }): Reminder[];
	onDue(cb: (reminder: Reminder) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	/** Re-arms pending reminders; overdue ones fire immediately (late: true). */
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createReminderManager: (options?: ReminderManagerOptions) => ReminderManager;
