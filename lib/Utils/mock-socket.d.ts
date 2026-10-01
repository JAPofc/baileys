import type { proto } from '../../WAProto/index.js';
import type { AnyMessageContent, MiscMessageGenerationOptions } from '../Types/index.js';
/** One captured outgoing message. */
export type MockOutboxEntry = {
    jid: string;
    content: AnyMessageContent | Record<string, unknown>;
    options: MiscMessageGenerationOptions | Record<string, unknown>;
    /** The real proto.WebMessageInfo built through generateWAMessage. */
    message: proto.IWebMessageInfo;
};
export type MockSocketOptions = {
    /** Own jid (default '628000000000@s.whatsapp.net'). */
    me?: string;
    /** Own display name on outgoing messages (default 'MockBot'). */
    pushName?: string;
    /** Emit connection.update open on creation (default true). */
    autoConnect?: boolean;
};
export type ReceiveTextOptions = {
    /** Deliver as a group message: fromJid becomes the participant. */
    groupJid?: string;
    /** Sender display name (default 'Tester'). */
    pushName?: string;
    /** Make the injected message quote this earlier message. */
    quoted?: proto.IWebMessageInfo;
};
export type MockWASocket = {
    /** The mock sock — hand to bot code in place of makeWASocket(). */
    sock: any;
    /** Every message the bot "sent", in order. */
    outbox: MockOutboxEntry[];
    /** Every event emitted, in order: full audit trail. */
    eventLog: Array<{ event: string; data: unknown }>;
    /** Keys passed to readMessages(). */
    readReceipts: proto.IMessageKey[];
    /** Presence updates sent via sendPresenceUpdate(). */
    presenceLog: Array<{ type: string; toJid: string | null }>;
    /** Inject an incoming text message; resolves after handlers get a turn. */
    receiveText: (fromJid: string, text: string, opts?: ReceiveTextOptions) => Promise<proto.IWebMessageInfo>;
    /** Inject any raw incoming WAMessage. */
    receiveMessage: (msg: proto.IWebMessageInfo) => Promise<proto.IWebMessageInfo>;
    /** Wait for the next outgoing message (optionally filtered). Rejects on timeout. */
    waitForReply: (filter?: (entry: MockOutboxEntry) => boolean, timeoutMs?: number) => Promise<MockOutboxEntry>;
    /** Emit connection.update open. */
    connect: () => void;
    /** Emit connection.update close (optionally with an error). */
    disconnect: (error?: Error) => void;
    /** Clear outbox/logs and reject pending waiters; listeners stay attached. */
    reset: () => void;
    readonly connectionState: 'open' | 'close';
};
/**
 * Offline mock WhatsApp socket for testing bot logic — same `ev` surface and
 * `sendMessage()` signature as the live socket, producing real
 * proto.WebMessageInfo objects. No network, CI-safe.
 *
 * NOT a server emulator: WhatsApp-side behaviour (rate limits, sessions,
 * encryption) is out of scope; media builds use a stub uploader.
 */
export declare const createMockSocket: (options?: MockSocketOptions) => MockWASocket;
