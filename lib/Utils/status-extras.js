/**
 * lib/Utils/status-extras.js — status/story primitives that sit next to `status.js`.
 *
 * `status.js` builds the *content* of a status (text/image/video/audio/sticker). This module
 * builds the things that go *around* it: who may see it, and the three interaction messages
 * WhatsApp sends back into a 1:1 chat when somebody engages with a status
 * (mention reshare, question answer, sticker reaction).
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { isPnUser, isLidUser } from '../WABinary/index.js';
import { STATUS_BROADCAST_JID, STATUS_FONTS } from './status.js';

/** Audience modes WhatsApp supports for a status post. */
export const STATUS_AUDIENCE_TYPE = {
    CONTACTS: 'contacts',
    ALLOWLIST: 'allowlist',
    DENYLIST: 'denylist'
};
/** Default audience when the caller does not say otherwise. */
export const STATUS_AUDIENCE_DEFAULT_TYPE = STATUS_AUDIENCE_TYPE.CONTACTS;
/** WhatsApp refuses a status fan-out larger than this many recipients. */
export const STATUS_AUDIENCE_DEFAULT_LIMIT = 999;
/** Default sticker-interaction type (a plain reaction, as opposed to a reply). */
export const STATUS_AUDIENCE_DEFAULT_STICKER_TYPE = 0;

const asJidList = (value, field) => {
    const list = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
    const cleaned = [];
    for (const raw of list) {
        const jid = String(raw ?? '').trim();
        if (!jid) {
            continue;
        }
        if (!isPnUser(jid) && !isLidUser(jid)) {
            throw new Boom(`makeStatusAudienceMetadata: "${field}" must contain user JIDs, got "${jid}"`, {
                statusCode: 400,
                data: { field, jid }
            });
        }
        if (!cleaned.includes(jid)) {
            cleaned.push(jid);
        }
    }
    return cleaned;
};

/**
 * Work out who a status goes to, and in what shape `sendMessage(status@broadcast, …)` wants it.
 *
 * ```js
 * const audience = makeStatusAudienceMetadata({ contacts: myContacts })               // everyone
 * const audience = makeStatusAudienceMetadata({ contacts, except: ['628x@s.whatsapp.net'] })
 * const audience = makeStatusAudienceMetadata({ only: ['628y@s.whatsapp.net'] })      // allowlist
 * await sock.sendMessage('status@broadcast', { image }, { statusJidList: audience.statusJidList })
 * ```
 *
 * Returns `{ type, statusJidList, excluded, truncated, limit }` — `statusJidList` is the exact
 * array the socket expects, already de-duplicated and capped at `limit`.
 */
export const makeStatusAudienceMetadata = ({ contacts, only, except, limit = STATUS_AUDIENCE_DEFAULT_LIMIT } = {}) => {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Boom('makeStatusAudienceMetadata: "limit" must be a positive integer', { statusCode: 400, data: { limit } });
    }
    const allowList = asJidList(only, 'only');
    const denyList = asJidList(except, 'except');
    if (allowList.length && (denyList.length || asJidList(contacts, 'contacts').length)) {
        throw new Boom('makeStatusAudienceMetadata: "only" is an allowlist on its own — do not combine it with "contacts"/"except", not both', { statusCode: 400 });
    }
    let type = STATUS_AUDIENCE_DEFAULT_TYPE;
    let recipients;
    if (allowList.length) {
        type = STATUS_AUDIENCE_TYPE.ALLOWLIST;
        recipients = allowList;
    }
    else {
        recipients = asJidList(contacts, 'contacts');
        if (denyList.length) {
            type = STATUS_AUDIENCE_TYPE.DENYLIST;
            recipients = recipients.filter(jid => !denyList.includes(jid));
        }
    }
    if (!recipients.length) {
        throw new Boom('makeStatusAudienceMetadata: the audience is empty — a status needs at least one recipient', {
            statusCode: 400,
            data: { type }
        });
    }
    const truncated = Math.max(recipients.length - limit, 0);
    return {
        type,
        statusJidList: recipients.slice(0, limit),
        excluded: denyList,
        truncated,
        limit
    };
};

