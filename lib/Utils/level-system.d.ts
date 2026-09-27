/** Level system — XP, levels and leaderboards per user. */

export interface LevelSystemOptions {
	/** XP per message: fixed number or [min, max] random range. Default [10, 20]. */
	xpPerMessage?: number | [number, number];
	/** Per-user XP cooldown in ms (messages still counted). Default 30000. */
	cooldownMs?: number;
	/** Level curve base: level n needs baseXp * n² total XP. Default 100. */
	baseXp?: number;
	/** Track per-chat XP too (enables per-chat leaderboards). Default true. */
	groupsChatStats?: boolean;
	/** Rank titles by minimum level. Default: Newbie → Legend. */
	ranks?: Array<{ minLevel: number; title: string }>;
}

export interface LevelUserStats {
	user: string;
	xp: number;
	level: number;
	rank: string;
	messages: number;
	nextLevelXp: number;
	/** 0..1 progress toward the next level. */
	progress: number;
}

export interface LevelUpEvent {
	user: string;
	chat?: string;
	level: number;
	previousLevel: number;
	xp: number;
	rank: string;
	/** True when the level-up also crossed into a new rank title. */
	rankUp: boolean;
}

export interface LeaderboardRow {
	rank: number;
	user: string;
	xp: number;
	level: number;
	messages: number;
}

export interface LevelSystem {
	handler(upsert: { messages: unknown[]; type?: string }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	addXp(user: string, amount: number, chat?: string): LevelUserStats;
	onLevelUp(cb: (event: LevelUpEvent) => void): () => void;
	getUser(user: string): LevelUserStats | null;
	getLeaderboard(limit?: number, chat?: string): LeaderboardRow[];
	/** 1-based leaderboard position (global or per chat), or null. */
	getRankPosition(user: string, chat?: string): number | null;
	levelOf(xp: number): number;
	xpForLevel(level: number): number;
	rankOf(level: number): string;
	/** XP boost — global, or for one chat. */
	setMultiplier(multiplier: number, chat?: string): void;
	getMultiplier(chat?: string): number;
	clearMultiplier(chat?: string): boolean;
	/** Ready-to-send text rank card with a progress bar, or null. */
	renderRankCard(user: string, options?: { barSize?: number }): string | null;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	readonly size: number;
	clear(): void;
}

export declare const createLevelSystem: (options?: LevelSystemOptions) => LevelSystem;
