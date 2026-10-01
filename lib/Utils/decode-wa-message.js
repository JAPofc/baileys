import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { areJidsSameUser, isHostedLidUser, isHostedPnUser, isJidBroadcast, isJidGroup, isJidMetaAI, isJidNewsletter, isJidStatusBroadcast, isLidUser, isPnUser, transferDevice } from '../WABinary/index.js';
import { unpadRandomMax16 } from './generics.js';
export const getDecryptionJid = async (sender, repository) => {
    if (isLidUser(sender) || isHostedLidUser(sender)) {
        return sender;
    }
    const mapped = await repository.lidMapping.getLIDForPN(sender);
    return mapped || sender;
};
const storeMappingFromEnvelope = async (stanza, sender, repository, decryptionJid, logger) => {
    // TODO: Handle hosted IDs
    const { senderAlt } = extractAddressingContext(stanza);
    if (senderAlt && isLidUser(senderAlt) && isPnUser(sender) && decryptionJid === sender) {
        try {
            await repository.lidMapping.storeLIDPNMappings([{ lid: senderAlt, pn: sender }]);
            await repository.migrateSession(sender, senderAlt);
            logger.debug({ sender, senderAlt }, 'Stored LID mapping from envelope');
        }
        catch (error) {
            logger.warn({ sender, senderAlt, error }, 'Failed to store LID mapping');
        }
    }
};
export const NO_MESSAGE_FOUND_ERROR_TEXT = 'Message absent from node';
export const MISSING_KEYS_ERROR_TEXT = 'Key used already or never filled';
export const ACCOUNT_RESTRICTED_TEXT = 'Your account has been restricted';
/**
 * JAP@Add --- build the payload for the `messages.decrypt-failed` event from a
 * decoded message that failed to decrypt. Lets applications observe decryption
 * failures directly (metrics, alerting, proactively resetting a dead session)
 * instead of scraping logs — the observability hook requested in
 * WhiskeySockets/Baileys#2234.
 *
 * Returns `undefined` for anything that isn't a genuine inbound decrypt failure
 * (non-CIPHERTEXT stubs, and `peer` category sync messages which are handled
 * separately and never retried).
 *
 * @param {{ key?: any, messageStubType?: any, messageStubParameters?: any[], category?: string }} msg
 * @returns {{ key: any, error: string, willRetry: boolean } | undefined}
 */
export const buildDecryptFailureEvent = (msg) => {
    if (!msg || msg.messageStubType !== proto.WebMessageInfo.StubType.CIPHERTEXT || msg.category === 'peer') {
        return undefined;
    }
    const error = msg.messageStubParameters?.[0] ?? '';
    // MISSING_KEYS → acked as a parsing error (no retry); NO_MESSAGE_FOUND → the
    // message arrived without encryption (e.g. CTWA ads) and goes down the
    // placeholder-resend path, not a Signal retry. Everything else gets a retry receipt.
    const willRetry = error !== MISSING_KEYS_ERROR_TEXT && error !== NO_MESSAGE_FOUND_ERROR_TEXT;
    return { key: msg.key, error: String(error), willRetry };
};
// Retry configuration for failed decryption
export const DECRYPTION_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 100,
    sessionRecordErrors: ['No session record', 'SessionError: No session record']
};
/** NACK reason codes we send to the server (client → server) */
export const NACK_REASONS = {
    SenderReachoutTimelocked: 463,
    ParsingError: 487,
    UnrecognizedStanza: 488,
    UnrecognizedStanzaClass: 489,
    UnrecognizedStanzaType: 490,
    InvalidProtobuf: 491,
    InvalidHostedCompanionStanza: 493,
    MissingMessageSecret: 495,
    SignalErrorOldCounter: 496,
    MessageDeletedOnPeer: 499,
    UnhandledError: 500,
    UnsupportedAdminRevoke: 550,
    UnsupportedLIDGroup: 551,
    DBOperationFailed: 552
};
/**
 * Server-side error codes returned in ack stanzas (server → client) that we
 * currently have dedicated handlers for. Extend as more handlers are added.
 * Distinct from the client-side NackReason enum (WAWebCreateNackFromStanza).
 */
