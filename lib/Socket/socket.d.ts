export function makeSocket(config: any): {
    type: string;
    ws: WebSocketClient;
    ev: {
        process(handler: any): () => void;
        emit(event: any, evData: any): any;
        isBuffering(): boolean;
        buffer: () => void;
        flush: () => boolean;
        createBufferedFunction(work: any): (...args: any[]) => Promise<any>;
        on: (...args: any[]) => any;
        off: (...args: any[]) => any;
        removeAllListeners: (...args: any[]) => any;
        destroy(): void;
    };
    authState: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => Promise<any>;
            set: (data: any) => Promise<void>;
            isInTransaction: () => boolean;
            transaction: (work: any, key: any) => Promise<any>;
        };
    };
    signalRepository: any;
    readonly user: any;
    generateMessageTag: () => string;
    query: (node: any, timeoutMs: any) => Promise<any>;
    waitForMessage: (msgId: any, timeoutMs?: any) => Promise<any>;
    waitForSocketOpen: () => Promise<void>;
    sendRawMessage: (data: any) => Promise<void>;
    sendNode: (frame: any) => Promise<void>;
    logout: (msg: any) => Promise<void>;
    end: (error: any) => Promise<void>;
    registerSocketEndHandler: (handler: any) => void;
    onUnexpectedError: (err: any, msg: any) => void;
    uploadPreKeys: (count?: number) => Promise<void>;
    uploadPreKeysToServerIfRequired: () => Promise<void>;
    digestKeyBundle: () => Promise<void>;
    rotateSignedPreKey: () => Promise<void>;
    /**
     * Request a phone-number pairing code. `phoneNumber` is normalized to digits
     * (accepts `+`, spaces, dashes). `customPairingCode` (optional) must be 8
     * Crockford base32 characters (1-9, A-Z excluding I/O/U); lowercase is
     * accepted and uppercased. Safe to call right after socket creation — it
     * waits for the connection to open before sending.
     */
    requestPairingCode: (phoneNumber: string | number, customPairingCode?: string) => Promise<string>;
    updateServerTimeOffset: ({ attrs }: {
        attrs: any;
    }) => void;
    sendUnifiedSession: () => Promise<void>;
    wamBuffer: BinaryInfo;
    /** Waits for the connection to WA to reach a state */
    waitForConnectionUpdate: (check: any, timeoutMs: any) => Promise<void>;
    sendWAMBuffer: (wamBuffer: any) => Promise<any>;
    executeUSyncQuery: (usyncQuery: any) => Promise<any>;
    onWhatsApp: (...phoneNumber: any[]) => Promise<any>;
    fetchAccountReachoutTimelock: () => Promise<{
        isActive: boolean;
        timeEnforcementEnds: Date | undefined;
        enforcementType: any;
    }>;
    fetchNewChatMessageCap: () => Promise<any>;
};
import { WebSocketClient } from './Client/index.js';
import { BinaryInfo } from '../WAM/BinaryInfo.js';
