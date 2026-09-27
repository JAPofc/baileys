/** Birthday manager — remember, list and auto-congratulate. */

export interface BirthdayEntry {
	day: number;
	month: number;
	year?: number;
	/** Where to congratulate (group jid, etc). */
	chat?: string;
	lastCelebratedYear?: number;
}

export interface BirthdayEvent {
	user: string;
	chat?: string;
	day: number;
	month: number;
	age?: number;
}

export interface BirthdayManagerOptions {
	/** How often the daily check runs. Default 1h. */
	checkIntervalMs?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface BirthdayManager {
	set(user: string, entry: { day: number; month: number; year?: number; chat?: string }): BirthdayEntry;
	remove(user: string): boolean;
	get(user: string): BirthdayEntry | null;
	getToday(): Array<{ user: string; chat?: string; age?: number }>;
	getUpcoming(days?: number): Array<{ user: string; chat?: string; day: number; month: number; inDays: number }>;
	/** Run one check; fires onBirthday max once per user per year. */
	checkNow(): BirthdayEvent[];
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	onBirthday(cb: (event: BirthdayEvent) => void): () => void;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createBirthdayManager: (options?: BirthdayManagerOptions) => BirthdayManager;
