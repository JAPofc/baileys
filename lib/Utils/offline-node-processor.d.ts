export interface OfflineNodeProcessorDeps {
    /** Stop draining when this returns false. Default: always open. */
    isOpen?: () => boolean;
    /** Alias accepted for familiarity with socket internals. */
    isWsOpen?: () => boolean;
    onUnexpectedError?: (err: unknown, context: string) => void;
    yieldToEventLoop?: () => Promise<void>;
}

export interface OfflineNodeProcessor {
    enqueue(type: string, node: any): void;
    waitUntilIdle(): Promise<void>;
    clear(): number;
    readonly pending: number;
    readonly draining: boolean;
}

/** Drain a reconnect's offline stanza backlog one node at a time, yielding to the event loop. */
export declare function makeOfflineNodeProcessor(
    nodeProcessorMap: Map<string, (node: any) => Promise<void> | void>,
    deps?: OfflineNodeProcessorDeps,
    batchSize?: number
): OfflineNodeProcessor;
