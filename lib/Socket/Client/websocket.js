import WebSocket from 'ws';
import { DEFAULT_ORIGIN } from '../../Defaults/index.js';
import { AbstractSocketClient } from './types.js';
export class WebSocketClient extends AbstractSocketClient {
    /** How long close() waits for a polite close before terminating the socket. */
    static CLOSE_GRACE_MS = 5000;
    constructor() {
        super(...arguments);
        this.socket = null;
    }
    get isOpen() {
        return this.socket?.readyState === WebSocket.OPEN;
    }
    get isClosed() {
        return this.socket === null || this.socket?.readyState === WebSocket.CLOSED;
    }
    get isClosing() {
        return this.socket === null || this.socket?.readyState === WebSocket.CLOSING;
    }
    get isConnecting() {
        return this.socket?.readyState === WebSocket.CONNECTING;
    }
    connect() {
        // JAP@Fix (§2.118): `if (this.socket) return` also refused to reconnect through a
        // *dead* socket -- once the server had closed us, every later connect() on the same
        // client silently did nothing. A closed socket is replaced instead.
        if (this.socket) {
            if (!this.isClosed) {
                return;
            }
            this.socket.removeAllListeners();
            this.socket = null;
        }
        this.socket = new WebSocket(this.url, {
            origin: DEFAULT_ORIGIN,
            headers: this.config.options?.headers,
            handshakeTimeout: this.config.connectTimeoutMs,
            timeout: this.config.connectTimeoutMs,
            agent: this.config.agent
        });
        this.socket.setMaxListeners(0);
        const events = ['close', 'error', 'upgrade', 'message', 'open', 'ping', 'pong', 'unexpected-response'];
        for (const event of events) {
            this.socket?.on(event, (...args) => this.emit(event, ...args));
        }
    }
    /**
     * JAP@Fix (§2.118): this awaited a `close` event that a socket the *server* had already
     * closed will never emit again -- `ws.close()` on a CLOSED socket is a no-op. So any
     * `close()` after a dropped connection (515, conflict, stream end: the normal way
     * WhatsApp ends a session) never settled. Whatever was awaiting it -- a caller's
     * `sock.ws.close()`, a reconnect routine, a shutdown handler -- hung forever.
     *
     * Now: an already-closed socket resolves at once, the listener is attached *before*
     * `close()` so the event cannot be missed, and a socket that will not close politely
     * within `CLOSE_GRACE_MS` is terminated.
     */
    async close() {
        const socket = this.socket;
        if (!socket) {
            return;
        }
        this.socket = null;
        if (socket.readyState === WebSocket.CLOSED) {
            socket.removeAllListeners();
            return;
        }
        await new Promise(resolve => {
            let settled = false;
            const done = () => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                try {
                    socket.terminate();
                }
                catch { }
                done();
            }, WebSocketClient.CLOSE_GRACE_MS);
            timer.unref?.();
            socket.once('close', done);
            try {
                socket.close();
            }
            catch {
                done();
            }
        });
    }
    send(str, cb) {
        this.socket?.send(str, cb);
        return Boolean(this.socket);
    }
}
