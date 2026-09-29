/** Command analytics — usage counters, top users, hourly histogram. */

export interface CommandStatsOptions {
	/** Clock override (testing). */
	now?: () => number;
}

export interface CommandStats {
	record(command: string, user?: string, chat?: string): void;
	/** Router middleware: `router.use(stats.middleware())`. */
	middleware(): (ctx: { command: string; sender: string; jid: string }, next: () => Promise<void>) => Promise<void>;
	getTopCommands(limit?: number): Array<{ command: string; count: number }>;
	getTopUsers(limit?: number): Array<{ user: string; count: number }>;
	/** Ready-to-send usage leaderboard. */
	renderTop(options?: { title?: string; limit?: number }): string;
	/** Busiest chats across all commands. */
	getTopChats(limit?: number): Array<{ chat: string; count: number }>;
	/** 24 numbers — command volume per local hour-of-day. */
	getBusiestHours(): number[];
	getCommandStats(command: string): {
		command: string;
		count: number;
		users: number;
		chats: number;
		lastUsedAt: number;
		topUsers: Array<{ user: string; count: number }>;
	} | null;
	getUserStats(user: string): {
		user: string;
		count: number;
		lastSeenAt: number;
		commands: Array<{ command: string; count: number }>;
	} | null;
	readonly totalCommands: number;
	readonly trackingSince: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createCommandStats: (options?: CommandStatsOptions) => CommandStats;
