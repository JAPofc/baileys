/** Auction ("lelang") — timed bidding with increments and anti-snipe. */

export interface AuctionStatus {
	item: string;
	currentBid: number | null;
	leader: string | null;
	minNext: number;
	bids: number;
	endsAt: number;
	remainingMs: number;
}

export interface AuctionEndResult {
	chat: string;
	item: string;
	winner: string | null;
	amount: number | null;
	bids: number;
	reason: string;
}

export type BidResult =
	| { accepted: true; amount: number; leader: string; extended: boolean }
	| { accepted: false; reason: 'no-auction' | 'too-low' | 'already-leading'; minNext?: number };

export interface Auction {
	start(chat: string, options?: { item?: string; startBid?: number; minIncrement?: number; durationMs?: number; antiSnipeMs?: number; startedBy?: string }): { chat: string; item: string; startBid: number; minIncrement: number; endsAt: number };
	/** Never throws on a bad bid — returns a refusal instead. */
	bid(chat: string, user: string, amount: number): BidResult;
	end(chat: string): AuctionEndResult | null;
	cancel(chat: string): boolean;
	isActive(chat: string): boolean;
	getStatus(chat: string): AuctionStatus | null;
	render(chat: string): string | null;
	onBid(cb: (info: { chat: string; user: string; amount: number; extended: boolean }) => void): () => void;
	onOutbid(cb: (info: { chat: string; user: string; by: string; amount: number }) => void): () => void;
	onEnd(cb: (result: AuctionEndResult) => void): () => void;
	readonly size: number;
}

export declare const createAuction: (options?: { now?: () => number }) => Auction;
