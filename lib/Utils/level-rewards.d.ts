/** Level rewards — auto payouts on level thresholds (glue). */

export interface LevelReward {
	balance?: number;
	tier?: { name: string; days?: number };
	item?: string;
	custom?: (user: string, level: number) => void;
}

export interface LevelRewardsHandle {
	(): void; // detach
	onGrant(cb: (info: { user: string; level: number; granted?: Record<string, unknown>; error?: unknown }) => void): () => void;
	hasClaimed(user: string, threshold: number): boolean;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

/** Unclaimed thresholds ≤ the new level pay out once each (multi-level jumps covered). */
export declare const attachLevelRewards: (
	levels: { onLevelUp(cb: (e: { user: string; level: number }) => void): () => void },
	rewards: Record<number, LevelReward>,
	managers?: { economy?: unknown; tiers?: unknown; shop?: unknown }
) => LevelRewardsHandle;
