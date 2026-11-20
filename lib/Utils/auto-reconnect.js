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
import { classifyDisconnect, explainDisconnect } from './disconnect-classifier.js';
import defaultLogger from './logger.js';

export const autoReconnect = (socketFactory, options = {}) => {
    const {
        onSocket,
        onOpen,
        onLoggedOut,
        onGiveUp,
        onFatal,
        maxAttempts = Infinity,
        /**
         * JAP@Fix (§2.71 / v2.4.8): consecutive `badSession` closes tolerated before the
         * session is declared corrupt. One is usually a transient server-side decrypt
         * hiccup; three in a row is not. Set 0 to treat the first one as fatal.
         */
        badSessionStreak = 3,
        /** Reconnect anyway on fatal closes (the pre-2.4.8 behaviour). Not recommended. */
        reconnectOnFatal = false,
        baseDelayMs = 1000,
        maxDelayMs = 30000,
        jitter = 0.25,
        logger = defaultLogger.child({ module: 'auto-reconnect' }),
    } = options;

    let sock = null;
    let attempts = 0;
    let timer = null;
    let stopped = false;
    let started = false;
    let badSessions = 0; // consecutive badSession closes
    let lastVerdict = null;

    const delayFor = (attempt) => {
        const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
        const wiggle = exp * jitter * (Math.random() * 2 - 1);
        return Math.max(0, Math.round(exp + wiggle));
    };

    const scheduleRestart = (delay) => {
        if (stopped || timer) {
            return; // never two pending reconnects at once
        }
        timer = setTimeout(() => {
            timer = null;
            connect().catch((err) => logger.error({ err }, 'reconnect attempt failed'));
        }, delay);
    };

    const connect = async () => {
        if (stopped) {
            return null;
        }
        // JAP@Fix (lifecycle): best-effort cleanup of the previous socket so a
        // half-open ws never lingers next to its replacement.
        const previous = sock;
        if (previous) {
            try {
                await previous.end?.();
            }
            catch { /* already dead */ }
        }
        let current;
        try {
            current = await socketFactory();
        }
        catch (err) {
            // JAP@Fix (lifecycle): a throwing factory (e.g. makeWASocketAuto's
            // version fetch while offline) used to kill the chain permanently.
            // Treat it like a failed connection: back off and try again.
            attempts += 1;
            if (attempts > maxAttempts) {
                logger.error({ err, attempts: attempts - 1 }, 'socket factory failed and max attempts reached — giving up');
                try {
                    onGiveUp?.({ reason: 'factory-failed', attempts: attempts - 1, error: err });
                }
                catch (cbErr) {
                    logger.warn({ err: cbErr }, 'onGiveUp handler threw');
                }
                return null;
            }
            const delay = delayFor(attempts);
            logger.warn({ err, attempt: attempts, delay }, 'socket factory failed — retrying');
            scheduleRestart(delay);
            return null;
        }
        // JAP@Fix (§2.155): stop() can land while we are awaiting socketFactory(). The old
        // code only checked `stopped` on entry, so the socket that arrived afterwards was
        // adopted as the live one, wired up, and never closed -- stop() had already run its
        // cleanup against the PREVIOUS socket and returned. The caller was told the manager
        // was stopped while a real connection stayed open. Close the latecomer and bail.
        if (stopped) {
            try {
                await current.end?.();
            }
            catch { /* already dead */ }
            return null;
        }
        sock = current;
        // JAP@Fix (race): a 'close' may be emitted more than once by the same
        // socket, and a stale (already-replaced) socket can emit late events.
        // Without these guards a double-close schedules two parallel reconnect
        // chains, and every stale close spawns a ghost socket.
        let closeHandled = false;
        try {
            onSocket?.(current);
        }
        catch (err) {
            logger.warn({ err }, 'onSocket handler threw');
        }
        current.ev.on('connection.update', (update) => {
            if (sock !== current) {
                return; // stale socket — a newer one has replaced it
            }
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                attempts = 0;
                badSessions = 0; // a successful open clears the badSession streak
                try {
                    onOpen?.(current);
                }
                catch (err) {
                    logger.warn({ err }, 'onOpen handler threw');
                }
                return;
            }
            if (connection !== 'close' || stopped || closeHandled) {
                return;
            }
            closeHandled = true;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            // JAP@Fix (§2.71 / v2.4.8): only `loggedOut` used to stop the chain. Every
            // other fatal close — connectionReplaced, forbidden, multideviceMismatch,
            // badSession — was reconnected forever (repro: 54+ sockets in 120ms), which
            // fights the session that replaced us and hammers a banned account. The
            // classifier already knew all of this; now the manager actually asks it.
            const verdict = classifyDisconnect(lastDisconnect);
            lastVerdict = verdict;
            if (verdict.code === DisconnectReason.badSession) {
                badSessions += 1;
            }
            else {
                badSessions = 0;
            }
            const streakPending = verdict.fatalAfterStreak !== null && badSessions < Math.max(1, badSessionStreak);
            const isFatal = verdict.fatal && !streakPending && !reconnectOnFatal;
            if (isFatal) {
                stopped = true;
                logger.error({ statusCode, category: verdict.category, badSessions: badSessions || undefined }, explainDisconnect(lastDisconnect, { streak: badSessions }));
                if (verdict.code === DisconnectReason.loggedOut) {
                    try {
                        onLoggedOut?.(lastDisconnect?.error);
                    }
                    catch (err) {
                        logger.warn({ err }, 'onLoggedOut handler threw');
                    }
                }
                try {
                    onFatal?.({
                        verdict,
                        error: lastDisconnect?.error,
                        message: explainDisconnect(lastDisconnect, { streak: badSessions }),
                        badSessions: badSessions || 0
                    });
                }
                catch (err) {
                    logger.warn({ err }, 'onFatal handler threw');
                }
                return;
            }
            if (streakPending) {
                logger.warn({ statusCode, badSessions }, explainDisconnect(lastDisconnect, { streak: badSessions }));
            }
            attempts += 1;
            if (attempts > maxAttempts) {
                logger.warn({ attempts: attempts - 1 }, 'max reconnect attempts reached — giving up');
                try {
                    onGiveUp?.({ reason: 'max-attempts', attempts: attempts - 1, statusCode });
                }
                catch (cbErr) {
                    logger.warn({ err: cbErr }, 'onGiveUp handler threw');
                }
                return;
            }
            // JAP@Fix (lifecycle): restartRequired always reconnected with
            // delay 0. Correct after pairing (single event), but when the
            // server answers restartRequired on EVERY connect it becomes a
            // tight spin loop (repro: 165 sockets in 200ms). Only the FIRST
            // consecutive restartRequired is immediate; repeats back off.
            const immediate = statusCode === DisconnectReason.restartRequired && attempts === 1;
            const delay = immediate ? 0 : delayFor(attempts);
            logger.info({ attempt: attempts, delay, statusCode }, 'scheduling reconnect');
            scheduleRestart(delay);
        });
        return current;
    };

    // JAP@Fix (lifecycle): start() twice used to run two parallel reconnect
    // chains forever (repro: 2 sockets immediately, 3 after one close storm).
    // The public start() is now idempotent; connect() is the internal step.
    const start = async () => {
        if (started && !stopped) {
            logger.warn('start() called while already running — returning the live socket');
            return sock;
        }
        // JAP@Fix (lifecycle): start() after stop() used to return the dead
        // socket silently (started stayed true, stopped stayed true, connect()
        // no-oped). A stopped manager can now be restarted cleanly.
        stopped = false;
        started = true;
        attempts = 0;
        badSessions = 0;
        return connect();
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
        /** JAP@Upgrade: current lifecycle status for dashboards/health probes. */
        getStatus() {
            return {
                started,
                stopped,
                attempts,
                reconnectPending: !!timer,
                hasSocket: !!sock,
                /** Consecutive `badSession` closes; cleared by a successful open. */
                badSessions,
                /** Verdict of the most recent close, or null. */
                lastVerdict
            };
        },
        /** Consecutive failed attempts since the last successful open. */
        get attempts() {
            return attempts;
        },
    };
};
