/**
 * Relay transport.
 *
 * Tunnels UDP traffic to WhatsApp's edge relay servers via WebRTC data
 * channels (using `@roamhq/wrtc`). Mirrors the browser client's behavior:
 * pre-negotiated SCTP, custom DTLS fingerprint, ICE restart on idle.
 *
 * @author J.AP
 */
import { appendFileSync } from "node:fs";
const RELAY_PROTO_UDP = 0;
const FAUX_WEB_CLIENT_RELAY_PORT = 3478;
const TRUE_WEB_CLIENT_RELAY_PORT = 3480;
const CONNECTION_TIMEOUT_MS = 20_000;
const ICE_RESTART_IDLE_THRESHOLD_MS = 10_000;
const ICE_RTT_POLL_MS = 1_000;
const MAX_BUFFER_SIZE = 256 * 1024;
const RELAY_PACKET_LOG_PATH = process.env.CALL_DUMP_RELAY_PACKETS_PATH ?? "";
const DISABLE_IPV6 = process.env.CALL_DISABLE_IPV6 !== "0";
const RELAY_PORT_MODE = process.env.CALL_RELAY_PORT_MODE === "web" ? "web" : "original";
const USE_ORIGINAL_RELAY_PORTS = RELAY_PORT_MODE === "original";
const RELAY_DTLS_FINGERPRINT = "F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68";
const getConnectionIdentifier = (ip, port) => ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
const createEmptyStats = () => ({
    sentPackets: 0,
    receivedPackets: 0,
    sentBytes: 0,
    receivedBytes: 0,
    droppedPackets: 0,
    openConnections: 0,
});
const getRelayLookupId = (ip, port) => getConnectionIdentifier(ip, port === TRUE_WEB_CLIENT_RELAY_PORT ? TRUE_WEB_CLIENT_RELAY_PORT : port);
const getRtcConnectPort = (info) => info.ip === "157.240.24.133" ? FAUX_WEB_CLIENT_RELAY_PORT : info.port;
const getVoipStackPort = (info) => {
    if (USE_ORIGINAL_RELAY_PORTS)
        return info.originalPort || info.port;
    const sourcePort = info.originalPort || info.port;
    return sourcePort === TRUE_WEB_CLIENT_RELAY_PORT
        ? TRUE_WEB_CLIENT_RELAY_PORT
        : FAUX_WEB_CLIENT_RELAY_PORT;
};
// JAP@Fix (§2.79): drops were only ever counted on the per-connection stats object, which
// nothing exposed -- so `getStats().droppedPackets`, the one counter callers can read, stayed
// at 0 no matter how much traffic the transport threw away. Every drop now hits both.
const countDrop = (connection, totals) => {
    connection.stats.droppedPackets += 1;
    if (totals) {
        totals.droppedPackets += 1;
    }
};
const bufferPacket = (connection, packet, totals) => {
    if (packet.byteLength > MAX_BUFFER_SIZE) {
        countDrop(connection, totals);
        return false;
    }
    while (connection.packetBuffer.length > 0 &&
        connection.bufferedBytes + packet.byteLength > MAX_BUFFER_SIZE) {
        const dropped = connection.packetBuffer.shift();
        if (dropped) {
            connection.bufferedBytes -= dropped.byteLength;
            countDrop(connection, totals);
        }
    }
    connection.packetBuffer.push(packet);
    connection.bufferedBytes += packet.byteLength;
    return true;
};
const shiftPacket = (connection) => {
    const packet = connection.packetBuffer.shift() ?? null;
    if (packet)
        connection.bufferedBytes -= packet.byteLength;
    return packet;
};
const replaceIceCredentials = (sdp, ufrag, pwd) => sdp
    .replace(/a=ice-ufrag:[^\r\n]+/g, `a=ice-ufrag:${ufrag}`)
    .replace(/a=ice-pwd:[^\r\n]+/g, `a=ice-pwd:${pwd}`);
const replaceDtlsFingerprint = (sdp, algorithm, fingerprint) => sdp.replace(/a=fingerprint:[^\r\n]+/g, `a=fingerprint:${algorithm} ${fingerprint}`);
const removeIceCandidates = (sdp) => sdp
    .replace(/a=candidate:[^\r\n]+\r?\n/g, "")
    .replace(/a=end-of-candidates\r?\n?/g, "");
