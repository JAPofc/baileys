export interface SignalingBridgeConfig {
    sock: any;
    /** Observer fired on inbound call offers (surfaced by VoipClient as 'incoming-call'). */
    onIncomingCall?: (info: any) => void;
}

/** E2EE call-signaling transport: offers/answers/receipts overChat stanzas + tcToken/Signal session setup. */
export class SignalingBridge {
    constructor(config: SignalingBridgeConfig);
    attachEngine(voip: any): void;
    init(): Promise<void>;
    sendSignaling(peerJid: string, callId: string, xmlPayload: string): any;
    processIncomingCall(node: any, voip: any, activeCallId: string | null): any;
    processIncomingReceipt(node: any, voip: any, activeCallId: string | null): any;
    requestTcToken(jid: string): Promise<any>;
    ensureTcToken(...jids: string[]): Promise<any>;
    discoverPeerDevices(peerLidJid: string): Promise<any>;
    ensureSessionsForPeers(jids: string[]): Promise<any>;
    resolveLid(pnJid: string): Promise<any>;
    issueTcToken(jid: string): Promise<any>;
    getRemoteDeviceJid(callId: string): any;
    getPendingOffer(callId: string): any;
    hasPendingOffer(callId: string): boolean;
    listPendingOffers(): any[];
    takePendingOffer(callId: string): any;
}
