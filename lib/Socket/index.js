import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { makeUsernameSocket } from './username.js';
import { triggerAutoFollow } from './newsletter.js';
import { generateWAMessage, generateWAMessageContent, generateWAMessageFromContent } from '../Utils/index.js';
import { jidDecode } from '../WABinary/index.js';
import { tagAll as tagAllWithSock, hideTag as hideTagWithSock } from '../Utils/tag.js';
import { sendVoiceNote as sendVoiceNoteWithSock } from '../Utils/voice-note.js';
import { getPhoneNumber as getPhoneNumberWithSock, getLidForPhone as getLidForPhoneWithSock, resolveSenderPn as resolveSenderPnWithSock } from '../Utils/jid-tools.js';
import { shareGroupHistory as shareGroupHistoryWithSock } from '../Utils/history-share.js';
import { transcribeMessage as transcribeMessageWithSock } from '../Utils/transcribe.js';
import { askMetaAI as askMetaAIWithSock } from '../Utils/meta-ai.js';
import { sendHumanized as sendHumanizedWithSock } from '../Utils/humanizer.js';
export { Dugong } from './dugong.js';
// JAP@Port: chain top moved communities -> username (makeUsernameSocket wraps
// makeCommunitiesSocket internally), adding checkUsername/setUsername/etc.
const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = makeUsernameSocket(newConfig);
    triggerAutoFollow(sock, newConfig);
    // JAP@Compat 1.4.2 --- expose legacy/alternate Baileys API names as real
    // aliases to the internal implementations that already exist on `sock`
    // (or are pure utility functions). Nothing here is a stub: every alias
    // points at the same code path the "modern" name already uses.
    sock.jidDecode = jidDecode;
    sock.generateWAMessage = generateWAMessage;
    sock.generateWAMessageContent = generateWAMessageContent;
    sock.generateWAMessageFromContent = generateWAMessageFromContent;
    // legacy name for generateWAMessageFromContent(jid, message, options)
    sock.prepareMessageFromContent = generateWAMessageFromContent;
    // legacy name for the internal sendReceipt(jid, participant, messageIds, type)
    // sock.sendReceipt / sock.readMessages already exist from messages-send.js
    if (typeof sock.sendReceipt === 'function' && typeof sock.sendReadReceipt !== 'function') {
        sock.sendReadReceipt = sock.sendReceipt;
    }
    // JAP@Add --- utility wrappers needing the FULL composed socket (groupMetadata,
    // signalRepository, ev, ...). Standalone forms also exported from the root.
    sock.tagAll = (jid, text, options) => tagAllWithSock(sock, jid, text, options);
    sock.hideTag = (jid, text, options) => hideTagWithSock(sock, jid, text, options);
    sock.sendVoiceNote = (jid, audio, options) => sendVoiceNoteWithSock(sock, jid, audio, options);
    sock.getPhoneNumber = (jid) => getPhoneNumberWithSock(sock, jid);
    sock.getLidForPhone = (phone) => getLidForPhoneWithSock(sock, phone);
    sock.resolveSenderPn = (webMessage) => resolveSenderPnWithSock(sock, webMessage);
    sock.shareGroupHistory = (opts) => shareGroupHistoryWithSock(sock, opts);
    sock.transcribeMessage = (webMessage, opts) => transcribeMessageWithSock(sock, webMessage, opts);
    sock.askMetaAI = (prompt, opts) => askMetaAIWithSock(sock, prompt, opts);
    sock.sendHumanized = (jid, content, humanOpts, sendOptions) => sendHumanizedWithSock(sock, jid, content, humanOpts, sendOptions);
    return sock;
};
export default makeWASocket;
