/**
 * JAP@Add --- structured, SAFE debug snapshots for bug reports and monitoring.
 *
 * `createDebugMonitor(sock)` listens to connection/message events and exposes
 * `getDebugInfo()`: connection state, last disconnect reason, socket uptime,
 * message latency percentiles, send/receive retry counts, Signal error
 * tallies, VoIP + WASM state, and process memory usage.
 *
 * Privacy guarantee (enforced, not promised): the snapshot NEVER contains QR
 * payloads, pairing codes, auth keys, tokens, private keys, message contents
 * or JIDs — and the entire snapshot is passed through `redactSecrets()` as a
 * final safety net before it is returned, so even future additions cannot
 * accidentally leak credentials.
 *
 * ```js
 * import { createDebugMonitor } from '@japofc/baileys'
 * const monitor = createDebugMonitor(sock)
 * console.log(monitor.getDebugInfo())
 * ```
 *
 * @author J.AP
 */
import { DisconnectReason } from '../Types/index.js';
import { redactSecrets } from './auth-secure.js';

const REASON_NAMES = {
    [DisconnectReason.loggedOut]: 'loggedOut',
    [DisconnectReason.forbidden]: 'forbidden',
    [DisconnectReason.timedOut]: 'timedOut/connectionLost',
    [DisconnectReason.multideviceMismatch]: 'multideviceMismatch',
    [DisconnectReason.connectionClosed]: 'connectionClosed',
    [DisconnectReason.connectionReplaced]: 'connectionReplaced',
    [DisconnectReason.badSession]: 'badSession',
    [DisconnectReason.restartRequired]: 'restartRequired',
    [DisconnectReason.unavailableService]: 'unavailableService',
};

const LATENCY_SAMPLE_LIMIT = 500;

const percentile = (sorted, p) => {
    if (!sorted.length) {
        return null;
    }
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
};

/** Classify a decrypt-failure stub message into a Signal error bucket. */
const classifySignalError = (text) => {
    const msg = String(text || '');
    if (/No session record|SessionError/i.test(msg)) {
        return 'noSession';
    }
    if (/Bad MAC|MAC verification/i.test(msg)) {
        return 'badMac';
    }
    if (/Key used already or never filled/i.test(msg)) {
        return 'missingKeys';
    }
    if (/InvalidPreKeyId|PreKey/i.test(msg)) {
        // NB: bucket is named *Errors so redactSecrets' key filter ("prekey")
        // does not blank the counter in the final snapshot.
        return 'preKeyErrors';
    }
    if (/Message absent from node/i.test(msg)) {
        return 'messageAbsent';
    }
    return 'other';
};

