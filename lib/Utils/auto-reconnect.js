/**
 * JAP@Add --- drop-in auto-reconnect for direct makeWASocket users.
 *
 * The Framework Bot has always had exponential-backoff reconnect built in;
 * plain-socket users had to hand-roll the same connection.update dance every
 * project (the #1 beginner Baileys question). This wraps it once, correctly:
 *
 *   const manager = autoReconnect(() => makeWASocketAuto({ auth: state }), {
 *       onSocket: (sock) => sock.ev.on('messages.upsert', handler),
 *   });
 *   await manager.start();
 *
 * - exponential backoff with jitter (1s base -> 30s cap)
 * - never reconnects on DisconnectReason.loggedOut (session is dead; caller
 *   gets onLoggedOut to clean up creds)
 * - restartRequired (post-pairing) reconnects immediately, not backed off
 * - stop() cancels timers and closes the live socket
 * - factory may be async (works with makeWASocketAuto) or sync
 *
 * @author J.AP
 */
import { DisconnectReason } from '../Types/index.js';
import defaultLogger from './logger.js';

export const autoReconnect = (socketFactory, options = {}) => {
    const {
        onSocket,
        onOpen,
        onLoggedOut,
        maxAttempts = Infinity,
        baseDelayMs = 1000,
        maxDelayMs = 30000,
        jitter = 0.25,
        logger = defaultLogger.child({ module: 'auto-reconnect' }),
    } = options;

    let sock = null;
    let attempts = 0;
    let timer = null;
    let stopped = false;

    const delayFor = (attempt) => {
        const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
        const wiggle = exp * jitter * (Math.random() * 2 - 1);
        return Math.max(0, Math.round(exp + wiggle));
    };

    const start = async () => {
        if (stopped) {
            return null;
        }
        sock = await socketFactory();
        try {
            onSocket?.(sock);
        }
        catch (err) {
            logger.warn({ err }, 'onSocket handler threw');
        }
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                attempts = 0;
                try {
                    onOpen?.(sock);
                }
                catch (err) {
                    logger.warn({ err }, 'onOpen handler threw');
                }
                return;
            }
            if (connection !== 'close' || stopped) {
                return;
            }
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                logger.info('session logged out — not reconnecting');
                try {
                    onLoggedOut?.(lastDisconnect?.error);
                }
                catch (err) {
                    logger.warn({ err }, 'onLoggedOut handler threw');
                }
                return;
            }
            attempts += 1;
            if (attempts > maxAttempts) {
                logger.warn({ attempts: attempts - 1 }, 'max reconnect attempts reached — giving up');
                return;
            }
            const immediate = statusCode === DisconnectReason.restartRequired;
            const delay = immediate ? 0 : delayFor(attempts);
            logger.info({ attempt: attempts, delay, statusCode }, 'scheduling reconnect');
            timer = setTimeout(() => {
                timer = null;
                start().catch((err) => logger.error({ err }, 'reconnect attempt failed'));
            }, delay);
        });
        return sock;
    };

    const stop = async () => {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        try {
            await sock?.end?.();
        }
        catch { /* socket may already be dead */ }
    };

    return {
        start,
        stop,
        /** The live socket (replaced on every reconnect); null before start(). */
        get socket() {
            return sock;
        },
        /** Consecutive failed attempts since the last successful open. */
        get attempts() {
            return attempts;
        },
    };
};
