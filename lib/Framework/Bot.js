import { Boom } from '@hapi/boom';
import makeWASocket from '../Socket/index.js';
import { DisconnectReason } from '../Types/index.js';
import { isJidGroup } from '../WABinary/index.js';
import defaultLogger from '../Utils/logger.js';
import { fetchBestWaVersion, BufferJSON } from '../Utils/generics.js';
import { writeFile, readFile, rename, unlink } from 'fs/promises';
import { SQLiteStore } from './Store/SQLiteStore.js';
import { Context } from './Context.js';
import { SessionManager } from './SessionManager.js';
import { StatsManager } from './StatsManager.js';

// JAP@Framework --- high-level Bot class: middleware routing (Express/Koa-style
// `use()`/`next()`), a `!command` dispatcher, an outgoing message queue that
// survives disconnects, and exponential-backoff auto-reconnect.
//
// Kept from upstream's fix pass:
//  - command boundary check: `!sticker` no longer matches `!stickerSpam`
//  - queue is rejected (not left hanging) on DisconnectReason.loggedOut
//  - stats.observeMessage runs inside the per-message try block, so a
//    SQLite error can't silently skip middleware for that message
//  - reconnect timer handle is stored so stop()/restart() can cancel it
//
// JAP@Fix vs upstream: SQLiteStore/StatsManager are now created through an
// async factory (see Store/SQLiteStore.js) instead of a synchronous
// constructor, since better-sqlite3 is lazy-loaded as an optional peer dep
// in this fork. That means store/session/stats setup moved out of the Bot
// constructor and into start() — the socket is only created *after* the
// store is ready, so no message can arrive before sessions/stats exist.
/**
 * Resolve the socketConfig a Bot should connect with. Exported as a pure
 * function so the wiring is unit-testable without opening a real socket.
 * Skips the lookup when `versionCheck: false` or `socketConfig.version` is
 * pinned; never throws (worst case returns socketConfig untouched).
 */
export const resolveSocketVersionConfig = async (config, logger = defaultLogger) => {
    const socketConfig = config.socketConfig ?? {};
    if (config.versionCheck === false || socketConfig.version) {
        return socketConfig;
    }
    try {
        const { version, source, isLatest } = await fetchBestWaVersion();
        logger.info({ version, source, isLatest }, 'resolved WA Web version');
        return { ...socketConfig, version };
    }
    catch (err) {
        // fetchBestWaVersion never throws by contract, but a Framework
        // start() must not be able to die on a version lookup either way.
        logger.warn({ err }, 'version lookup failed — using default');
        return socketConfig;
    }
};

export class Bot {
    constructor(config) {
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
        this.config = config;
        this.logger = config.logger ?? defaultLogger.child({ module: 'Framework.Bot' });
        // JAP@Fix (durable queue): with only the in-memory queue, a process
        // restart while disconnected silently dropped every queued message.
        // Set config.queueFile to a path to make the queue survive restarts.
        this.queueFile = config.queueFile ?? null;
        this._queueLoaded = false;
    }