export const SERVER_ERROR_CODES = {
    /**
     * 1:1 message missing privacy token (tctoken). Usually means the account is
     * restricted: WhatsApp blocks starting new chats but preserves existing ones,
     * since established chats already carry a tctoken.
     */
    MessageAccountRestriction: '463',
    /** Stanza validation failure (SMAX_INVALID) — likely stale device session */
    SmaxInvalid: '479'
};
export const extractAddressingContext = (stanza) => {
    let senderAlt;
    let recipientAlt;
    const sender = stanza.attrs.participant || stanza.attrs.from;
    const addressingMode = stanza.attrs.addressing_mode || (sender?.endsWith('lid') ? 'lid' : 'pn');
    if (addressingMode === 'lid') {
        // Message is LID-addressed: sender is LID, extract corresponding PN
        // without device data
        senderAlt = stanza.attrs.participant_pn || stanza.attrs.sender_pn || stanza.attrs.peer_recipient_pn;
        recipientAlt = stanza.attrs.recipient_pn;
        // with device data
        //if (sender && senderAlt) senderAlt = transferDevice(sender, senderAlt)
    }
    else {
        // Message is PN-addressed: sender is PN, extract corresponding LID
        // without device data
        senderAlt = stanza.attrs.participant_lid || stanza.attrs.sender_lid || stanza.attrs.peer_recipient_lid;
        recipientAlt = stanza.attrs.recipient_lid;
        //with device data
        //if (sender && senderAlt) senderAlt = transferDevice(sender, senderAlt)
    }
    return {
        addressingMode,
        senderAlt,
        recipientAlt
    };
};
/**
 * Pick the alternate identity form (LID<->PN) to retry decryption against, using
 * the pairing WhatsApp itself put on the stanza (participant_pn/sender_pn or
 * participant_lid/sender_lid). Returns the device-specific alternate JID, or
 * `undefined` when the stanza carries no alternate form or it resolves to the
 * same identity already tried. Ported from WhiskeySockets/Baileys#2763.
 *
 * @param {object} stanza     the incoming message stanza
 * @param {string} triedJid   the JID the primary decrypt attempt used
 * @param {string} author     the device-specific author JID (donates the device id)
 * @returns {string|undefined}
 */
export const getAlternateDecryptionJid = (stanza, triedJid, author) => {
    const { senderAlt } = extractAddressingContext(stanza);
    if (!senderAlt) {
        return undefined;
    }
    let alt;
    try {
        // the stanza's alternate form is user-level; borrow the device we tried
        alt = author ? transferDevice(author, senderAlt) : senderAlt;
    }
    catch {
        alt = senderAlt;
    }
    if (!alt) {
        return undefined;
    }
    // no point retrying the exact identity we already failed on
    if (triedJid && areJidsSameUser(alt, triedJid)) {
        return undefined;
    }
    return alt;
};
/**
 * Decode the received node as a message.
 * @note this will only parse the message, not decrypt it
 */