const appendRelayCandidate = (sdp, ip, port) => {
    const candidate = `a=candidate:2 1 udp 2122262783 ${ip} ${port} typ host generation 0 network-cost 5`;
    return `${removeIceCandidates(sdp)}${candidate}\r\na=end-of-candidates\r\n`;
};
const buildRemoteRelayAnswer = (offerSdp, info) => {
    const setupLine = info.enableEdgerayDtlsActiveMode ? "a=setup:active" : "a=setup:passive";
    let answerSdp = offerSdp.replace(/a=setup:actpass/g, setupLine);
    answerSdp = replaceIceCredentials(answerSdp, info.authToken ?? info.token, info.key);
    answerSdp = replaceDtlsFingerprint(answerSdp, "sha-256", RELAY_DTLS_FINGERPRINT);
    answerSdp = answerSdp.replace(/a=ice-options:[^\r\n]+\r\n/g, "");
    answerSdp = answerSdp.replace(/a=max-message-size:[^\r\n]+/g, "a=max-message-size:1200");
    return appendRelayCandidate(answerSdp, info.ip, info.port);
};
const toArrayBuffer = (data) => {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
};
const toUint8Array = (data) => {
    if (data instanceof Uint8Array)
        return new Uint8Array(data);
    if (Buffer.isBuffer(data))
        return new Uint8Array(data);
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (data && typeof data === "object" && "byteLength" in data && "buffer" in data) {
        const view = data;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    return null;
};
const classifyRelayPacket = (packet) => {
    if (packet.byteLength < 2)
        return "non_stun";
    const bytes = new Uint8Array(packet);
    const first = bytes[0];
    const second = bytes[1];
    if ((first & 0xc0) !== 0)
        return "non_stun";
    const stunType = ((first & 0x3f) << 8) | second;
    if (stunType === 0x0001)
        return "stun_bind";
    if (stunType === 0x0003)
        return "stun_alloc";
    return "stun_unknown";
};
const appendRelayPacketLog = (direction, connection, packet) => {
    if (!RELAY_PACKET_LOG_PATH)
        return;
    const buffer = packet instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(packet))
        : Buffer.from(packet.buffer, packet.byteOffset, packet.byteLength);
    appendFileSync(RELAY_PACKET_LOG_PATH, JSON.stringify({
        ts: new Date().toISOString(),
        direction,
        id: connection.info.id,
        relayId: connection.info.relayId,
        relayName: connection.info.name,
        ip: connection.info.ip,
        rtcPort: connection.info.port,
        voipPort: getVoipStackPort(connection.info),
        size: buffer.byteLength,
        hex: buffer.toString("hex"),
    }) + "\n");
};
export class RelayRtcTransport {
    config;
    #relayInfoById = new Map();
    #connections = new Map();
    #totals = createEmptyStats();
    #wrtcPromise = null;
    #closed = false;
    constructor(config) {
        this.config = config;
    }
    updateRelayList = (update) => {
        const nextInfoById = new Map();
        for (const relay of update.relays ?? []) {
            if (relay.token_id == null || relay.token_id < 0 ||
                relay.token_id >= (update.relay_tokens ?? []).length) {
                continue;
            }
            const authToken = update.auth_tokens && relay.auth_token_id != null && relay.auth_token_id >= 0
                ? update.auth_tokens[relay.auth_token_id]
                : undefined;
            for (const address of relay.addresses ?? []) {
                if (address.protocol !== RELAY_PROTO_UDP)
                    continue;
                if (address.ipv4 && address.port != null) {
                    const clientPort = USE_ORIGINAL_RELAY_PORTS ? address.port : TRUE_WEB_CLIENT_RELAY_PORT;
                    const id = getConnectionIdentifier(address.ipv4, clientPort);
                    nextInfoById.set(id, {
                        id,
                        relayId: relay.relay_id,
                        ip: address.ipv4,
                        port: clientPort,
                        originalPort: address.port,
                        isIPv6: false,
                        token: update.relay_tokens[relay.token_id],
                        authToken,
                        key: update.relay_key,
                        name: relay.relay_name,
                        enableEdgerayDtlsActiveMode: update.enable_edgeray_dtls_active_mode === true,
                    });
                }
                if (!DISABLE_IPV6 && address.ipv6 && address.port_v6 != null) {
                    const clientPort = USE_ORIGINAL_RELAY_PORTS ? address.port_v6 : TRUE_WEB_CLIENT_RELAY_PORT;
                    const id = getConnectionIdentifier(address.ipv6, clientPort);
                    nextInfoById.set(id, {
                        id,
                        relayId: relay.relay_id,
                        ip: address.ipv6,
                        port: clientPort,
                        originalPort: address.port_v6,
                        isIPv6: true,
                        token: update.relay_tokens[relay.token_id],
                        authToken,
                        key: update.relay_key,
                        name: relay.relay_name,
                        enableEdgerayDtlsActiveMode: update.enable_edgeray_dtls_active_mode === true,
                    });
                }
            }
        }
        for (const id of this.#relayInfoById.keys()) {
            if (!nextInfoById.has(id))
                this.#closeConnection(id);
        }
        this.#relayInfoById.clear();
        for (const [id, info] of nextInfoById) {
            this.#relayInfoById.set(id, info);
            this.#startConnection(info);
        }
    };
    send = (packet, ip, port) => {
        const requestedId = getConnectionIdentifier(ip, port);
        const preferredPort = USE_ORIGINAL_RELAY_PORTS ? port : TRUE_WEB_CLIENT_RELAY_PORT;
        const candidateIds = [
            requestedId,
            getConnectionIdentifier(ip, preferredPort),
            getRelayLookupId(ip, TRUE_WEB_CLIENT_RELAY_PORT),
            getRelayLookupId(ip, FAUX_WEB_CLIENT_RELAY_PORT),
        ];
        let info;
        for (const candidateId of candidateIds) {
            info = this.#relayInfoById.get(candidateId);
            if (info)
                break;
        }
        if (!info) {
            if (DISABLE_IPV6 && ip.includes(":"))
                return 0;
            const earlyConnection = this.#getOrCreateEarlyConnection(ip, port);
            bufferPacket(earlyConnection, toArrayBuffer(packet), this.#totals);
            return packet.byteLength;
        }
        const connection = this.#getOrCreateConnection(info);
        const arrayBuffer = toArrayBuffer(packet);
        if (classifyRelayPacket(arrayBuffer) === "stun_alloc" &&
            connection.state === "open" &&
            connection.sentMedia &&
            Date.now() - connection.lastRxPacketTime > ICE_RESTART_IDLE_THRESHOLD_MS) {
            connection.packetBuffer = [];
            connection.bufferedBytes = 0;
            bufferPacket(connection, arrayBuffer, this.#totals);
            this.#restartIce(connection).catch(err => this.#onConnectionError(connection.info, err));
            return packet.byteLength;
        }
        if (connection.state === "open" && connection.dataChannel?.readyState === "open") {
            if (!this.#sendBufferedPacket(connection, arrayBuffer)) {
                countDrop(connection, this.#totals);
            }
            return packet.byteLength;
        }
        bufferPacket(connection, arrayBuffer, this.#totals);
        this.#startConnection(info);
        return packet.byteLength;
    };
    /**
     * Per-connection view of the same counters `getStats()` aggregates — plus the live
     * connection state, how much is still sitting in the send buffer, and the last ICE RTT.
     * This is what you look at when a call is up but the audio is not flowing.
     */
    getConnectionStats = () => {
        return [...this.#connections.values()].map(connection => ({
            id: connection.info.id,
            relayName: connection.info.name,
            ip: connection.info.ip,
            port: getVoipStackPort(connection.info),
            state: connection.state,
            bufferedPackets: connection.packetBuffer.length,
            bufferedBytes: connection.bufferedBytes,
            lastIceRttMs: connection.lastIceRttMs,
            ...connection.stats
        }));
    };
    getStats = () => {
        let openConnections = 0;
        for (const connection of this.#connections.values()) {
            if (connection.state === "open")
                openConnections += 1;
        }
        return { ...this.#totals, openConnections };
    };
    /**
     * JAP@Fix (§2.218): `closeAll()` used to close only the connections present in the map
     * at that instant. `#connect()` is async -- it awaits the `@roamhq/wrtc` import before
     * constructing anything -- so a connection started moments earlier would build its
     * RTCPeerConnection AFTER closeAll() had already walked past it, attaching a live
     * native peer to an object nobody holds any more. An unclosed RTCPeerConnection keeps
     * libuv handles open, so the host process never exits: a CLI that hung up a call still
     * hung on shutdown, and the test suite itself stopped terminating once the optional
     * package was actually installed.
     *
     * Now close is a latch: `#connect()` re-checks it after the await and refuses to build
     * a peer on a closed transport, so the only peers that exist are ones the map already
     * knows about and this loop already closes.
     *
     * A first attempt also awaited in-flight connect promises and swept a set of every
     * peer ever constructed, to cover the window between `new RTCPeerConnection()` and its
     * assignment to the connection. Both were removed: no delay between 0ms and 200ms
     * could make either one bite, while removing the latch fails the suite immediately.
     * Untested code that looks like safety is not safety.
     */
    closeAll = async () => {
        this.#closed = true;
        for (const id of [...this.#connections.keys()])
            this.#closeConnection(id);
    };
    // ─── private ──────────────────────────────────────────────────────────────
    /**
     * JAP@Fix (§2.79): connections used to be kicked off with `void this.#ensureConnection()`.
     * Nothing caught the rejection, so a relay list arriving on an install without the
     * optional `@roamhq/wrtc` package (the loader throws on purpose to say so) produced an
     * unhandled rejection — which terminates the process on Node >= 15. Failures are now
     * reported through `onTransportError`/`logger` and the connection is marked failed.
     */
    #startConnection = (info) => {
        this.#ensureConnection(info).catch(err => this.#onConnectionError(info, err));
    };
    #onConnectionError = (info, err) => {
        const connection = this.#connections.get(info.id);
        if (connection && connection.state !== "open") {
            connection.state = "failed";
        }
        this.config.logger?.warn?.({ err, relay: info.id }, "relay transport connection failed");
        try {
            this.config.onTransportError?.(err instanceof Error ? err : new Error(String(err)), info);
        }
        catch { }
    };
    #getOrCreateConnection = (info) => {
        const existing = this.#connections.get(info.id);
        if (existing) {
            existing.info = info;
            return existing;
        }
        const created = {
            info, state: "none", peerConnection: null, dataChannel: null,
            iceCandidate: null, packetBuffer: [], bufferedBytes: 0,
            connectPromise: null, connectionTimeout: null, iceStatsInterval: null,
            lastIceRttMs: null, hasReceivedFirstPacket: false,
            hasNonStunPacketSent: false, sentMedia: false, lastRxPacketTime: 0,
            isReconnecting: false, stats: createEmptyStats(),
        };
        this.#connections.set(info.id, created);
        return created;
    };
    #getOrCreateEarlyConnection = (ip, port) => {
        const id = getConnectionIdentifier(ip, port);
        const existing = this.#connections.get(id);
        if (existing)
            return existing;
        const placeholderInfo = {
            id, relayId: 0, ip, port, originalPort: port,
            isIPv6: ip.includes(":"), token: "", key: "",
            name: "early-packet", enableEdgerayDtlsActiveMode: false,
        };
        const created = {
            info: placeholderInfo, state: "none", peerConnection: null,
            dataChannel: null, iceCandidate: null, packetBuffer: [],
            bufferedBytes: 0, connectPromise: null, connectionTimeout: null,
            iceStatsInterval: null, lastIceRttMs: null,
            hasReceivedFirstPacket: false, hasNonStunPacketSent: false,
            sentMedia: false, lastRxPacketTime: 0, isReconnecting: false,
            stats: createEmptyStats(),
        };
        this.#connections.set(id, created);
        return created;
    };
    #ensureConnection = async (info) => {
        const connection = this.#getOrCreateConnection(info);
        if (connection.state === "open" || connection.state === "connecting") {
            return connection.connectPromise ?? Promise.resolve();
        }
        const promise = this.#connect(connection);
        connection.connectPromise = promise;
        try {
            await promise;
        }
        finally {
            connection.connectPromise = null;
        }
    };
    #connect = async (connection) => {
        const wrtcModule = await this.#loadWrtc();
        const { RTCPeerConnection } = wrtcModule;
        if (typeof RTCPeerConnection !== "function") {
            throw new Error("RTCPeerConnection unavailable from @roamhq/wrtc");
        }
        // §2.218: the await above means the transport may have been closed while this
        // connect was in flight. Building a peer now would leak a native handle.
        if (this.#closed) {
            throw new Error("relay transport is closed");
        }
        this.#closePeerObjects(connection);
        connection.state = "connecting";
        const pc = new RTCPeerConnection();
        const dc = pc.createDataChannel("pre-negotiated", {
            negotiated: true, id: 0, ordered: false, maxRetransmits: 0, priority: "high",
        });
        connection.peerConnection = pc;
        connection.dataChannel = dc;
        dc.binaryType = "arraybuffer";
        dc.onopen = () => {
            connection.state = "open";
            connection.isReconnecting = false;
            if (connection.connectionTimeout) {
                clearTimeout(connection.connectionTimeout);
                connection.connectionTimeout = null;
            }
            this.#flushBufferedPackets(connection);
            this.#startIceRttPolling(connection);
        };
        dc.onclose = () => {
            if (connection.state !== "failed")
                connection.state = "closed";
        };
        dc.onerror = () => {
            connection.state = "failed";
        };
        dc.onmessage = (event) => {
            this.#handleIncomingPacket(connection, event.data);
        };
        pc.onicecandidate = (event) => {
            if (event.candidate?.candidate && !connection.iceCandidate) {
                connection.iceCandidate = event.candidate.candidate;
            }
        };
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
                connection.state = "failed";
            }
        };
        connection.connectionTimeout = setTimeout(() => {
            if (connection.state === "connecting") {
                connection.state = "failed";
                this.#closePeerObjects(connection);
            }
        }, CONNECTION_TIMEOUT_MS);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const remoteSdp = buildRemoteRelayAnswer(offer.sdp ?? "", {
            ...connection.info,
            port: getRtcConnectPort(connection.info),
        });
        await pc.setRemoteDescription({ type: "answer", sdp: remoteSdp });
    };
    #restartIce = async (connection) => {
        if (connection.isReconnecting || !connection.hasNonStunPacketSent)
            return;
        const { RTCPeerConnection } = await this.#loadWrtc();
        if (typeof RTCPeerConnection !== "function")
            return;
        connection.isReconnecting = true;
        try {
            this.#closePeerObjects(connection);
            connection.state = "connecting";
            const pc = new RTCPeerConnection();
            const dc = pc.createDataChannel("pre-negotiated", {
                negotiated: true, id: 0, ordered: false, maxRetransmits: 0, priority: "high",
            });
            connection.peerConnection = pc;
            connection.dataChannel = dc;
            dc.binaryType = "arraybuffer";
            dc.onopen = () => {
                connection.state = "open";
                connection.isReconnecting = false;
                this.#flushBufferedPackets(connection);
                this.#startIceRttPolling(connection);
            };
            dc.onclose = () => { if (connection.state !== "failed")
                connection.state = "closed"; };
            dc.onerror = () => { connection.state = "failed"; };
            dc.onmessage = (event) => {
                this.#handleIncomingPacket(connection, event.data);
            };
            pc.onicecandidate = (event) => {
                if (event.candidate?.candidate && !connection.iceCandidate) {
                    connection.iceCandidate = event.candidate.candidate;
                }
            };
            const offer = await pc.createOffer({ iceRestart: false });
            let localSdp = offer.sdp ?? "";
            if (connection.iceCandidate) {
                localSdp = `${removeIceCandidates(localSdp)}a=${connection.iceCandidate}\r\na=end-of-candidates\r\n`;
            }
            await pc.setLocalDescription({ type: "offer", sdp: localSdp });
            const remoteSdp = buildRemoteRelayAnswer(localSdp, {
                ...connection.info,
                port: getRtcConnectPort(connection.info),
            });
            await pc.setRemoteDescription({ type: "answer", sdp: remoteSdp });
        }
        catch {
            connection.state = "failed";
        }
        finally {
            connection.isReconnecting = false;
        }
    };
    #handleIncomingPacket = (connection, raw) => {
        const packet = toUint8Array(raw);
        if (!packet)
            return;
        connection.stats.receivedPackets += 1;
        connection.stats.receivedBytes += packet.byteLength;
        connection.hasReceivedFirstPacket = true;
        connection.lastRxPacketTime = Date.now();
        this.#totals.receivedPackets += 1;
        this.#totals.receivedBytes += packet.byteLength;
        appendRelayPacketLog("recv", connection, packet);
        this.config.onTransportMessage(packet, connection.info.ip, getVoipStackPort(connection.info));
    };
    #flushBufferedPackets = (connection) => {
        while (connection.state === "open" &&
            connection.dataChannel?.readyState === "open" &&
            connection.packetBuffer.length > 0) {
            const packet = shiftPacket(connection);
            if (!packet)
                break;
            if (!this.#sendBufferedPacket(connection, packet)) {
                countDrop(connection, this.#totals);
                break;
            }
        }
    };
    #sendBufferedPacket = (connection, packet) => {
        try {
            connection.dataChannel?.send(packet);
            if (classifyRelayPacket(packet) === "non_stun") {
                connection.hasNonStunPacketSent = true;
                connection.sentMedia = true;
            }
            connection.stats.sentPackets += 1;
            connection.stats.sentBytes += packet.byteLength;
            this.#totals.sentPackets += 1;
            this.#totals.sentBytes += packet.byteLength;
            appendRelayPacketLog("send", connection, packet);
            return true;
        }
        catch {
            return false;
        }
    };
    #startIceRttPolling = (connection) => {
        this.#stopIceRttPolling(connection);
        const pc = connection.peerConnection;
        if (!pc || typeof pc.getStats !== "function" || !this.config.onIceRtt)
            return;
        const poll = async () => {
            const rttMs = await this.#readCurrentRoundTripTimeMs(pc);
            if (rttMs == null || connection.lastIceRttMs === rttMs)
                return;
            connection.lastIceRttMs = rttMs;
            this.config.onIceRtt?.(rttMs, connection.info.ip, connection.info.port);
        };
        void poll();
        connection.iceStatsInterval = setInterval(() => { void poll(); }, ICE_RTT_POLL_MS);
        connection.iceStatsInterval.unref?.();
    };
    #stopIceRttPolling = (connection) => {
        if (connection.iceStatsInterval) {
            clearInterval(connection.iceStatsInterval);
            connection.iceStatsInterval = null;
        }
        connection.lastIceRttMs = null;
    };
    #readCurrentRoundTripTimeMs = async (pc) => {
        try {
            const stats = await pc.getStats();
            const reports = stats && typeof stats.values === "function"
                ? Array.from(stats.values())
                : Array.isArray(stats) ? stats : Object.values(stats ?? {});
            if (!reports.length)
                return null;
            let selectedCandidatePairId = "";
            for (const report of reports) {
                if (report?.type === "transport" && typeof report.selectedCandidatePairId === "string") {
                    selectedCandidatePairId = report.selectedCandidatePairId;
                    break;
                }
            }
            const candidatePairs = reports.filter((r) => r?.type === "candidate-pair");
            const selectedPair = (selectedCandidatePairId && candidatePairs.find((r) => r?.id === selectedCandidatePairId)) ||
                candidatePairs.find((r) => r?.selected || r?.nominated) ||
                candidatePairs[0];
            const rttSeconds = typeof selectedPair?.currentRoundTripTime === "number"
                ? selectedPair.currentRoundTripTime
                : typeof selectedPair?.totalRoundTripTime === "number" &&
                    typeof selectedPair?.responsesReceived === "number" &&
                    selectedPair.responsesReceived > 0
                    ? selectedPair.totalRoundTripTime / selectedPair.responsesReceived
                    : null;
            if (rttSeconds == null || !Number.isFinite(rttSeconds) || rttSeconds <= 0)
                return null;
            return Math.max(1, Math.round(rttSeconds * 1000));
        }
        catch {
            return null;
        }
    };
    #closeConnection = (id) => {
        const connection = this.#connections.get(id);
        if (!connection)
            return;
        if (connection.connectionTimeout) {
            clearTimeout(connection.connectionTimeout);
            connection.connectionTimeout = null;
        }
        this.#closePeerObjects(connection);
        connection.state = "closed";
        connection.packetBuffer = [];
        connection.bufferedBytes = 0;
        this.#connections.delete(id);
    };
    #closePeerObjects = (connection) => {
        this.#stopIceRttPolling(connection);
        try {
            connection.dataChannel?.close?.();
        }
        catch { }
        try {
            connection.peerConnection?.close?.();
        }
        catch { }
        connection.dataChannel = null;
        connection.peerConnection = null;
    };
    // JAP@Fix: helpful error when the optional @roamhq/wrtc dep is missing
    #loadWrtc = () => {
        this.#wrtcPromise ??= import("@roamhq/wrtc").then((module) => (module.default ?? module)).catch((err) => {
            this.#wrtcPromise = null;
            throw new Error(`VoIP relay needs the optional "@roamhq/wrtc" package (npm i @roamhq/wrtc). Original error: ${err?.message || err}`);
        });
        return this.#wrtcPromise;
    };
}
