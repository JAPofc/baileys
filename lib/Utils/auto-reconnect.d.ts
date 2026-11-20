/**
 * Drop-in auto-reconnect for direct makeWASocket users (the Framework Bot
 * already has this built in). Exponential backoff with jitter, never
 * reconnects on loggedOut, immediate reconnect on restartRequired.
 * @author J.AP
 */

import type { DisconnectVerdict } from './disconnect-classifier.js';

export interface AutoReconnectOptions {
    /** Called with every fresh socket (initial + each reconnect) — attach your event handlers here. */
    onSocket?: (sock: any) => void;
    /** Called when a connection reaches 'open'. */
    onOpen?: (sock: any) => void;
    /**
     * Called when the manager gives up retrying.
     * JAP@Fix (§2.71 / v2.4.8): the `getStatus()` declaration had been spliced INTO
     * this parameter's object type, so `info` demanded a `getStatus` member and the
     * manager itself had no `getStatus()` at all — calling it was a TS2339 error even
     * though the runtime has always had it.
     */
    onGiveUp?: (info: { reason: 'factory-failed' | 'max-attempts'; attempts: number; error?: unknown; statusCode?: number }) => void;
    /** Called once when the session is logged out (no reconnect will follow) — clean up creds here. */
    onLoggedOut?: (error: unknown) => void;
    /**
     * Called once when a close is FATAL and the chain stops: connectionReplaced,
     * forbidden, multideviceMismatch, loggedOut, or `badSession` repeated
     * `badSessionStreak` times. `message` is the ready-to-log explanation.
     */
    onFatal?: (info: { verdict: DisconnectVerdict; error?: unknown; message: string; badSessions: number }) => void;
    /**
     * Consecutive `badSession` closes tolerated before the session counts as corrupt
     * (default 3). A successful 'open' resets the streak. Set 1 to stop on the first.
     */
    badSessionStreak?: number;
    /** Keep reconnecting even on fatal closes (pre-2.4.8 behaviour). Not recommended. */
    reconnectOnFatal?: boolean;
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
    /** Current lifecycle status for dashboards/health probes. */
    getStatus(): {
        started: boolean;
        stopped: boolean;
        attempts: number;
        reconnectPending: boolean;
        hasSocket: boolean;
        /** Consecutive `badSession` closes; cleared by a successful open. */
        badSessions: number;
        /** Verdict of the most recent close, or null. */
        lastVerdict: DisconnectVerdict | null;
    };
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
