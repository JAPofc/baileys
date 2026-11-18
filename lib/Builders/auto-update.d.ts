export declare const AUTO_UPDATE_MIN_INTERVAL_MS: number;
export declare const AUTO_UPDATE_DEFAULT_INTERVAL_MS: number;

export interface ExportsSnapshot {
    buttonNames: string[];
    source: string;
    version: string | null;
    updatedAt: number | null;
}
/** The current native-flow definition table (a copy). */
export declare function getExports(): ExportsSnapshot;
/** Is this an interactive button name the current table accepts? */
export declare function isKnownButtonName(name: string): boolean;
/** Merge a new table — a literal array/object, or `{ url }` to fetch one. */
export declare function update(input: string[] | { buttonNames?: string[]; names?: string[]; version?: string; source?: string } | { url: string }, opts?: {
    fetchImpl?: typeof fetch; merge?: boolean; timeoutMs?: number;
}): Promise<ExportsSnapshot>;
/** Back to the definitions this build shipped with. */
export declare function reloadExports(): ExportsSnapshot;
/** Subscribe to table changes; returns an unsubscribe function. */
export declare function onExportsUpdated(listener: (snapshot: ExportsSnapshot) => void): () => void;
/** Refresh the table on an interval (timer is unref'd). */
export declare function enableAutoUpdate(opts: {
    url: string; intervalMs?: number; fetchImpl?: typeof fetch; immediate?: boolean; onError?: (err: unknown) => void;
}): { url: string; intervalMs: number; stop: () => boolean; refresh: () => Promise<unknown> };
/** Stop the auto-update interval. */
export declare function disableAutoUpdate(): boolean;
export declare function isAutoUpdateEnabled(): boolean;
/** Resolves once any in-flight refresh settled. */
export declare function flushAutoUpdate(): Promise<ExportsSnapshot>;
