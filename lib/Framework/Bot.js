/**
 * lib/Framework/Bot.js
 * Author: J.AP (@japofc/baileys)
 *
 * High-level Bot class: Express/Koa-style middleware routing (`use()`/`next()`),
 * a `!command` dispatcher with word-boundary matching, an outbound message
 * queue that survives disconnects (optionally persisted to disk), and
 * exponential-backoff auto-reconnect.
 *
 * Store/SessionManager/StatsManager are built through async factories (because
 * better-sqlite3 is an optional peer dep), so they are created inside start()
 * — before the socket exists — guaranteeing sessions/stats are ready before any
 * message can arrive.
 */
import { Boom } from '@hapi/boom';
import makeWASocket from '../Socket/index.js';
import { DisconnectReason } from '../Types/index.js';
import { isJidGroup } from '../WABinary/index.js';
import defaultLogger from '../Utils/logger.js';
import { fetchBestWaVersion, BufferJSON } from '../Utils/generics.js';
import { writeFile, readFile, rename, unlink } from 'fs/promises';
import { SQLiteStore } from './Store/SQLiteStore.js';
import { Context } from './Context.js';
import { CommandRouter, createGroupAdminResolver } from './CommandRouter.js';
import { SessionManager } from './SessionManager.js';
import { StatsManager } from './StatsManager.js';

/**
 * Resolve the socketConfig a Bot connects with, refreshing the WA Web version
 * unless it is pinned or `versionCheck: false`. Pure + unit-testable; never
 * throws (worst case returns the config untouched).
 */
export const resolveSocketVersionConfig = async (config, logger = defaultLogger) => {
    const socketConfig = config.socketConfig ?? {};
    if (config.versionCheck === false || socketConfig.version) return socketConfig;
    try {
        const { version, source, isLatest } = await fetchBestWaVersion();
        logger.info({ version, source, isLatest }, 'resolved WA Web version');
        return { ...socketConfig, version };
    } catch (err) {
        logger.warn({ err }, 'version lookup failed — using default');
        return socketConfig;
    }
};

export class Bot {
    constructor(config) {
        this.config = config;
        this.middlewares = [];
        this.messageQueue = [];
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.BASE_RECONNECT_DELAY = 1000;
        this.MAX_RECONNECT_DELAY = 30000;
        this.socket = null;
        this.sessions = null;
        this.stats = null;
        this.store = null;
        this.logger = config.logger ?? defaultLogger.child({ module: 'Framework.Bot' });
        // set config.queueFile to make the outbound queue survive process restarts
        this.queueFile = config.queueFile ?? null;
        this._queueLoaded = false;
    }

    /** Register a middleware `(ctx, next) => {}`. */
    use(middleware) {
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * Create a {@link CommandRouter}, wire it into the middleware chain, and
     * return it so you can register commands fluently. The router's group-admin
     * gate is auto-backed by this bot's live socket unless you pass your own
     * `isAdmin`. Owner JIDs default to `config.ownerJids`.
     */
    createRouter(opts = {}) {
        const router = new CommandRouter({
            ownerJids: this.config.ownerJids,
            logger: this.logger,
            ...opts
        });
        if (!opts.isAdmin) {
            // resolve group-admin lazily against whatever socket is current
            const resolver = createGroupAdminResolver({
                groupMetadata: (jid) => this.socket.groupMetadata(jid)
            });
            router._isAdmin = resolver;
        }
        this.router = router;
        this.use(router.middleware());
        return router;
    }

    /** Attach an already-built CommandRouter to the middleware chain. */
    useRouter(router) {
        this.router = router;
        this.use(router.middleware());
        return this;
    }

    /**
     * Register a command handler. Matches exactly or as a prefix followed by a
     * space, so `!sticker` never matches `!stickerSpam`.
     */
    command(cmd, handler) {
        return this.use(async (ctx, next) => {
            const text = ctx.text;
            if (text === cmd || text?.startsWith(cmd + ' ')) await handler(ctx);
            await next();
        });
    }

    /** Register a handler that fires on any non-empty text. */
    onText(handler) {
        return this.use(async (ctx, next) => {
            if (ctx.text) await handler(ctx);
            await next();
        });
    }

    /** Send a message; auto-queues while the socket is disconnected. */
    async sendMessage(jid, content, options = {}) {
        if (this.isConnected && this.socket) return this.socket.sendMessage(jid, content, options);
        return new Promise((resolve, reject) => {
            this.messageQueue.push({ jid, content, options, resolve, reject });
            this.logger.info({ queueLength: this.messageQueue.length }, 'socket not connected — message queued');
            void this._persistQueue();
        });
    }

    /** Atomically snapshot the pending queue to disk (durable queue). */
    async _persistQueue() {
        if (!this.queueFile) return;
        try {
            const payload = JSON.stringify(
                this.messageQueue.map(({ jid, content, options }) => ({ jid, content, options })),
                BufferJSON.replacer
            );
            const tmp = `${this.queueFile}.tmp-${process.pid}`;
            await writeFile(tmp, payload, { mode: 0o600 });
            await rename(tmp, this.queueFile);
        } catch (err) {
            this.logger.warn({ err }, 'failed to persist message queue');
        }
    }

    /** Restore any pending sends left behind by a previous process run. */
    async _loadPersistedQueue() {
        if (!this.queueFile || this._queueLoaded) return;
        this._queueLoaded = true;
        try {
            const raw = await readFile(this.queueFile, 'utf-8').catch(() => null);
            if (!raw) return;
            const items = JSON.parse(raw, BufferJSON.reviver);
            if (!Array.isArray(items) || !items.length) return;
            for (const { jid, content, options } of items) {
                // restored sends have no original awaiter; failures are just logged
                this.messageQueue.push({
                    jid,
                    content,
                    options,
                    resolve: () => { },
                    reject: (err) => this.logger.warn({ err, jid }, 'restored queued message failed to send')
                });
            }
            this.logger.info({ restored: items.length }, 'restored persisted message queue');
        } catch (err) {
            this.logger.warn({ err }, 'failed to load persisted message queue');
        }
    }

    /** Flush queued messages after a reconnect. */
    drainQueue() {
        if (!this.isConnected || !this.socket || this.messageQueue.length === 0) {
            if (this.isConnected && this.messageQueue.length === 0 && this.queueFile) {
                void unlink(this.queueFile).catch(() => { });
            }
            return;
        }
        this.logger.info({ pending: this.messageQueue.length }, 'draining message queue');
        const queue = this.messageQueue;
        this.messageQueue = [];
        if (this.queueFile) void unlink(this.queueFile).catch(() => { });
        for (const msg of queue) {
            this.socket.sendMessage(msg.jid, msg.content, msg.options).then(msg.resolve).catch(msg.reject);
        }
    }

    /** Reject + clear the queue so callers don't hang forever (used on loggedOut). */
    rejectQueue(reason) {
        const queue = this.messageQueue;
        this.messageQueue = [];
        if (this.queueFile) void unlink(this.queueFile).catch(() => { });
        for (const msg of queue) msg.reject(new Boom(reason, { statusCode: 401 }));
        if (queue.length > 0) this.logger.warn({ rejected: queue.length }, 'message queue rejected — session terminated');
    }

    /**
     * Resolve the freshest WA Web version for every start()/reconnect via the
     * documented chain (WA sw.js → fork → hardcoded fallback), so the Bot never
     * connects with a stale version (which causes 405 rejections at pairing
     * once WA bumps its minimum). Opt out with `versionCheck: false` or by
     * pinning `socketConfig.version`.
     */
    async #resolveSocketConfig() {
        return resolveSocketVersionConfig(this.config, this.logger);
    }

