/**
 * Delete stale auth files that are safe to regenerate. By default: `sender-key-memory-*`
 * older than `maxAgeDays`, plus orphaned atomic-write temporaries left by crashed processes.
 * Never touches creds, sessions, pre-keys or app-state-sync keys.
 */
export function pruneStaleAuthFiles(folder: string, options?: {
    maxAgeDays?: number;
    categories?: string[];
    dryRun?: boolean;
    orphanTmp?: boolean;
}): Promise<{ scanned: number; removed: number }>;
/** test hook — number of per-file mutexes currently held. */
export function _authFileLockCount(): number;
export function useMultiFileAuthState(folder: any): Promise<{
    state: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => Promise<{}>;
            set: (data: any) => Promise<void>;
        };
    };
    saveCreds: () => Promise<any>;
}>;
