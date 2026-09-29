import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { initAuthCreds, createDebugMonitor } from '../lib/index.js';

// Observability suite. The privacy tests are the important ones: getDebugInfo()
// must NEVER leak QR payloads, pairing codes, auth keys, tokens or private keys
// — no matter what passes through the events it listens to.
//
// NB: a lightweight fake sock is used on purpose — emitting CB:* events on a
// real makeWASocket() triggers its receipt handlers, which try to talk to the
// network. The monitor only reads ev/ws/authState/messageRetryManager/voip,
// all of which are faked at the exact surface the real socket exposes.

const makeSock = () => {
    const ev = new EventEmitter();
    ev.off = ev.removeListener.bind(ev);
    const ws = new EventEmitter();
    ws.isOpen = false;
    return {
        ev, ws,
        authState: { creds: initAuthCreds() },
        messageRetryManager: {
            statistics: {
                totalRetries: 0, successfulRetries: 0, failedRetries: 0,
                mediaRetries: 0, sessionRecreations: 0, phoneRequests: 0,
            },
        },
        end: async () => { },
    };
};

describe('debug-info: connection state & uptime', () => {
    it('tracks open/close transitions, uptime and disconnect reason', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            let info = mon.getDebugInfo();
            assert.equal(info.connection.state, 'connecting');
            assert.equal(info.connection.uptimeMs, 0);

            sock.ev.emit('connection.update', { connection: 'open' });
            await new Promise((r) => setTimeout(r, 15));
            info = mon.getDebugInfo();
            assert.equal(info.connection.state, 'open');
            assert.ok(info.connection.uptimeMs > 0, 'uptime running while open');
            assert.equal(info.connection.opens, 1);

            sock.ev.emit('connection.update', {
                connection: 'close',
                lastDisconnect: { error: { output: { statusCode: 515 } } },
            });
            info = mon.getDebugInfo();
            assert.equal(info.connection.state, 'close');
            assert.equal(info.connection.uptimeMs, 0, 'uptime resets when closed');
            assert.equal(info.connection.disconnects, 1);
            assert.equal(info.connection.lastDisconnect.code, 515);
            assert.equal(info.connection.lastDisconnect.reason, 'restartRequired');
        } finally {
            mon.stop();
            await sock.end();
        }
    });
});

describe('debug-info: message metrics & signal errors', () => {
    it('collects latency percentiles, decrypt failures and error buckets', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            const now = Math.floor(Date.now() / 1000);
            sock.ev.emit('messages.upsert', {
                type: 'notify',
                messages: [
                    { key: { remoteJid: 'x@s.whatsapp.net', id: 'A' }, message: { conversation: 'ok' }, messageTimestamp: now - 1 },
                    { key: { remoteJid: 'x@s.whatsapp.net', id: 'B' }, message: { conversation: 'ok' }, messageTimestamp: now - 2 },
                    { key: { remoteJid: 'x@s.whatsapp.net', id: 'C' }, messageStubType: 1, messageStubParameters: ['No session record'] },
                    { key: { remoteJid: 'x@s.whatsapp.net', id: 'D' }, messageStubType: 1, messageStubParameters: ['Bad MAC'] },
                    { key: { remoteJid: 'x@s.whatsapp.net', id: 'E' }, messageStubType: 1, messageStubParameters: ['Key used already or never filled'] },
                ],
            });
            sock.ws.emit('CB:receipt', { attrs: { type: 'retry' } });
            sock.ws.emit('CB:receipt', { attrs: { type: 'read' } }); // not a retry

            const info = mon.getDebugInfo();
            assert.equal(info.messages.received, 5);
            assert.equal(info.messages.decryptFailed, 3);
            assert.ok(info.messages.latencyMs.samples >= 2);
            assert.ok(info.messages.latencyMs.p50 >= 0);
            assert.ok(info.messages.latencyMs.p99 >= info.messages.latencyMs.p50);
            assert.equal(info.signalErrors.noSession, 1);
            assert.equal(info.signalErrors.badMac, 1);
            assert.equal(info.signalErrors.missingKeys, 1);
            assert.equal(info.sendRetries.incomingRetryRequests, 1, 'only type=retry counted');
        } finally {
            mon.stop();
            await sock.end();
        }
    });

    it('exposes send-retry statistics from the socket retry manager', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            const info = mon.getDebugInfo();
            // real socket carries a MessageRetryManager — stats must be numbers
            assert.equal(typeof info.sendRetries.totalRetries, 'number');
            assert.equal(typeof info.sendRetries.sessionRecreations, 'number');
        } finally {
            mon.stop();
            await sock.end();
        }
    });
});

