/** Notes store — named snippets per chat. */

export interface Note {
	name: string;
	content: unknown;
	author?: string;
	pinned?: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface NotesOptions {
	/** Max notes per chat. Default 200. */
	maxPerChat?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface Notes {
	set(chat: string, name: string, content: unknown, author?: string): Note;
	get(chat: string, name: string): Note | null;
	has(chat: string, name: string): boolean;
	remove(chat: string, name: string): boolean;
	/** Pinned notes sort first and get 📌 in exportText. */
	pin(chat: string, name: string, pinned?: boolean): boolean;
	rename(chat: string, from: string, to: string): boolean;
	list(chat: string): Note[];
	search(chat: string, query: string): Note[];
	/** Ready-to-send list of a chat's notes. */
	exportText(chat: string, options?: { title?: string }): string;
	/** Random note from a chat (quote-bot style), or null. */
	random(chat: string, options?: { random?: () => number }): Note | null;
	countIn(chat: string): number;
	readonly size: number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createNotes: (options?: NotesOptions) => Notes;
