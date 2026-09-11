/**
 * Drop-in auto-reconnect for direct makeWASocket users (the Framework Bot
 * already has this built in). Exponential backoff with jitter, never
 * reconnects on loggedOut, immediate reconnect on restartRequired.
 * @author J.AP
 */

export interface AutoReconnectOptions {
    /** Called with every fresh socket (initial + each reconnect) — attach your event handlers here. */
    onSocket?: (sock: any) => void;
    /** Called when a connection reaches 'open'. */
    onOpen?: (sock: any) => void;
    /** Called once when the session is logged out (no reconnect will follow) — clean up creds here. */
    onLoggedOut?: (error: unknown) => void;
    /** Give up after this many consecutive failed attempts (default Infinity). */
    maxAttempts?: number;
    /** First retry delay in ms (default 1000). */
    baseDelayMs?: number;
    /** Backoff cap in ms (default 30000). */
    maxDelayMs?: number;
    /** Random jitter fraction 0-1 applied to each delay (default 0.25). */
    jitter?: number;
    logger?: any;
}

export interface AutoReconnectManager {
    /** Create the socket (via your factory) and begin supervising it. Resolves to the socket, or null if already stopped. */
    start: () => Promise<any | null>;
    /** Cancel pending reconnects and close the live socket. */
    stop: () => Promise<void>;
    /** The live socket (replaced on every reconnect); null before start(). */
    readonly socket: any | null;
    /** Consecutive failed attempts since the last successful open. */
    readonly attempts: number;
}

/**
 * Supervise a socket factory with automatic reconnect.
 * The factory may be sync (`() => makeWASocket(cfg)`) or async
 * (`() => makeWASocketAuto(cfg)`).
 */
export declare const autoReconnect: (
    socketFactory: () => any | Promise<any>,
    options?: AutoReconnectOptions,
) => AutoReconnectManager;
