type RelayAddress = {
    protocol: number;
    ipv4?: string;
    ipv6?: string;
    port?: number;
    port_v6?: number;
};
type RelayDescriptor = {
    relay_id: number;
    relay_name: string;
    token_id: number;
    auth_token_id?: number;
    addresses: RelayAddress[];
};
export type RelayListUpdatePayload = {
    relay_key: string;
    relay_tokens: string[];
    auth_tokens?: string[];
    enable_edgeray_dtls_active_mode?: boolean;
    relays: RelayDescriptor[];
};
export type RelayTransportStats = {
    sentPackets: number;
    receivedPackets: number;
    sentBytes: number;
    receivedBytes: number;
    droppedPackets: number;
    openConnections: number;
};
/** Per-connection counters + live state, as returned by `getConnectionStats()`. */
export type RelayConnectionStats = {
    id: string;
    relayName: string;
    ip: string;
    port: number;
    state: 'none' | 'connecting' | 'open' | 'closed' | 'failed';
    bufferedPackets: number;
    bufferedBytes: number;
    lastIceRttMs: number | null;
    sentPackets: number;
    receivedPackets: number;
    sentBytes: number;
    receivedBytes: number;
    droppedPackets: number;
    openConnections: number;
};
/** Relay info the transport reports a failure against. */
export type RelayEndpointInfo = {
    id: string;
    relayId: number;
    ip: string;
    port: number;
    name: string;
    [key: string]: any;
};
export type RelayTransportConfig = {
    onTransportMessage: (data: Uint8Array, ip: string, port: number) => void;
    onIceRtt?: (rttMs: number, ip: string, port: number) => void;
    /** Called when a relay connection cannot be established (e.g. the optional @roamhq/wrtc package is missing). */
    onTransportError?: (err: Error, relay: RelayEndpointInfo) => void;
    logger?: { warn?: (obj: any, msg?: string) => void; [key: string]: any };
};
export declare class RelayRtcTransport {
    #private;
    private readonly config;
    constructor(config: RelayTransportConfig);
    updateRelayList: (update: RelayListUpdatePayload) => void;
    send: (packet: Uint8Array | Buffer, ip: string, port: number) => number;
    getStats: () => RelayTransportStats;
    /** Per-connection counters, buffer depth, state and last ICE RTT. */
    getConnectionStats: () => RelayConnectionStats[];
    closeAll: () => Promise<void>;
}
export {};
