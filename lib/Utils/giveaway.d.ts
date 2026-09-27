/** Giveaway — keyword-entry raffles with fair draws. */

export interface GiveawayEndResult {
	chat: string;
	prize: string;
	winners: string[];
	entries: number;
	reason: string;
	startedBy?: string;
}

export interface Giveaway {
	handler(upsert: { messages: unknown[] }): void;
	start(chat: string, options?: { prize?: string; durationMs?: number; winners?: number; startedBy?: string }): { chat: string; prize: string; winners: number; endsAt: number; keyword: string };
	/** Draw winners now. */
	end(chat: string): GiveawayEndResult | null;
	/** Cancel without drawing (no onEnd). */
	cancel(chat: string): boolean;
	/** Manual entry (e.g. reaction-based joining). */
	enter(chat: string, user: string): boolean;
	isActive(chat: string): boolean;
	getEntries(chat: string): string[];
	render(chat: string): string | null;
	bind(sock: unknown): () => void;
	unbind(): void;
	onJoin(cb: (info: { chat: string; user: string; entries: number; msg?: unknown }) => void): () => void;
	onEnd(cb: (result: GiveawayEndResult) => void): () => void;
	/** Fires when canJoin rejects an entry. */
	onDenied(cb: (info: { chat: string; user: string; reason: string; msg?: unknown }) => void): () => void;
	readonly size: number;
}

export declare const createGiveaway: (options?: { keyword?: string; random?: () => number; now?: () => number; canJoin?: (user: string, chat: string) => true | string }) => Giveaway;
