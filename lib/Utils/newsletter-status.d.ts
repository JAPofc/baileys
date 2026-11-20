import type { proto } from '../../WAProto/index.js';
import type { BinaryNode } from '../WABinary/index.js';

export declare const NEWSLETTER_STATUS_CONTENT_TYPE: {
    readonly UPDATE: 1;
    readonly UPDATE_CARD: 2;
    readonly LINK_CARD: 3;
};
export interface NewsletterStatusAttribution {
    newsletterJid: string;
    newsletterName?: string;
    serverMessageId?: number;
    contentType?: number;
    accessibilityText?: string;
    profileName?: string;
}
/** Attribute message content to a channel so it renders as "from <channel>". */
export declare function withNewsletterStatusAttribution<T extends Record<string, any>>(content: T, attribution: NewsletterStatusAttribution): T & {
    contextInfo: Record<string, any>;
};
/** The `<meta>` stanza child that binds an outgoing status to a channel. */
export declare function buildNewsletterStatusNode(opts: {
    newsletterJid: string;
    serverMessageId?: number;
    type?: string;
}): BinaryNode;
/** The "you are now an admin of this channel" invite message. */
export declare function makeNewsletterAdminInviteMessage(opts: {
    newsletterJid: string;
    newsletterName: string;
    caption?: string;
    inviteExpiration?: number;
    jpegThumbnail?: Uint8Array | Buffer;
    contextInfo?: proto.IContextInfo;
}): proto.IMessage;
export interface NewsletterStatusEntry {
    serverId?: number;
    timestamp?: number;
    views: number;
    reactions: { code?: string; count: number }[];
    node: BinaryNode;
}
/** Bind a `sendNewsletterStatus(jid, content, { statusJidList, … })` to a socket. */
export declare function makeNewsletterStatusSender(sock: any): (newsletterJid: string, content: Record<string, any>, options?: Record<string, any>) => Promise<any>;
/** Bind a `fetchNewsletterStatus(jid, { count, before })` to a socket. */
export declare function makeNewsletterStatusFetcher(sock: any): (newsletterJid: string, options?: {
    count?: number;
    before?: string | number;
}) => Promise<NewsletterStatusEntry[]>;

export declare const NEWSLETTER_SERVER_ID_TIMEOUT_MS: number;
/** The `<reaction>` node for a channel status post. */
export declare function buildNewsletterStatusReactionNode(opts: {
    newsletterJid: string; serverMessageId: number; code?: string; messageId?: string;
}): BinaryNode;
/** The `<revoke>` node that deletes a channel status post. */
export declare function buildNewsletterStatusRevokeNode(opts: {
    newsletterJid: string; serverMessageId: number; messageId?: string;
}): BinaryNode;
/** A channel-admin profile status message. */
export declare function buildNewsletterAdminProfileStatusMessage(opts: {
    newsletterJid: string; newsletterName?: string; text: string; profileName?: string; jpegThumbnail?: Uint8Array | Buffer;
}): Record<string, any>;
/** The "follow this channel" invite message. */
export declare function makeNewsletterFollowerInviteMessage(opts: {
    newsletterJid: string; newsletterName: string; caption?: string; inviteExpiration?: number; jpegThumbnail?: Uint8Array | Buffer;
}): proto.IMessage;
/** Read server id / timestamp out of a channel node. */
export declare function extractNewsletterMessageMeta(node: BinaryNode | null | undefined): {
    serverId?: number; messageId?: string; newsletterJid?: string; timestamp?: number; type?: string;
} | null;
/** Does this node ack `messageId`, and with which server id? */
export declare function parseNewsletterStatusAck(node: BinaryNode, messageId?: string): {
    matched: boolean; serverId?: number; messageId?: string; newsletterJid?: string; timestamp?: number; type?: string;
};
/** Wait for the server id of a channel post you just sent. */
export declare function waitForNewsletterStatusServerId(sock: any, messageId: string, opts?: { timeoutMs?: number }): Promise<number>;
/** Bind a reaction sender to a socket. */
export declare function makeNewsletterStatusReactionSender(sock: any): (newsletterJid: string, serverMessageId: number, code?: string) => Promise<{ sent: boolean; serverMessageId: number; code: string | null }>;
/** Bind a revoke sender to a socket. */
export declare function makeNewsletterStatusRevokeSender(sock: any): (newsletterJid: string, serverMessageId: number) => Promise<{ revoked: boolean; serverMessageId: number }>;
/** Bind an "only what changed" fetcher to a socket. */
export declare function makeNewsletterStatusUpdatesFetcher(sock: any): (newsletterJid: string, opts?: { since?: number; count?: number }) => Promise<{
    newsletterJid: string; since: number; updates: NewsletterStatusEntry[]; latestTimestamp: number;
}>;