/**
 * The message a contact's phone sends when they reshare your status to their own
 * (`statusMentionMessage`). `status` is the status message you were mentioned in.
 */
export const makeStatusMentionMessage = (status, { attributionType = proto.ContextInfo.StatusAttributionType.RESHARED_FROM_MENTION, group = false } = {}) => {
    const quoted = status?.message ?? status;
    if (!quoted || typeof quoted !== 'object') {
        throw new Boom('makeStatusMentionMessage: pass the status message (or the full WebMessageInfo)', { statusCode: 400 });
    }
    const field = group ? 'groupStatusMentionMessage' : 'statusMentionMessage';
    return {
        [field]: { message: quoted },
        messageContextInfo: {
            statusMentionMessageInfo: { quotedStatus: quoted }
        },
        contextInfo: { statusAttributionType: attributionType }
    };
};

/** Answer to a question sticker on a status (`statusQuestionAnswerMessage`). */
export const makeStatusQuestionAnswerMessage = (statusKey, text) => {
    const answer = String(text ?? '').trim();
    if (!statusKey?.id) {
        throw new Boom('makeStatusQuestionAnswerMessage: a status message key with an id is required', { statusCode: 400 });
    }
    if (!answer) {
        throw new Boom('makeStatusQuestionAnswerMessage: the answer text cannot be empty', { statusCode: 400 });
    }
    return {
        statusQuestionAnswerMessage: {
            key: { remoteJid: STATUS_BROADCAST_JID, ...statusKey },
            text: answer
        }
    };
};

/** Reaction to a sticker placed on a status (`statusStickerInteractionMessage`). */
export const makeStatusStickerInteractionMessage = (statusKey, stickerKey, { type = STATUS_AUDIENCE_DEFAULT_STICKER_TYPE } = {}) => {
    if (!statusKey?.id) {
        throw new Boom('makeStatusStickerInteractionMessage: a status message key with an id is required', { statusCode: 400 });
    }
    if (!Number.isInteger(type) || type < 0) {
        throw new Boom('makeStatusStickerInteractionMessage: "type" must be a non-negative integer', { statusCode: 400, data: { type } });
    }
    return {
        statusStickerInteractionMessage: {
            key: { remoteJid: STATUS_BROADCAST_JID, ...statusKey },
            ...(stickerKey ? { stickerKey } : {}),
            type
        }
    };
};

/** Font ids for text statuses, under the name the Meta-side modules use. */
export const StatusFont = { ...STATUS_FONTS };
/** How a link renders on a status. */
export const StatusLinkType = { NONE: 0, PREVIEW: 1, STICKER: 2, CTA: 3 };
/** The reasons WhatsApp emits a `statusNotificationMessage`. */
export const STATUS_NOTIFICATION_TYPES = { ...proto.Message.StatusNotificationMessage.StatusNotificationType };
/** Quoted-status kinds (`statusQuotedMessage.type`). */
export const STATUS_QUOTED_TYPES = { ...proto.Message.StatusQuotedMessage.StatusQuotedMessageType };

/**
 * A reply that quotes a status (`statusQuotedMessage`) — the little status thumbnail that
 * appears above a 1:1 reply.
 */
export const makeStatusQuotedMessage = (statusKey, { text, thumbnail, type = STATUS_QUOTED_TYPES.QUESTION_ANSWER } = {}) => {
    if (!statusKey?.id) {
        throw new Boom('makeStatusQuotedMessage: a status message key with an id is required', { statusCode: 400 });
    }
    if (!Object.values(STATUS_QUOTED_TYPES).includes(type)) {
        throw new Boom(`makeStatusQuotedMessage: unknown type ${type}`, {
            statusCode: 400,
            data: { type, allowed: STATUS_QUOTED_TYPES }
        });
    }
    return {
        statusQuotedMessage: {
            type,
            ...(text ? { text: String(text) } : {}),
            ...(thumbnail ? { thumbnail } : {}),
            originalStatusId: { remoteJid: STATUS_BROADCAST_JID, ...statusKey }
        }
    };
};

