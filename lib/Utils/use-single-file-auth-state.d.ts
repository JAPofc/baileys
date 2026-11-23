export function useSingleFileAuthState(fileName: string): Promise<{
    state: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => {};
            set: (data: any) => void;
        };
    };
    /**
     * Persist the credentials and wait for them to reach disk. §2.223: this used to queue
     * a debounced write and resolve immediately, so a process that exited within three
     * seconds of pairing lost its session.
     */
    saveCreds: () => Promise<void>;
    /** Force pending key writes to disk now, instead of waiting for the debounce. */
    flush: () => Promise<void>;
    /** Flush on shutdown. Safe to skip — the debounce timer is unref'd — but then the last key writes stay in memory. */
    close: () => Promise<void>;
}>;
