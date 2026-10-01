/** Attendance ("absen") — daily roll-call sessions per chat. */

export interface Attendee {
	position: number;
	user: string;
	at: number;
}

export interface Attendance {
	handler(upsert: { messages: unknown[] }): void;
	/** Check a user in. Returns their 1-based position, or null. */
	checkIn(chat: string, user: string, at?: number): number | null;
	open(chat: string, options?: { title?: string; openedBy?: string }): { chat: string; title: string; keyword: string };
	/** Close and return the final list. */
	close(chat: string): { chat: string; title: string; openedAt: number; closedAt: number; attendees: Attendee[] } | null;
	isOpen(chat: string): boolean;
	/** Pretty recap from a close() result. */
	renderSummary(closed: { title: string; openedAt: number; closedAt: number; attendees: Attendee[] } | null): string | null;
	getAttendees(chat: string): Attendee[];
	/** Participants who have NOT checked in. */
	getMissing(chat: string, participants: Array<string | { id?: string }>): string[];
	/** Ready-to-send numbered list with check-in times. */
	render(chat: string): string | null;
	getMentions(chat: string): string[];
	bind(sock: unknown): () => void;
	unbind(): void;
	onCheckIn(cb: (info: { chat: string; user: string; position: number; at: number; streak: number }) => void): () => void;
	/** Consecutive-day attendance streak for a user. */
	getStreak(chat: string, user: string): number;
	readonly size: number;
	/** Serialize streaks + any open session for persistence. */
	toJSON(): Record<string, unknown>;
	/** Restore a toJSON() snapshot (streaks survive restarts). */
	load(snapshot: Record<string, unknown>): void;
	/** Drop all sessions and streaks. */
	clear(): void;
}

export declare const createAttendance: (options?: { keyword?: string; now?: () => number }) => Attendance;
