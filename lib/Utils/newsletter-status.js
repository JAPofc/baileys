/**
 * lib/Utils/newsletter-status.js — the Newsletter (channel) status API.
 *
 * Channels can post to status@broadcast *as the channel*: the status itself is an ordinary
 * status message, but it carries a `forwardedNewsletterMessageInfo` attribution so the
 * recipient's client renders the channel name instead of your own. This module holds the
 * four pieces that takes — the attribution, the <meta> node, the sender and the fetcher —
 * plus the channel admin-invite message.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { getBinaryNodeChild, getBinaryNodeChildren, isJidNewsletter } from '../WABinary/index.js';
import { STATUS_BROADCAST_JID } from './status.js';

/** How long `waitForNewsletterStatusServerId()` waits for the server to assign an id. */
export const NEWSLETTER_SERVER_ID_TIMEOUT_MS = 20_000;
/** `contextInfo.forwardedNewsletterMessageInfo.contentType` values WhatsApp uses. */
export const NEWSLETTER_STATUS_CONTENT_TYPE = {
    UPDATE: 1,
    UPDATE_CARD: 2,
    LINK_CARD: 3
};

const assertNewsletterJid = (jid, fn) => {
    const value = String(jid ?? '').trim();
    if (!isJidNewsletter(value)) {
        throw new Boom(`${fn}: expected a @newsletter jid, got "${value || 'nothing'}"`, { statusCode: 400, data: { jid } });
    }
    return value;
};

/**
 * Attribute any message content to a newsletter, so it renders as "from <channel>".
 *
 * ```js
 * const content = withNewsletterStatusAttribution(
 *     { image: { url: './promo.jpg' }, caption: 'New drop' },
 *     { newsletterJid: '1234@newsletter', newsletterName: 'JAP News', serverMessageId: 42 }
 * )
 * await sock.sendMessage('status@broadcast', content, { statusJidList })
 * ```
 */
export const withNewsletterStatusAttribution = (content, { newsletterJid, newsletterName, serverMessageId = 0, contentType = NEWSLETTER_STATUS_CONTENT_TYPE.UPDATE, accessibilityText, profileName } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'withNewsletterStatusAttribution');
    if (!content || typeof content !== 'object') {
        throw new Boom('withNewsletterStatusAttribution: content must be a message object', { statusCode: 400 });
    }
    if (!Number.isInteger(serverMessageId) || serverMessageId < 0) {
        throw new Boom('withNewsletterStatusAttribution: "serverMessageId" must be a non-negative integer', {
            statusCode: 400,
            data: { serverMessageId }
        });
    }
    return {
        ...content,
        contextInfo: {
            ...(content.contextInfo || {}),
            forwardedNewsletterMessageInfo: {
                newsletterJid: jid,
                serverMessageId,
                ...(newsletterName ? { newsletterName } : {}),
                contentType,
                ...(accessibilityText ? { accessibilityText } : {}),
                ...(profileName ? { profileName } : {})
            },
            isForwarded: true
        }
    };
};

/**
 * The `<meta>` child that goes on the outgoing status stanza so the server knows which
 * channel the post belongs to. Returned in binary-node form, ready for `additionalNodes`.
 */
export const buildNewsletterStatusNode = ({ newsletterJid, serverMessageId = 0, type = 'status' } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'buildNewsletterStatusNode');
    return {
        tag: 'meta',
        attrs: { newsletter_jid: jid, type },
        content: [
            {
                tag: 'newsletter',
                attrs: {
                    jid,
                    ...(serverMessageId ? { server_id: String(serverMessageId) } : {})
                }
            }
        ]
    };
};