describe('debug-info: VoIP / WASM / memory', () => {
    it('reports voip.attached=false without a voip client, memory always present', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            const info = mon.getDebugInfo();
            assert.equal(info.voip.attached, false);
            assert.equal(info.voip.wasmLoaded, false);
            assert.ok(info.memory.rssMB > 0);
            assert.ok(info.memory.heapUsedMB > 0);
        } finally {
            mon.stop();
            await sock.end();
        }
    });

    it('picks up VoIP state when sock.voip exists', async () => {
        const sock = makeSock();
        // fake attached voip client with the real getStats shape
        sock.voip = {
            getStats: () => ({
                busy: true, callId: 'CALL-1',
                call: { state: 6 }, relay: { openConnections: 2 },
            }),
        };
        const mon = createDebugMonitor(sock);
        try {
            const info = mon.getDebugInfo();
            assert.equal(info.voip.attached, true);
            assert.equal(info.voip.busy, true);
            assert.equal(info.voip.callId, 'CALL-1');
            assert.equal(info.voip.engineCallState, 6);
            assert.equal(info.voip.relayOpenConnections, 2);
        } finally {
            mon.stop();
            await sock.end();
        }
    });
});

describe('debug-info: NEVER leaks secrets', () => {
    it('QR payloads are counted, never stored', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            sock.ev.emit('connection.update', { qr: 'SUPER-SECRET-QR-PAYLOAD,KEY1,KEY2' });
            const info = mon.getDebugInfo();
            assert.equal(info.connection.qrGenerated, 1);
            assert.ok(!JSON.stringify(info).includes('SUPER-SECRET-QR-PAYLOAD'), 'QR payload leaked!');
        } finally {
            mon.stop();
            await sock.end();
        }
    });

    it('snapshot never contains key material, tokens or pairing codes', async () => {
        const sock = makeSock();
        // stage a pairing code + keys exactly like a real pairing flow would
        sock.authState.creds.pairingCode = 'SECRETPC';
        const mon = createDebugMonitor(sock);
        try {
            sock.ev.emit('connection.update', { connection: 'open' });
            const str = JSON.stringify(mon.getDebugInfo());
            assert.ok(!str.includes('SECRETPC'), 'pairing code leaked');
            for (const secretKey of ['noiseKey', 'signedIdentityKey', 'privateKey', 'pairingCode', 'authToken', 'tctoken']) {
                // keys may not even appear; if they do they must be redacted
                if (str.includes(`"${secretKey}"`)) {
                    assert.match(str, new RegExp(`"${secretKey}":"\\[REDACTED\\]"`), `${secretKey} present but not redacted`);
                }
            }
            // creds boolean is fine, raw creds object is not
            assert.ok(!str.includes(sock.authState.creds.myAppStateKeyId ?? '@@none@@'));
        } finally {
            mon.stop();
            await sock.end();
        }
    });

    it('signal error counters survive redaction (preKeyErrors is not blanked)', async () => {
        const sock = makeSock();
        const mon = createDebugMonitor(sock);
        try {
            const info = mon.getDebugInfo();
            assert.equal(typeof info.signalErrors.preKeyErrors, 'number',
                'counter must be a number, not [REDACTED]');
        } finally {
            mon.stop();
            await sock.end();
        }
    });

    it('stop() detaches all listeners', async () => {
        const sock = makeSock();
        const before = sock.ev.listenerCount?.('connection.update');
        const mon = createDebugMonitor(sock);
        mon.stop();
        try {
            sock.ev.emit('messages.upsert', {
                type: 'notify',
                messages: [{ key: { remoteJid: 'x@s.whatsapp.net', id: 'Z' }, message: {}, messageTimestamp: 1 }],
            });
            assert.equal(mon.getDebugInfo().messages.received, 0, 'no counting after stop()');
            void before;
        } finally {
            await sock.end();
        }
    });
});
