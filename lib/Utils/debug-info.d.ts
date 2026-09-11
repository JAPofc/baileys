/**
 * Structured, safe debug snapshots for bug reports and monitoring.
 * Never contains QR payloads, pairing codes, auth keys, tokens or private
 * keys — the whole snapshot passes through redactSecrets() before return.
 * @author J.AP
 */

export interface DebugInfo {
    timestamp: string;
    connection: {
        state: 'connecting' | 'open' | 'close' | string;
        wsOpen: boolean;
        /** ms since the current connection reached 'open' (0 when not connected) */
        uptimeMs: number;
        opens: number;
        disconnects: number;
        lastDisconnect: { code: number | null; reason: string | null; at: number | null };
        /** how many QR codes were generated (payloads are never stored) */
        qrGenerated: number;
        registered: boolean;
    };
    messages: {
        received: number;
        decryptFailed: number;
        latencyMs: {
            samples: number;
            p50: number | null;
            p90: number | null;
            p99: number | null;
            max: number | null;
        };
    };
    sendRetries: {
        totalRetries?: number;
        successfulRetries?: number;
        failedRetries?: number;
        sessionRecreations?: number;
        phoneRequests?: number;
        /** retry receipts received from peers (they failed to decrypt our send) */
        incomingRetryRequests: number;
    };
    signalErrors: {
        noSession: number;
        badMac: number;
        missingKeys: number;
        preKeyErrors: number;
        messageAbsent: number;
        other: number;
    };
    voip: {
        attached: boolean;
        busy: boolean;
        callId: string | null;
        wasmLoaded: boolean;
        engineCallState: number | null;
        relayOpenConnections: number | null;
    };
    memory: {
        rssMB: number;
        heapUsedMB: number;
        heapTotalMB: number;
        externalMB: number;
    };
}

export interface DebugMonitor {
    /** Take a snapshot now. Safe to log or attach to bug reports as-is. */
    getDebugInfo: () => DebugInfo;
    /** Detach all listeners. */
    stop: () => void;
}

export interface DebugMonitorOptions {
    /** Max latency samples kept in memory (default 500). */
    sampleLimit?: number;
}

/** Attach a debug monitor to a socket. Call before (or right after) connecting. */
export declare const createDebugMonitor: (sock: any, options?: DebugMonitorOptions) => DebugMonitor;