/** The "you have been made an admin of this channel" invite message. */
export const makeNewsletterAdminInviteMessage = ({ newsletterJid, newsletterName, caption, inviteExpiration, jpegThumbnail, contextInfo } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'makeNewsletterAdminInviteMessage');
    if (!newsletterName) {
        throw new Boom('makeNewsletterAdminInviteMessage: "newsletterName" is required', { statusCode: 400 });
    }
    if (inviteExpiration !== undefined && (!Number.isInteger(inviteExpiration) || inviteExpiration <= 0)) {
        throw new Boom('makeNewsletterAdminInviteMessage: "inviteExpiration" must be a unix timestamp in seconds', {
            statusCode: 400,
            data: { inviteExpiration }
        });
    }
    return {
        newsletterAdminInviteMessage: {
            newsletterJid: jid,
            newsletterName,
            ...(caption ? { caption } : {}),
            ...(inviteExpiration ? { inviteExpiration } : {}),
            ...(jpegThumbnail ? { jpegThumbnail } : {}),
            ...(contextInfo ? { contextInfo } : {})
        }
    };
};

/**
 * Build a `sendNewsletterStatus(newsletterJid, content, opts)` function bound to a socket.
 *
 * ```js
 * const sendNewsletterStatus = makeNewsletterStatusSender(sock)
 * await sendNewsletterStatus('1234@newsletter', { image: { url: './promo.jpg' } }, {
 *     statusJidList: audience.statusJidList,
 *     newsletterName: 'JAP News'
 * })
 * ```
 */
export const makeNewsletterStatusSender = (sock) => {
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('makeNewsletterStatusSender: a socket with sendMessage() is required', { statusCode: 400 });
    }
    return async (newsletterJid, content, options = {}) => {
        const jid = assertNewsletterJid(newsletterJid, 'sendNewsletterStatus');
        const { newsletterName, serverMessageId = 0, contentType, statusJidList, ...rest } = options;
        if (!Array.isArray(statusJidList) || !statusJidList.length) {
            throw new Boom('sendNewsletterStatus: "statusJidList" (the audience) is required — build one with makeStatusAudienceMetadata()', {
                statusCode: 400
            });
        }
        const attributed = withNewsletterStatusAttribution(content, {
            newsletterJid: jid,
            newsletterName,
            serverMessageId,
            ...(contentType !== undefined ? { contentType } : {})
        });
        const additionalNodes = [
            ...(rest.additionalNodes || []),
            buildNewsletterStatusNode({ newsletterJid: jid, serverMessageId })
        ];
        return sock.sendMessage(STATUS_BROADCAST_JID, attributed, { ...rest, statusJidList, additionalNodes });
    };
};

/**
 * Build a `fetchNewsletterStatus(newsletterJid, { count, before })` function bound to a
 * socket: the channel's recent status posts, newest first, already unwrapped from the
 * `<messages>` node into `{ serverId, timestamp, message, views, reactions }`.
 */
export const makeNewsletterStatusFetcher = (sock) => {
    if (typeof sock?.query !== 'function') {
        throw new Boom('makeNewsletterStatusFetcher: a socket with query() is required', { statusCode: 400 });
    }
    return async (newsletterJid, { count = 20, before } = {}) => {
        const jid = assertNewsletterJid(newsletterJid, 'fetchNewsletterStatus');
        if (!Number.isInteger(count) || count < 1) {
            throw new Boom('fetchNewsletterStatus: "count" must be a positive integer', { statusCode: 400, data: { count } });
        }
        const result = await sock.query({
            tag: 'iq',
            attrs: { id: sock.generateMessageTag?.(), type: 'get', xmlns: 'newsletter', to: jid },
            content: [
                {
                    tag: 'status_messages',
                    attrs: {
                        count: String(count),
                        ...(before ? { before: String(before) } : {})
                    }
                }
            ]
        });
        const container = getBinaryNodeChild(result, 'status_messages') ?? getBinaryNodeChild(result, 'messages');
        const entries = container ? getBinaryNodeChildren(container, 'message') : [];
        return entries.map(node => ({
            serverId: Number(node.attrs?.server_id ?? node.attrs?.id ?? 0) || undefined,
            timestamp: Number(node.attrs?.t ?? 0) || undefined,
            views: Number(getBinaryNodeChild(node, 'views_count')?.attrs?.count ?? 0) || 0,
            reactions: getBinaryNodeChildren(getBinaryNodeChild(node, 'reactions') ?? node, 'reaction').map(r => ({
                code: r.attrs?.code,
                count: Number(r.attrs?.count ?? 0) || 0
            })),
            node
        }));
    };
};

