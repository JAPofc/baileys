import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { autoReconnect, DisconnectReason } from '../lib/index.js';

// Regression tests for the reconnect-lifecycle hardening. Every case is a
// reproduced pre-fix failure:
//   - restartRequired on every connect  → 165 sockets in 200ms (spin loop)
//   - throwing factory                  → chain permanently dead
//   - start() twice                     → two parallel reconnect chains
//   - replaced sockets                  → never end()ed (half-open ws leak)

const silent = pino({ level: 'silent' });

const closeWith = (code) => ({
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: code } } },
});
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const trackedFactory = (sockets, { failOnCall = 0, instantClose = null } = {}) => {
    let calls = 0;
    return () => {
        calls += 1;
        if (failOnCall && calls === failOnCall) {
            throw new Error('factory boom (simulated offline fetch)');
        }
        const s = {
            ev: new EventEmitter(),
            ended: 0,
            end: async () => { s.ended += 1; },
        };
        sockets.push(s);
        if (instantClose !== null) {
            setImmediate(() => s.ev.emit('connection.update', closeWith(instantClose)));
        }
        return s;
    };
};

describe('reconnect lifecycle: no reconnect loops', () => {
    it('a restartRequired storm backs off instead of spinning', async () => {
        const sockets = [];
        const mgr = autoReconnect(
            trackedFactory(sockets, { instantClose: DisconnectReason.restartRequired }),
            { logger: silent, baseDelayMs: 50, jitter: 0 }
        );
        await mgr.start();
        await settle(200);
        // pre-fix: 165 sockets in this window; with backoff: initial + immediate
        // first restart + at most a few backed-off ones
        assert.ok(sockets.length <= 6, `spin loop: ${sockets.length} sockets in 200ms`);
        await mgr.stop();
    });

    it('first restartRequired (post-pairing) still reconnects immediately', async () => {
        const sockets = [];
        const mgr = autoReconnect(trackedFactory(sockets), {
            logger: silent, baseDelayMs: 5000, jitter: 0, // big delay would show up
        });
        await mgr.start();
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.restartRequired));
        await settle(100);
        assert.equal(sockets.length, 2, 'immediate reconnect, no 5s wait');
        await mgr.stop();
    });
});

describe('reconnect lifecycle: factory failures', () => {
    it('a throwing factory retries instead of killing the chain', async () => {
        const sockets = [];
        const mgr = autoReconnect(trackedFactory(sockets, { failOnCall: 2 }), {
            logger: silent, baseDelayMs: 1, jitter: 0,
        });
        await mgr.start();
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.connectionLost));
        await settle(100);
        assert.equal(sockets.length, 2, 'recovered after the transient factory failure');
        assert.equal(mgr.socket, sockets[1]);
        await mgr.stop();
    });

    it('factory failures respect maxAttempts', async () => {
        let calls = 0;
        const mgr = autoReconnect(() => {
            calls += 1;
            if (calls > 1) {
                throw new Error('always down');
            }
            return { ev: new EventEmitter(), end: async () => { } };
        }, { logger: silent, baseDelayMs: 1, jitter: 0, maxAttempts: 2 });
        await mgr.start();
        mgr.socket.ev.emit('connection.update', closeWith(DisconnectReason.connectionLost));
        await settle(100);
        assert.ok(calls <= 4, `gave up after maxAttempts (calls=${calls})`);
    });
});

describe('reconnect lifecycle: idempotent start + cleanup', () => {
    it('start() twice returns the same live socket, no parallel chains', async () => {
        const sockets = [];
        const mgr = autoReconnect(trackedFactory(sockets), { logger: silent, baseDelayMs: 1, jitter: 0 });
        const first = await mgr.start();
        const second = await mgr.start();
        assert.equal(sockets.length, 1, 'one chain only (was 2 pre-fix)');
        assert.equal(first, second, 'second start() returns the live socket');
        // close storm should still produce a single linear chain
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.connectionLost));
        await settle();
        assert.equal(sockets.length, 2);
        await mgr.stop();
    });

    it('the replaced socket is end()ed on reconnect (no half-open leak)', async () => {
        const sockets = [];
        const mgr = autoReconnect(trackedFactory(sockets), { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.connectionLost));
        await settle();
        assert.equal(sockets.length, 2);
        assert.ok(sockets[0].ended >= 1, 'old socket cleaned up (leaked pre-fix)');
        assert.equal(sockets[1].ended, 0, 'live socket untouched');
        await mgr.stop();
        assert.ok(sockets[1].ended >= 1, 'stop() closes the live socket');
    });

    it('loggedOut still terminates the chain and never reconnects', async () => {
        const sockets = [];
        let loggedOut = 0;
        const mgr = autoReconnect(trackedFactory(sockets), {
            logger: silent, baseDelayMs: 1, jitter: 0, onLoggedOut: () => { loggedOut += 1; },
        });
        await mgr.start();
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.loggedOut));
        await settle();
        assert.equal(sockets.length, 1, 'no reconnect after logout');
        assert.equal(loggedOut, 1);
        await mgr.stop();
    });

    it('timeout and network-loss closes reconnect with backoff', async () => {
        const sockets = [];
        const mgr = autoReconnect(trackedFactory(sockets), { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();
        sockets[0].ev.emit('connection.update', closeWith(DisconnectReason.timedOut));
        await settle();
        assert.equal(sockets.length, 2, 'timedOut reconnects');
        sockets[1].ev.emit('connection.update', closeWith(DisconnectReason.connectionClosed));
        await settle();
        assert.equal(sockets.length, 3, 'connectionClosed reconnects');
        assert.equal(mgr.attempts, 2, 'consecutive failures accumulate');
        await mgr.stop();
    });
});