    /** Wire the messages/connection handlers onto the freshly-created socket. */
    #bindSocketEvents() {
        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                const ctx = new Context(this, msg);
                try {
                    if (this.stats && ctx.remoteJid && isJidGroup(ctx.remoteJid)) {
                        const participant = msg.key.participant || msg.participant;
                        if (participant) {
                            this.stats.observeMessage(ctx.remoteJid, participant, !!msg.message?.stickerMessage);
                        }
                    }
                    await this.executeMiddlewares(ctx);
                } catch (err) {
                    this.logger.error({ err }, 'error executing middleware');
                }
            }
        });

        this.socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                this.logger.info('bot connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.drainQueue();
            }
            if (connection === 'close') {
                this.isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                this.logger.warn({ statusCode }, 'connection closed');
                if (statusCode === DisconnectReason.loggedOut) {
                    this.rejectQueue('session terminated (logged out)');
                    this.logger.info('session logged out — not reconnecting');
                } else {
                    this.reconnectAttempts++;
                    const delay = Math.min(
                        this.MAX_RECONNECT_DELAY,
                        this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1)
                    );
                    this.logger.info({ delay, attempt: this.reconnectAttempts }, 'scheduling reconnect');
                    this.reconnectTimer = setTimeout(() => {
                        this.reconnectTimer = null;
                        this.start().catch((err) => this.logger.error({ err }, 'reconnect failed'));
                    }, delay);
                }
            }
        });
    }

    /** Open the socket and wire all event handlers. */
    async start() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // store/sessions must exist before any message can arrive
        if (!this.store) {
            const dbPath = this.config.dbPath ?? 'baileys_store.db';
            this.store = await SQLiteStore.create(dbPath);
            this.sessions = new SessionManager(this.store);
        }
        await this._loadPersistedQueue();
        this.socket = makeWASocket(await this.#resolveSocketConfig());
        if (this.config.enableStats && !this.stats) {
            this.stats = await StatsManager.create(this.config.dbPath ?? 'baileys_store.db', (jid) => this.socket.groupMetadata(jid));
        }
        this.#bindSocketEvents();
    }

    /** Run the middleware chain for a message; guards against double next(). */
    async executeMiddlewares(ctx) {
        let index = -1;
        const dispatch = async (i) => {
            if (i <= index) throw new Error('next() called multiple times');
            index = i;
            const middleware = this.middlewares[i];
            if (middleware) await middleware(ctx, () => dispatch(i + 1));
        };
        await dispatch(0);
    }

    /** Gracefully stop the bot and release resources. */
    stop() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.rejectQueue('bot stopped');
        this.store?.close();
        this.stats?.close();
    }
}