/** The `<reaction>` node for a channel status post. */
export const buildNewsletterStatusReactionNode = ({ newsletterJid, serverMessageId, code, messageId } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'buildNewsletterStatusReactionNode');
    if (!Number.isInteger(serverMessageId) || serverMessageId <= 0) {
        throw new Boom('buildNewsletterStatusReactionNode: "serverMessageId" is required', {
            statusCode: 400,
            data: { serverMessageId }
        });
    }
    return {
        tag: 'message',
        attrs: {
            to: jid,
            type: 'reaction',
            server_id: String(serverMessageId),
            ...(messageId ? { id: messageId } : {})
        },
        content: [{ tag: 'reaction', attrs: code ? { code: String(code) } : {} }]
    };
};

/** The `<revoke>` node that deletes a channel status post for everyone. */
export const buildNewsletterStatusRevokeNode = ({ newsletterJid, serverMessageId, messageId } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'buildNewsletterStatusRevokeNode');
    if (!Number.isInteger(serverMessageId) || serverMessageId <= 0) {
        throw new Boom('buildNewsletterStatusRevokeNode: "serverMessageId" is required', {
            statusCode: 400,
            data: { serverMessageId }
        });
    }
    return {
        tag: 'message',
        attrs: {
            to: jid,
            type: 'revoke',
            server_id: String(serverMessageId),
            ...(messageId ? { id: messageId } : {})
        },
        content: [{ tag: 'revoke', attrs: { server_id: String(serverMessageId) } }]
    };
};

/** The channel-admin profile status message (an admin posting under the channel's identity). */
export const buildNewsletterAdminProfileStatusMessage = ({ newsletterJid, newsletterName, text, profileName, jpegThumbnail } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'buildNewsletterAdminProfileStatusMessage');
    const body = String(text ?? '').trim();
    if (!body) {
        throw new Boom('buildNewsletterAdminProfileStatusMessage: "text" is required', { statusCode: 400 });
    }
    return withNewsletterStatusAttribution({
        newsletterAdminProfileStatusMessage: {
            message: {
                extendedTextMessage: {
                    text: body,
                    ...(jpegThumbnail ? { jpegThumbnail } : {})
                }
            }
        }
    }, { newsletterJid: jid, newsletterName, profileName });
};

/** The "follow this channel" invite message. */
export const makeNewsletterFollowerInviteMessage = ({ newsletterJid, newsletterName, caption, inviteExpiration, jpegThumbnail } = {}) => {
    const jid = assertNewsletterJid(newsletterJid, 'makeNewsletterFollowerInviteMessage');
    if (!newsletterName) {
        throw new Boom('makeNewsletterFollowerInviteMessage: "newsletterName" is required', { statusCode: 400 });
    }
    return {
        newsletterFollowerInviteMessageV2: {
            newsletterJid: jid,
            newsletterName,
            ...(caption ? { caption } : {}),
            ...(inviteExpiration ? { inviteExpiration } : {}),
            ...(jpegThumbnail ? { jpegThumbnail } : {}),
            inviteType: 1
        }
    };
};

/** Read the server id / timestamp back out of a channel message node or ack. */
export const extractNewsletterMessageMeta = (node) => {
    if (!node?.attrs) {
        return null;
    }
    const serverId = Number(node.attrs.server_id ?? node.attrs.serverId ?? 0) || undefined;
    return {
        serverId,
        messageId: node.attrs.id,
        newsletterJid: node.attrs.from ?? node.attrs.to,
        timestamp: Number(node.attrs.t ?? 0) || undefined,
        type: node.attrs.type
    };
};

/** `true` + the server id when this node is the ack for `messageId`. */
export const parseNewsletterStatusAck = (node, messageId) => {
    const meta = extractNewsletterMessageMeta(node);
    if (!meta) {
        return { matched: false };
    }
    const matched = node.tag === 'ack' || node.tag === 'message'
        ? (!messageId || meta.messageId === messageId) && !!meta.serverId
        : false;
    return { matched, ...meta };
};