export const createDebugMonitor = (sock, options = {}) => {
    const { sampleLimit = LATENCY_SAMPLE_LIMIT } = options;

    const state = {
        connection: 'connecting',
        connectedAt: null,
        lastDisconnect: { code: null, reason: null, at: null },
        disconnects: 0,
        opens: 0,
        qrGenerated: 0, // COUNT only — never the QR payload itself
    };
    const latencySamples = []; // ms between messageTimestamp and local receipt
    const counters = {
        messagesReceived: 0,
        messagesDecryptFailed: 0,
        receiveRetryRequests: 0, // retry receipts we RECEIVED (peer failed to decrypt our send)
        signalErrors: { noSession: 0, badMac: 0, missingKeys: 0, preKeyErrors: 0, messageAbsent: 0, other: 0 },
    };

    const onConnectionUpdate = (update) => {
        if (update.qr) {
            state.qrGenerated += 1;
        }
        if (!update.connection) {
            return;
        }
        state.connection = update.connection;
        if (update.connection === 'open') {
            state.opens += 1;
            state.connectedAt = Date.now();
        }
        else if (update.connection === 'close') {
            state.disconnects += 1;
            state.connectedAt = null;
            const code = update.lastDisconnect?.error?.output?.statusCode ?? null;
            state.lastDisconnect = {
                code,
                reason: code !== null ? (REASON_NAMES[code] || `unknown(${code})`) : 'unknown',
                at: Date.now(),
            };
        }
    };

    const onMessagesUpsert = ({ messages, type }) => {
        if (type !== 'notify') {
            return;
        }
        for (const msg of messages || []) {
            counters.messagesReceived += 1;
            // latency: message send-time vs local arrival (clock-skew tolerant window)
            const ts = Number(msg.messageTimestamp) * 1000;
            if (Number.isFinite(ts) && ts > 0) {
                const lat = Date.now() - ts;
                if (lat >= 0 && lat < 5 * 60 * 1000) {
                    latencySamples.push(lat);
                    if (latencySamples.length > sampleLimit) {
                        latencySamples.shift();
                    }
                }
            }
            // Signal decrypt failures surface as CIPHERTEXT stubs
            if (msg.messageStubType === 1 /* CIPHERTEXT */ || (!msg.message && msg.messageStubParameters?.length)) {
                counters.messagesDecryptFailed += 1;
                const bucket = classifySignalError(msg.messageStubParameters?.[0]);
                counters.signalErrors[bucket] += 1;
            }
        }
    };

    const onReceipt = ({ attrs } = {}) => {
        if (attrs?.type === 'retry') {
            counters.receiveRetryRequests += 1;
        }
    };

    sock.ev.on('connection.update', onConnectionUpdate);
    sock.ev.on('messages.upsert', onMessagesUpsert);
    sock.ws?.on?.('CB:receipt', onReceipt);

    const getDebugInfo = () => {
        const sorted = [...latencySamples].sort((a, b) => a - b);
        const retryStats = sock.messageRetryManager?.statistics;
        const mem = process.memoryUsage();
        const voipStats = (() => {
            try {
                return sock.voip?.getStats?.() ?? null;
            }
            catch {
                return null;
            }
        })();
        const info = {
            timestamp: new Date().toISOString(),
            connection: {
                state: state.connection,
                wsOpen: !!sock.ws?.isOpen,
                uptimeMs: state.connectedAt ? Date.now() - state.connectedAt : 0,
                opens: state.opens,
                disconnects: state.disconnects,
                lastDisconnect: { ...state.lastDisconnect },
                qrGenerated: state.qrGenerated, // count only, payload never stored
                // registered device? boolean only — never the creds themselves
                registered: !!sock.authState?.creds?.registered,
            },
            messages: {
                received: counters.messagesReceived,
                decryptFailed: counters.messagesDecryptFailed,
                latencyMs: {
                    samples: sorted.length,
                    p50: percentile(sorted, 50),
                    p90: percentile(sorted, 90),
                    p99: percentile(sorted, 99),
                    max: sorted.length ? sorted[sorted.length - 1] : null,
                },
            },
            sendRetries: retryStats
                ? {
                    totalRetries: retryStats.totalRetries,
                    successfulRetries: retryStats.successfulRetries,
                    failedRetries: retryStats.failedRetries,
                    sessionRecreations: retryStats.sessionRecreations,
                    phoneRequests: retryStats.phoneRequests,
                    incomingRetryRequests: counters.receiveRetryRequests,
                }
                : { incomingRetryRequests: counters.receiveRetryRequests },
            signalErrors: { ...counters.signalErrors },
            voip: voipStats
                ? {
                    attached: true,
                    busy: !!voipStats.busy,
                    callId: voipStats.callId ?? null,
                    wasmLoaded: !!voipStats.call || voipStats.call === null, // engine responded at all
                    engineCallState: voipStats.call?.state ?? null,
                    relayOpenConnections: voipStats.relay?.openConnections ?? null,
                }
                : { attached: false, busy: false, callId: null, wasmLoaded: false, engineCallState: null, relayOpenConnections: null },
            memory: {
                rssMB: Math.round(mem.rss / 1048576),
                heapUsedMB: Math.round(mem.heapUsed / 1048576),
                heapTotalMB: Math.round(mem.heapTotal / 1048576),
                externalMB: Math.round(mem.external / 1048576),
            },
        };
        // Final safety net: even if a future field accidentally carries a
        // secret-looking key, it leaves this function redacted.
        return redactSecrets(info);
    };

    const stop = () => {
        sock.ev.off?.('connection.update', onConnectionUpdate);
        sock.ev.off?.('messages.upsert', onMessagesUpsert);
        sock.ws?.off?.('CB:receipt', onReceipt);
    };

    return { getDebugInfo, stop };
};
