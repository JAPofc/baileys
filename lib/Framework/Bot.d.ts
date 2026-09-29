import type { Context } from './Context.js';
import type { SessionManager } from './SessionManager.js';
import type { StatsManager } from './StatsManager.js';
import type { SQLiteStore } from './Store/SQLiteStore.js';
import type { SocketConfig } from '../Types/Socket.js';
import type { AnyMessageContent } from '../Types/Message.js';
import type { ILogger } from '../Utils/logger.js';

export interface BotConfig {
    /** Passed straight to makeWASocket() (auth, logger, browser, …). */
    socketConfig?: Partial<SocketConfig>;
    /** SQLite path for sessions/stats. Default: 'baileys_store.db'. */
    dbPath?: string;
    /** Enable group StatsManager. Default off. */
    enableStats?: boolean;
    /**
     * Resolve the freshest WA Web version via fetchBestWaVersion() on every
     * start()/reconnect (WA sw.js -> baileys fork -> hardcoded fallback).
     * Default true; set false or pin `socketConfig.version` to opt out.
     */
    versionCheck?: boolean;
    /**
     * Path for durable message-queue persistence. When set, messages queued
     * while disconnected survive a process restart (restored on start()).
     * Default: null (in-memory only).
     */
    queueFile?: string | null;
    logger?: ILogger;
}

/** A message waiting in the offline queue (settled when the send completes). */
export interface QueuedMessage {
    jid: string;
    content: AnyMessageContent;
    options?: Record<string, unknown>;
    resolve?: (value: unknown) => void;
    reject?: (reason?: unknown) => void;
}

/**
 * Resolve the socketConfig a Bot connects with: injects the freshest WA Web
 * version via fetchBestWaVersion() unless `versionCheck: false` or
 * `socketConfig.version` is pinned. Pure and never throws.
 */
export function resolveSocketVersionConfig(config: BotConfig, logger?: ILogger): Promise<Partial<SocketConfig>>;

export type BotMiddleware = (ctx: Context, next: () => Promise<void>) => Promise<void> | void;
export type BotCommandHandler = (ctx: Context) => Promise<void> | void;

export class Bot {
    constructor(config: BotConfig);
    middlewares: BotMiddleware[];
    messageQueue: QueuedMessage[];
    isConnected: boolean;
    reconnectAttempts: number;
    /** The underlying makeWASocket() return value (null before start()). */
    socket: ReturnType<typeof import('../Socket/index.js').default> | null;
    sessions: SessionManager | null;
    stats: StatsManager | null;
    store: SQLiteStore | null;
    config: BotConfig;
    logger: ILogger;
    /** Register a middleware function (Express/Koa-style `use()`/`next()`). */
    use(middleware: BotMiddleware): this;
    /** Register a `!command` handler (exact match or prefix + whitespace). */
    command(cmd: string, handler: BotCommandHandler): this;
    /** Register a handler that fires on any non-empty text. */
    onText(handler: BotCommandHandler): this;
    /** Send a message — queues automatically when disconnected. */
    sendMessage(jid: string, content: AnyMessageContent, options?: Record<string, unknown>): Promise<unknown>;
    /** Drain queued messages after reconnect. */
    drainQueue(): void;
    /** Reject and clear the message queue. */
    rejectQueue(reason: unknown): void;
    /** Start the socket and wire all event handlers. */
    start(): Promise<void>;
    executeMiddlewares(ctx: Context): Promise<void>;
    /** Gracefully stop the bot (cancels reconnect, rejects queue, closes stores). */
    stop(): void;
}
