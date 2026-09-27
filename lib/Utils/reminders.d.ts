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
	/** Interval for recurring reminders. */
	repeatMs?: number;
	/** Set on recurring firings. */
	recurring?: boolean;
}

export interface ReminderManagerOptions {
	/** Max pending reminders per user. Default 25. */
	maxPerUser?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface ReminderManager {
	/** Schedule with `inMs` (relative) or `atMs` (absolute). Returns the id. */
	add(reminder: { chat: string; user: string; text?: string; inMs?: number; atMs?: number; repeatMs?: number }): number;
	cancel(id: number): boolean;
	/** Push a pending reminder back by extraMs. Returns the new dueAt or null. */
	snooze(id: number, extraMs: number): number | null;
	list(filter?: { chat?: string; user?: string }): Reminder[];
	onDue(cb: (reminder: Reminder) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	/** Re-arms pending reminders; overdue ones fire immediately (late: true). */
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createReminderManager: (options?: ReminderManagerOptions) => ReminderManager;