    /** Register a middleware function */
    use(middleware) {
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * Register a command handler.
     * Uses exact match OR prefix + whitespace so '!sticker' does NOT
     * match '!stickerSpam' or '!stickerset'.
     */
    command(cmd, handler) {
        this.use(async (ctx, next) => {
            const text = ctx.text;
            if (text === cmd || text?.startsWith(cmd + ' ')) {
                await handler(ctx);
            }
            await next();
        });
        return this;
    }

    /** Register a handler that fires on any non-empty text */
    onText(handler) {
        this.use(async (ctx, next) => {
            if (ctx.text) {
                await handler(ctx);
            }
            await next();
        });
        return this;
    }

    /** Send a message — queues automatically when socket is disconnected */
    async sendMessage(jid, content, options = {}) {
        if (this.isConnected && this.socket) {
            return this.socket.sendMessage(jid, content, options);
        }
        return new Promise((resolve, reject) => {
            this.messageQueue.push({ jid, content, options, resolve, reject });
            this.logger.info({ queueLength: this.messageQueue.length }, 'socket not connected — message queued');
            void this._persistQueue();
        });
    }

    /** JAP@Add (durable queue): atomically snapshot pending sends to queueFile. */
    async _persistQueue() {
        if (!this.queueFile) return;
        try {
            const payload = JSON.stringify(this.messageQueue.map(({ jid, content, options }) => ({ jid, content, options })), BufferJSON.replacer);
            const tmp = `${this.queueFile}.tmp-${process.pid}`;
            await writeFile(tmp, payload, { mode: 0o600 });
            await rename(tmp, this.queueFile);
        }
        catch (err) {
            this.logger.warn({ err }, 'failed to persist message queue');
        }
    }

    /** JAP@Add (durable queue): restore pending sends left over from a previous process. */
    async _loadPersistedQueue() {
        if (!this.queueFile || this._queueLoaded) return;
        this._queueLoaded = true;
        try {
            const raw = await readFile(this.queueFile, 'utf-8').catch(() => null);
            if (!raw) return;
            const items = JSON.parse(raw, BufferJSON.reviver);
            if (!Array.isArray(items) || !items.length) return;
            for (const { jid, content, options } of items) {
                // Restored sends have no original awaiter — resolve/reject are no-ops;
                // failures are logged by drainQueue's catch handler instead.
                this.messageQueue.push({ jid, content, options, resolve: () => { }, reject: (err) => this.logger.warn({ err, jid }, 'restored queued message failed to send') });
            }
            this.logger.info({ restored: items.length }, 'restored persisted message queue');
        }
        catch (err) {
            this.logger.warn({ err }, 'failed to load persisted message queue');
        }
    }

    /** Drain queued messages after reconnect. */
    drainQueue() {
        if (!this.isConnected || !this.socket || this.messageQueue.length === 0) {
            if (this.isConnected && this.messageQueue.length === 0 && this.queueFile) {
                void unlink(this.queueFile).catch(() => { });
            }
            return;
        }
        this.logger.info({ pending: this.messageQueue.length }, 'draining message queue');
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        if (this.queueFile) {
            void unlink(this.queueFile).catch(() => { });
        }
        for (const msg of queue) {
            this.socket.sendMessage(msg.jid, msg.content, msg.options).then(msg.resolve).catch(msg.reject);
        }
    }

    /** Reject and clear the message queue. Called on loggedOut so callers don't hang forever. */
    rejectQueue(reason) {
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        if (this.queueFile) {
            void unlink(this.queueFile).catch(() => { }); // JAP@Add: durable queue cleanup
        }
        for (const msg of queue) {
            msg.reject(new Boom(reason, { statusCode: 401 }));
        }
        if (queue.length > 0) {
            this.logger.warn({ rejected: queue.length }, 'message queue rejected — session terminated');
        }
    }

    /**
     * JAP@Fix (bug 66): the Bot always connected with whatever `version` sat
     * in socketConfig — usually nothing, i.e. the hardcoded Defaults constant.
     * That is the exact stale-version footgun fetchBestWaVersion() was written
     * for (405 rejections at pairing once WA bumps its minimum, upstream#2370/
     * #2485), and the Framework never actually used it. Now every start()
     * (and therefore every auto-reconnect) resolves the freshest version
     * through the documented chain: WA's own sw.js -> baileys fork -> the
     * hardcoded fallback. Never throws; offline it behaves exactly as before.
     * Opt out with `versionCheck: false` or pin `socketConfig.version`.
     */
    async #resolveSocketConfig() {
        return resolveSocketVersionConfig(this.config, this.logger);
    }

    /** Start the socket and wire all event handlers */
    async start() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // JAP@Fix: store/sessions must exist before the socket can receive
        // any message, so this now awaits creation instead of doing it
        // synchronously in the constructor.
        if (!this.store) {
            const dbPath = this.config.dbPath ?? 'baileys_store.db';
            this.store = await SQLiteStore.create(dbPath);
            this.sessions = new SessionManager(this.store);
        }
        await this._loadPersistedQueue(); // JAP@Add: durable queue restore
        this.socket = makeWASocket(await this.#resolveSocketConfig());
        if (this.config.enableStats && !this.stats) {
            this.stats = await StatsManager.create(this.config.dbPath ?? 'baileys_store.db', jid => this.socket.groupMetadata(jid));
        }
        this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify')
                return;
            for (const msg of messages) {
                const ctx = new Context(this, msg);
                try {
                    if (this.stats && ctx.remoteJid && isJidGroup(ctx.remoteJid)) {
                        const participant = msg.key.participant || msg.participant;
                        if (participant) {
                            const isSticker = !!msg.message?.stickerMessage;
                            this.stats.observeMessage(ctx.remoteJid, participant, isSticker);
                        }
                    }
                    await this.executeMiddlewares(ctx);
                }
                catch (err) {
                    this.logger.error({ err }, 'error executing middleware');
                }
            }
        });
        this.socket.ev.on('connection.update', update => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                this.logger.info('bot connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.drainQueue();
            }
            if (connection === 'close') {
                this.isConnected = false;
                const error = lastDisconnect?.error;
                const statusCode = error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                this.logger.warn({ statusCode }, 'connection closed');
                if (isLoggedOut) {
                    this.rejectQueue('session terminated (logged out)');
                    this.logger.info('session logged out — not reconnecting');
                }
                else {
                    this.reconnectAttempts++;
                    const delay = Math.min(this.MAX_RECONNECT_DELAY, this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1));
                    this.logger.info({ delay, attempt: this.reconnectAttempts }, 'scheduling reconnect');
                    this.reconnectTimer = setTimeout(() => {
                        this.reconnectTimer = null;
                        this.start().catch(err => {
                            this.logger.error({ err }, 'reconnect failed');
                        });
                    }, delay);
                }
            }
        });
    }

    async executeMiddlewares(ctx) {
        let index = -1;
        const dispatch = async (i) => {
            if (i <= index)
                throw new Error('next() called multiple times');
            index = i;
            const middleware = this.middlewares[i];
            if (middleware) {
                await middleware(ctx, () => dispatch(i + 1));
            }
        };
        await dispatch(0);
    }

    /** Gracefully stop the bot */
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
