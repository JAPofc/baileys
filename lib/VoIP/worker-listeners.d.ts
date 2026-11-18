export interface PortDispatcher {
    /** Register a handler; returns an unsubscribe function. */
    add(fn: (data: any) => void): () => void;
    /** Remove a handler; returns whether it was registered. */
    remove(fn: (data: any) => void): boolean;
    /** Deliver a message to every handler. */
    dispatch(data: any): void;
    /** How many handlers are registered. */
    readonly size: number;
    /** Whether the single underlying port subscription is attached. */
    readonly attached: boolean;
    /** Drop every handler and the port subscription. */
    dispose(): void;
}

/** One `port.on('message')` subscription fanned out to many listeners (add/remove symmetric). */
export declare function createPortDispatcher(
    port: { on: Function; off?: Function; removeListener?: Function } | null | undefined,
    opts?: { onError?: (err: unknown, data: unknown) => void }
): PortDispatcher;