export function decodeMessageNode(stanza, meId, meLid) {
    let msgType;
    let chatId;
    let author;
    let fromMe = false;
    const msgId = stanza.attrs.id;
    const from = stanza.attrs.from;
    const participant = stanza.attrs.participant;
    const recipient = stanza.attrs.recipient;
    if (!msgId) {
        throw new Boom('Invalid message stanza: missing id attribute', { data: stanza });
    }
    if (!from) {
        throw new Boom('Invalid message stanza: missing from attribute', { data: stanza });
    }
    const addressingContext = extractAddressingContext(stanza);
    const isMe = (jid) => areJidsSameUser(jid, meId);
    const isMeLid = (jid) => areJidsSameUser(jid, meLid);
    if (isPnUser(from) || isLidUser(from) || isHostedLidUser(from) || isHostedPnUser(from)) {
        if (recipient && !isJidMetaAI(recipient)) {
            if (!isMe(from) && !isMeLid(from)) {
                throw new Boom('receipient present, but msg not from me', { data: stanza });
            }
            if (isMe(from) || isMeLid(from)) {
                fromMe = true;
            }
            chatId = recipient;
        }
        else {
            // Peer-routed self stanzas (history sync, app-state sync, etc.) arrive
            // with `from` set to our own device but no `recipient` attribute —
            // still mark as fromMe so self-only protocolMessage handlers run.
            if (isMe(from) || isMeLid(from)) {
                fromMe = true;
            }
            chatId = from;
        }
        msgType = 'chat';
        author = from;
    }
    else if (isJidGroup(from)) {
        if (!participant) {
            throw new Boom('No participant in group message');
        }
        if (isMe(participant) || isMeLid(participant)) {
            fromMe = true;
        }
        msgType = 'group';
        author = participant;
        chatId = from;
    }
    else if (isJidBroadcast(from)) {
        if (!participant) {
            throw new Boom('No participant in group message');
        }
        const isParticipantMe = isMe(participant);
        if (isJidStatusBroadcast(from)) {
            msgType = isParticipantMe ? 'direct_peer_status' : 'other_status';
        }
        else {
            msgType = isParticipantMe ? 'peer_broadcast' : 'other_broadcast';
        }
        fromMe = isParticipantMe;
        chatId = from;
        author = participant;
    }
    else if (isJidNewsletter(from)) {
        msgType = 'newsletter';
        chatId = from;
        author = from;
        if (isMe(from) || isMeLid(from)) {
            fromMe = true;
        }
    }
    else {
        throw new Boom('Unknown message type', { data: stanza });
    }
    const pushname = stanza?.attrs?.notify;
    const key = {
        remoteJid: chatId,
        remoteJidAlt: !isJidGroup(chatId) ? addressingContext.senderAlt : undefined,
        remoteJidUsername: !isJidGroup(chatId)
            ? stanza.attrs.peer_recipient_username || stanza.attrs.recipient_username
            : undefined,
        fromMe,
        id: msgId,
        participant,
        participantAlt: isJidGroup(chatId) ? addressingContext.senderAlt : undefined,
        participantUsername: stanza.attrs.participant ? stanza.attrs.participant_username : undefined,
        addressingMode: addressingContext.addressingMode,
        ...(msgType === 'newsletter' && stanza.attrs.server_id ? { server_id: stanza.attrs.server_id } : {})
    };
    const fullMessage = {
        key,
        category: stanza.attrs.category,
        messageTimestamp: +stanza.attrs.t,
        pushName: pushname,
        broadcast: isJidBroadcast(from)
    };
    if (key.fromMe) {
        fullMessage.status = proto.WebMessageInfo.Status.SERVER_ACK;
    }
    return {
        fullMessage,
        author,
        sender: msgType === 'chat' ? author : chatId
    };
}
export const decryptMessageNode = (stanza, meId, meLid, repository, logger, options = {}) => {
    const { fullMessage, author, sender } = decodeMessageNode(stanza, meId, meLid);
    // Optional log rate-limiter: collapse repeated decrypt failures for a dead
    // session into a bounded number of lines per window (see #2234). Message
    // correctness (the CIPHERTEXT stub) is never suppressed — only the log line.
    const failureTracker = options.failureTracker;
    return {
        fullMessage,
        category: stanza.attrs.category,
        author,
        async decrypt() {
            let decryptables = 0;
            if (Array.isArray(stanza.content)) {
                for (const { tag, attrs, content } of stanza.content) {
                    if (tag === 'verified_name' && content instanceof Uint8Array) {
                        const cert = proto.VerifiedNameCertificate.decode(content);
                        const details = proto.VerifiedNameCertificate.Details.decode(cert.details);
                        fullMessage.verifiedBizName = details.verifiedName;
                    }
                    if (tag === 'unavailable' && attrs.type === 'view_once') {
                        // JAP@Fix (bug 48): was injected into key (wrong place) — store as top-level flag on message instead
                        fullMessage.isViewOnce = true;
                        fullMessage.key.isViewOnce = true; // keep for backward compat with existing code that checks key.isViewOnce
                    }
                    if (attrs.count && tag === 'enc') {
                        fullMessage.retryCount = Number(attrs.count);
                    }
                    if (tag !== 'enc' && tag !== 'plaintext') {
                        continue;
                    }
                    if (!(content instanceof Uint8Array)) {
                        continue;
                    }
                    decryptables += 1;
                    let msgBuffer;
                    const decryptionJid = await getDecryptionJid(author, repository);
                    const e2eType = tag === 'plaintext' ? 'plaintext' : attrs.type;
                    // Always sets the CIPHERTEXT stub; only the error LOG is rate-limited.
                    const stubDecryptFailure = (err) => {
                        fullMessage.messageStubType = proto.WebMessageInfo.StubType.CIPHERTEXT;
                        fullMessage.messageStubParameters = [err.message.toString()];
                        let extra;
                        if (failureTracker) {
                            const r = failureTracker.hit(`${sender}|${e2eType}`);
                            if (!r.log) {
                                return; // suppressed — skip building/emitting the heavy log line
                            }
                            if (r.suppressedSincePrevWindow) {
                                extra = { suppressedSincePrevWindow: r.suppressedSincePrevWindow };
                            }
                        }
                        logger.error({
                            key: fullMessage.key,
                            err,
                            messageType: e2eType,
                            sender,
                            author,
                            isSessionRecordError: isSessionRecordError(err),
                            ...extra
                        }, 'failed to decrypt message');
                    };
                    if (tag !== 'plaintext') {
                        // TODO: Handle hosted devices
                        await storeMappingFromEnvelope(stanza, author, repository, decryptionJid, logger);
                    }
                    // Primary decrypt. On a pkmsg/msg failure we retry ONCE against the
                    // alternate identity form (LID<->PN) that WhatsApp paired to this very
                    // stanza — a device whose Signal session was established under the other
                    // form otherwise throws a persistent "Bad MAC" that a rescan won't fix.
                    // Ported from WhiskeySockets/Baileys#2763; scoped to pkmsg/msg and
                    // preserving the original (more meaningful) error when the retry fails.
                    let decryptErr;
                    try {
                        switch (e2eType) {
                            case 'skmsg':
                                msgBuffer = await repository.decryptGroupMessage({
                                    group: sender,
                                    authorJid: author,
                                    msg: content
                                });
                                break;
                            case 'pkmsg':
                            case 'msg':
                                msgBuffer = await repository.decryptMessage({
                                    jid: decryptionJid,
                                    type: e2eType,
                                    ciphertext: content
                                });
                                break;
                            case 'plaintext':
                                msgBuffer = content;
                                break;
                            default:
                                throw new Error(`Unknown e2e type: ${e2eType}`);
                        }
                    }
                    catch (err) {
                        decryptErr = err;
                        if (e2eType === 'pkmsg' || e2eType === 'msg') {
                            const altJid = getAlternateDecryptionJid(stanza, decryptionJid, author);
                            if (altJid) {
                                try {
                                    msgBuffer = await repository.decryptMessage({
                                        jid: altJid,
                                        type: e2eType,
                                        ciphertext: content
                                    });
                                    decryptErr = undefined;
                                    logger.debug({ key: fullMessage.key, from: decryptionJid, alt: altJid }, 'decrypted with alternate identity form after primary failure');
                                }
                                catch {
                                    // keep the original decryptErr — the alt-form error (e.g. "no session") is less informative
                                }
                            }
                        }
                    }
                    if (decryptErr) {
                        stubDecryptFailure(decryptErr);
                    }
                    else {
                        try {
                            let msg = proto.Message.decode(e2eType !== 'plaintext' ? unpadRandomMax16(msgBuffer) : msgBuffer);
                            msg = msg.deviceSentMessage?.message || msg;
                            if (msg.senderKeyDistributionMessage) {
                                //eslint-disable-next-line max-depth
                                try {
                                    await repository.processSenderKeyDistributionMessage({
                                        authorJid: author,
                                        item: msg.senderKeyDistributionMessage
                                    });
                                }
                                catch (err) {
                                    logger.error({ key: fullMessage.key, err }, 'failed to process sender key distribution message');
                                }
                            }
                            if (fullMessage.message) {
                                Object.assign(fullMessage.message, msg);
                            }
                            else {
                                fullMessage.message = msg;
                            }
                        }
                        catch (err) {
                            stubDecryptFailure(err);
                        }
                    }
                }
            }
            // if nothing was found to decrypt
            if (!decryptables && !fullMessage.key?.isViewOnce) {
                fullMessage.messageStubType = proto.WebMessageInfo.StubType.CIPHERTEXT;
                fullMessage.messageStubParameters = [NO_MESSAGE_FOUND_ERROR_TEXT];
            }
        }
    };
};
/**
 * Utility function to check if an error is related to missing session record
 */
function isSessionRecordError(error) {
    const errorMessage = error?.message || error?.toString() || '';
    return DECRYPTION_RETRY_CONFIG.sessionRecordErrors.some(errorPattern => errorMessage.includes(errorPattern));
}
