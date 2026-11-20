/** Group metadata cache — TTL-LRU + event-driven invalidation. */

export interface GroupMetadataCache {
	/** Pass this as `cachedGroupMetadata` in the socket config. */
	cachedGroupMetadata(jid: string): Promise<unknown | null>;
	/** Wire fetching + auto-invalidation (groups.update / participants). */
	bind(sock: unknown): () => void;
	unbind(): void;
	/** Seed manually after your own groupMetadata calls. */
	set(jid: string, metadata: unknown): void;
	/** Fresh cached metadata, or null. */
	get(jid: string): unknown | null;
	invalidate(jid: string): boolean;
	clear(): void;
	readonly stats: { hits: number; misses: number; invalidations: number; size: number };
}

export declare const createGroupMetadataCache: (options?: { ttlMs?: number; maxSize?: number; now?: () => number }) => GroupMetadataCache;