/**
 * Wait for the server to hand back the `server_id` of a channel post you just sent.
 *
 * ```js
 * const { key } = await sock.sendNewsletterStatus(jid, content, { statusJidList })
 * const serverId = await waitForNewsletterStatusServerId(sock, key.id)
 * ```
 */
export const waitForNewsletterStatusServerId = (sock, messageId, { timeoutMs = NEWSLETTER_SERVER_ID_TIMEOUT_MS } = {}) => {
    if (typeof sock?.ws?.on !== 'function' && typeof sock?.ev?.on !== 'function') {
        throw new Boom('waitForNewsletterStatusServerId: a connected socket is required', { statusCode: 400 });
    }
    if (!messageId) {
        throw new Boom('waitForNewsletterStatusServerId: "messageId" is required', { statusCode: 400 });
    }
    return new Promise((resolve, reject) => {
        const emitter = sock.ws?.on ? sock.ws : sock.ev;
        let timer = null;
        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            emitter.off?.('frame', onFrame);
            emitter.removeListener?.('frame', onFrame);
        };
        const onFrame = (node) => {
            const ack = parseNewsletterStatusAck(node, messageId);
            if (ack.matched) {
                cleanup();
                resolve(ack.serverId);
            }
        };
        emitter.on('frame', onFrame);
        timer = setTimeout(() => {
            cleanup();
            reject(new Boom(`waitForNewsletterStatusServerId: no server id for "${messageId}" within ${timeoutMs}ms`, {
                statusCode: 408,
                data: { messageId, timeoutMs }
            }));
        }, timeoutMs);
    });
};

/** Bind a `reactToNewsletterStatus(jid, serverId, code)` to a socket. */
export const makeNewsletterStatusReactionSender = (sock) => {
    if (typeof sock?.sendNode !== 'function' && typeof sock?.query !== 'function') {
        throw new Boom('makeNewsletterStatusReactionSender: a socket with sendNode()/query() is required', { statusCode: 400 });
    }
    return async (newsletterJid, serverMessageId, code) => {
        const node = buildNewsletterStatusReactionNode({
            newsletterJid,
            serverMessageId,
            code,
            messageId: sock.generateMessageTag?.()
        });
        if (typeof sock.sendNode === 'function') {
            await sock.sendNode(node);
            return { sent: true, serverMessageId, code: code ?? null };
        }
        await sock.query(node);
        return { sent: true, serverMessageId, code: code ?? null };
    };
};

/** Bind a `revokeNewsletterStatus(jid, serverId)` to a socket. */
export const makeNewsletterStatusRevokeSender = (sock) => {
    if (typeof sock?.sendNode !== 'function' && typeof sock?.query !== 'function') {
        throw new Boom('makeNewsletterStatusRevokeSender: a socket with sendNode()/query() is required', { statusCode: 400 });
    }
    return async (newsletterJid, serverMessageId) => {
        const node = buildNewsletterStatusRevokeNode({
            newsletterJid,
            serverMessageId,
            messageId: sock.generateMessageTag?.()
        });
        if (typeof sock.sendNode === 'function') {
            await sock.sendNode(node);
            return { revoked: true, serverMessageId };
        }
        await sock.query(node);
        return { revoked: true, serverMessageId };
    };
};

/**
 * Bind a `fetchNewsletterStatusUpdates(jid, { since })` to a socket: only the posts that
 * changed (new, edited, revoked, reacted) since a timestamp — for polling a channel cheaply.
 */
export const makeNewsletterStatusUpdatesFetcher = (sock) => {
    const fetchAll = makeNewsletterStatusFetcher(sock);
    return async (newsletterJid, { since = 0, count = 50 } = {}) => {
        const sinceSec = since > 1e12 ? Math.floor(since / 1000) : Math.floor(since);
        const entries = await fetchAll(newsletterJid, { count });
        const updates = entries.filter(entry => (entry.timestamp ?? 0) > sinceSec);
        return {
            newsletterJid,
            since: sinceSec,
            updates,
            latestTimestamp: entries.reduce((acc, entry) => Math.max(acc, entry.timestamp ?? 0), sinceSec)
        };
    };
};