/**
 * The "Add yours" sticker association: your status joins the chain started by `originalKey`.
 * Returns content for `sendMessage('status@broadcast', …)`.
 */
export const makeStatusAddYoursAssociation = (content, originalKey, { promptText } = {}) => {
    if (!content || typeof content !== 'object') {
        throw new Boom('makeStatusAddYoursAssociation: pass the status content to attach it to', { statusCode: 400 });
    }
    if (!originalKey?.id) {
        throw new Boom('makeStatusAddYoursAssociation: the original status key (with an id) is required', { statusCode: 400 });
    }
    const key = { remoteJid: STATUS_BROADCAST_JID, ...originalKey };
    return {
        ...content,
        statusAddYours: { message: content.message ?? { conversation: promptText ?? '' } },
        messageContextInfo: {
            ...(content.messageContextInfo || {}),
            messageAssociation: { parentMessageKey: key, associationType: 0 }
        },
        contextInfo: {
            ...(content.contextInfo || {}),
            statusAttributionType: proto.ContextInfo.StatusAttributionType.RESHARED_FROM_POST,
            quotedMessage: content.quotedMessage,
            stanzaId: key.id,
            ...(key.participant ? { participant: key.participant } : {})
        }
    };
};

/**
 * The notification WhatsApp sends back to a status author when somebody interacts
 * (`statusNotificationMessage`): add-yours, reshare, question answer, group status reply.
 */
export const makeStatusNotificationMessage = (originalKey, responseKey, { type = STATUS_NOTIFICATION_TYPES.STATUS_RESHARE } = {}) => {
    if (!originalKey?.id || !responseKey?.id) {
        throw new Boom('makeStatusNotificationMessage: both the original and the response message keys are required', {
            statusCode: 400
        });
    }
    if (!Object.values(STATUS_NOTIFICATION_TYPES).includes(type)) {
        throw new Boom(`makeStatusNotificationMessage: unknown notification type ${type}`, {
            statusCode: 400,
            data: { type, allowed: STATUS_NOTIFICATION_TYPES }
        });
    }
    return {
        statusNotificationMessage: {
            originalMessageKey: { remoteJid: STATUS_BROADCAST_JID, ...originalKey },
            responseMessageKey: responseKey,
            type
        }
    };
};

/** Attribute a status to a group (the "posted to <group>" header on a group status). */
export const makeGroupStatusAttribution = (content, groupJid, { subject, participant } = {}) => {
    const jid = String(groupJid ?? '');
    if (!jid.endsWith('@g.us')) {
        throw new Boom(`makeGroupStatusAttribution: expected a @g.us jid, got "${jid || 'nothing'}"`, {
            statusCode: 400,
            data: { groupJid }
        });
    }
    if (!content || typeof content !== 'object') {
        throw new Boom('makeGroupStatusAttribution: pass the status content', { statusCode: 400 });
    }
    return {
        ...content,
        groupStatusMessage: { message: content.message ?? { conversation: '' } },
        contextInfo: {
            ...(content.contextInfo || {}),
            parentGroupJid: jid,
            ...(subject ? { groupSubject: subject } : {}),
            ...(participant ? { participant } : {})
        }
    };
};

/** React to a group status (emoji reaction routed back to the group status author). */
export const makeGroupStatusReactionMessage = (statusKey, emoji, { groupJid, senderTimestampMs = Date.now() } = {}) => {
    const text = String(emoji ?? '').trim();
    if (!statusKey?.id) {
        throw new Boom('makeGroupStatusReactionMessage: a status message key with an id is required', { statusCode: 400 });
    }
    if (!text) {
        throw new Boom('makeGroupStatusReactionMessage: an emoji is required (use "" to remove a reaction via sendMessage)', {
            statusCode: 400
        });
    }
    return {
        reactionMessage: {
            key: { remoteJid: groupJid || STATUS_BROADCAST_JID, ...statusKey },
            text,
            senderTimestampMs
        },
        ...(groupJid ? { contextInfo: { parentGroupJid: groupJid } } : {})
    };
};
