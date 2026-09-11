import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { autoReconnect, DisconnectReason } from '../lib/index.js';

// Regression tests for the auto-reconnect race fix plus stress coverage.
//
// The two bugs these lock in (both reproduced against the pre-fix code):
//   1. double-close: the same socket emitting 'close' twice scheduled two
//      parallel reconnect chains → 3 sockets where 2 are correct.
//   2. stale-close: an already-replaced socket emitting a late 'close'
//      spawned a ghost socket on top of the live one.

const silent = pino({ level: 'silent' });

const fakeSocket = () => {
    const ev = new EventEmitter();
    return { ev, end: async () => {}, __id: Math.random() };
};

const closeUpdate = (statusCode = DisconnectReason.connectionLost) => ({
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode } } },
});

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('autoReconnect race regressions', () => {
    it('double-close from one socket schedules exactly one reconnect', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();

        // ws teardown paths can fire 'close' more than once on the same socket
        sockets[0].ev.emit('connection.update', closeUpdate());
        sockets[0].ev.emit('connection.update', closeUpdate());
        await settle();

        assert.equal(sockets.length, 2, 'exactly one replacement socket (was 3 pre-fix)');
        assert.equal(mgr.socket, sockets[1]);
        await mgr.stop();
    });

    it('a stale socket closing late never spawns a ghost socket', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();

        sockets[0].ev.emit('connection.update', closeUpdate());
        await settle();
        assert.equal(sockets.length, 2);

        // late event from the long-dead first socket (e.g. a buffered ws error)
        sockets[0].ev.emit('connection.update', closeUpdate());
        await settle();

        assert.equal(sockets.length, 2, 'stale close ignored (was 3 pre-fix)');
        assert.equal(mgr.socket, sockets[1], 'live socket untouched');
        await mgr.stop();
    });

    it('stale open never resets the attempt counter of the live chain', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();

        sockets[0].ev.emit('connection.update', closeUpdate());
        await settle();
        assert.equal(mgr.attempts, 1, 'one failed attempt on record');

        // ghost 'open' from the replaced socket must not zero the backoff state
        sockets[0].ev.emit('connection.update', { connection: 'open' });
        assert.equal(mgr.attempts, 1, 'stale open ignored');

        // a real open on the live socket does reset it
        sockets[1].ev.emit('connection.update', { connection: 'open' });
        assert.equal(mgr.attempts, 0);
        await mgr.stop();
    });

    it('loggedOut on a duplicate close still never reconnects', async () => {
        const sockets = [];
        let loggedOut = 0;
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0, onLoggedOut: () => { loggedOut += 1; } });
        await mgr.start();

        sockets[0].ev.emit('connection.update', closeUpdate(DisconnectReason.loggedOut));
        sockets[0].ev.emit('connection.update', closeUpdate(DisconnectReason.loggedOut));
        await settle();

        assert.equal(sockets.length, 1, 'no reconnect after logout');
        assert.equal(loggedOut, 1, 'cleanup callback fired exactly once');
        await mgr.stop();
    });
});

describe('autoReconnect stress', () => {
    it('survives 50 rapid crash/reconnect cycles with a linear socket chain', async () => {
        const CYCLES = 50;
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();

        for (let i = 0; i < CYCLES; i += 1) {
            const current = mgr.socket;
            current.ev.emit('connection.update', { connection: 'open' }); // connected fine…
            // …then crashes messily: duplicate close + a late event from the
            // previous socket, exactly what flaky mobile networks produce
            current.ev.emit('connection.update', closeUpdate());
            current.ev.emit('connection.update', closeUpdate());
            if (i > 0) sockets[i - 1].ev.emit('connection.update', closeUpdate());
            await settle(10);
            assert.equal(sockets.length, i + 2, `cycle ${i}: chain must stay linear`);
        }

        assert.equal(sockets.length, CYCLES + 1);
        assert.equal(mgr.socket, sockets[CYCLES]);
        await mgr.stop();
    });

    it('backoff counts consecutive failures and one open heals it', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();

        for (let i = 0; i < 5; i += 1) {
            mgr.socket.ev.emit('connection.update', closeUpdate());
            await settle(10);
        }
        assert.equal(mgr.attempts, 5, 'five consecutive failures tracked');

        mgr.socket.ev.emit('connection.update', { connection: 'open' });
        assert.equal(mgr.attempts, 0, 'success resets the backoff');
        await mgr.stop();
    });

    it('maxAttempts stops the chain even under duplicate closes', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0, maxAttempts: 3 });
        await mgr.start();

        for (let i = 0; i < 6; i += 1) {
            const current = mgr.socket;
            current.ev.emit('connection.update', closeUpdate());
            current.ev.emit('connection.update', closeUpdate());
            await settle(10);
        }

        // 1 initial + 3 allowed reconnects, then the manager gives up
        assert.equal(sockets.length, 4, 'no sockets created past maxAttempts');
        await mgr.stop();
    });

    it('stop() during the backoff window cancels the pending reconnect', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 5000, jitter: 0 });
        await mgr.start();

        sockets[0].ev.emit('connection.update', closeUpdate());
        await mgr.stop(); // while the 5s timer is pending
        await settle(30);

        assert.equal(sockets.length, 1, 'pending reconnect cancelled');
    });
});
