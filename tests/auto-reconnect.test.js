import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { autoReconnect, DisconnectReason, makeWASocketAuto, makeWASocket } from '../lib/index.js';

const silent = pino({ level: 'silent' });

// Minimal socket stand-in: real EventEmitter surface, no network.
const fakeSocket = () => {
    const ev = new EventEmitter();
    return { ev, end: async () => { }, __id: Math.random() };
};

const boomLike = (statusCode) => ({ output: { statusCode } });

describe('autoReconnect', () => {
    it('reconnects with a fresh socket after a non-fatal close', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();
        assert.equal(sockets.length, 1);
        sockets[0].ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: boomLike(DisconnectReason.connectionLost) },
        });
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(sockets.length, 2, 'a second socket must be created');
        assert.notEqual(mgr.socket, sockets[0]);
        await mgr.stop();
    });

    it('never reconnects on loggedOut and fires onLoggedOut', async () => {
        const sockets = [];
        let loggedOut = false;
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, onLoggedOut: () => { loggedOut = true; } });
        await mgr.start();
        sockets[0].ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: boomLike(DisconnectReason.loggedOut) },
        });
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(sockets.length, 1, 'no reconnect after loggedOut');
        assert.equal(loggedOut, true);
        await mgr.stop();
    });

    it('resets the attempt counter on open and honors maxAttempts', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0, maxAttempts: 2 });
        await mgr.start();
        const close = (s) => s.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: boomLike(DisconnectReason.connectionLost) },
        });
        close(sockets[0]);
        await new Promise((r) => setTimeout(r, 30));
        sockets[1].ev.emit('connection.update', { connection: 'open' });
        assert.equal(mgr.attempts, 0, 'open resets counter');
        close(sockets[1]);
        await new Promise((r) => setTimeout(r, 30));
        close(sockets[2]);
        await new Promise((r) => setTimeout(r, 30));
        close(sockets[3]);
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(sockets.length, 4, 'third consecutive failure exceeds maxAttempts=2');
        await mgr.stop();
    });

    it('stop() prevents any further reconnects', async () => {
        const sockets = [];
        const mgr = autoReconnect(() => {
            const s = fakeSocket();
            sockets.push(s);
            return s;
        }, { logger: silent, baseDelayMs: 1, jitter: 0 });
        await mgr.start();
        await mgr.stop();
        sockets[0].ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: boomLike(DisconnectReason.connectionLost) },
        });
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(sockets.length, 1);
    });
});

describe('makeWASocketAuto', () => {
    it('is exported and rejects sync misuse of version:auto', () => {
        assert.equal(typeof makeWASocketAuto, 'function');
        assert.throws(() => makeWASocket({ version: 'auto' }), /makeWASocketAuto/);
    });
});
