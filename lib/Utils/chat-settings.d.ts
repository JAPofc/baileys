/** Chat settings — per-chat feature toggles with defaults. */

export interface ChatSettings<T extends Record<string, unknown> = Record<string, unknown>> {
	get<K extends keyof T & string>(chat: string, key: K): T[K];
	/** Truthy sugar over get(). */
	isEnabled(chat: string, key: keyof T & string): boolean;
	set<K extends keyof T & string>(chat: string, key: K, value: T[K]): T[K];
	/** Flip a boolean setting; returns the new value. */
	toggle(chat: string, key: keyof T & string): boolean;
	/** Drop one override (falls back to the default). */
	reset(chat: string, key: keyof T & string): boolean;
	resetChat(chat: string): boolean;
	/** Effective view: defaults merged with overrides. */
	all(chat: string): T;
	getOverrides(chat: string): Partial<T>;
	/** ✅/❌ settings card. */
	render(chat: string, options?: { title?: string }): string;
	keys(): string[];
	onChange(cb: (info: { chat: string; key: string; value: unknown; reset?: boolean }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	readonly size: number;
}

export declare const createChatSettings: <T extends Record<string, unknown>>(options: { defaults: T }) => ChatSettings<T>;
