/** KV store — tiny JSON key-value database with namespaces. */

export interface KVNamespace {
	get<T = unknown>(key: string, fallback?: T): T;
	set<T>(key: string, value: T): T;
	has(key: string): boolean;
	delete(key: string): boolean;
	/** All entries of this namespace. */
	all(): Record<string, unknown>;
	keys(): string[];
	increment(key: string, by?: number): number;
	clear(): void;
}

export interface KVStore extends KVNamespace {
	/** Isolated sub-store; keys never collide across namespaces. */
	namespace(ns: string): KVNamespace;
	/** Write pending changes now (saves are debounced + atomic). */
	flush(): Promise<void>;
	readonly isDirty: boolean;
	readonly file: string | null;
}

/** Pass a file path for persistence, or nothing for in-memory. */
export declare const createKVStore: (file?: string, options?: { debounceMs?: number }) => Promise<KVStore>;
