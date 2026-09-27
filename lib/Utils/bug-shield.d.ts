/** Bug shield — detect crash/"bug" messages before they hurt. */

export interface ThreatThresholds {
	maxTextLength?: number;
	maxMentions?: number;
	maxInvisibleChars?: number;
	maxCombiningRatio?: number;
	combiningMinLength?: number;
	maxQuotedDepth?: number;
	scoreThreshold?: number;
}

export declare const DEFAULT_THREAT_THRESHOLDS: Required<ThreatThresholds>;

export interface ThreatAnalysis {
	threat: boolean;
	score: number;
	/** e.g. ['hugeText', 'mentionBomb', 'zalgo', 'invisibleFlood', 'rtlOverride', 'deepNesting'] */
	reasons: string[];
	stats: {
		textLength: number;
		mentions: number;
		invisible: number;
		combiningRatio: number;
		quotedDepth: number;
	};
}

/** Pure threat analysis of a WAMessage — never throws. */
export declare const analyzeMessageThreat: (msg: unknown, thresholds?: ThreatThresholds) => ThreatAnalysis;

/** Strip control chars, RTL overrides, invisible flood and zalgo stacking. */
export declare const sanitizeText: (
	text: string,
	options?: { maxCombiningPerChar?: number; keepInvisible?: number }
) => string;

export interface BugShieldOptions {
	thresholds?: ThreatThresholds;
	autoDelete?: boolean;
	groupsOnly?: boolean;
	includeFromMe?: boolean;
	exemptUsers?: string[];
}

export interface BugShieldDetection extends ThreatAnalysis {
	msg: Record<string, unknown>;
	key: Record<string, unknown>;
	chat: string;
	sender: string;
	deleted: boolean;
}

export interface BugShield {
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	analyze: typeof analyzeMessageThreat;
	bind(sock: unknown): () => void;
	unbind(): void;
	onDetected(cb: (detection: BugShieldDetection) => void): () => void;
	onError(cb: (info: { msg: unknown; error: unknown }) => void): () => void;
	addExempt(jid: string): void;
	removeExempt(jid: string): boolean;
	readonly stats: { scanned: number; blocked: number };
}

export declare const createBugShield: (options?: BugShieldOptions) => BugShield;
