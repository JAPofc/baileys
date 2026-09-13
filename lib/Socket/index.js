import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { makeUsernameSocket } from './username.js';
import { triggerAutoFollow } from './newsletter.js';
import { fetchBestWaVersion, generateWAMessage, generateWAMessageContent, generateWAMessageFromContent } from '../Utils/index.js';
import { jidDecode } from '../WABinary/index.js';
import { tagAll as tagAllWithSock, hideTag as hideTagWithSock } from '../Utils/tag.js';
import { sendVoiceNote as sendVoiceNoteWithSock } from '../Utils/voice-note.js';
import { getPhoneNumber as getPhoneNumberWithSock, getLidForPhone as getLidForPhoneWithSock, resolveSenderPn as resolveSenderPnWithSock } from '../Utils/jid-tools.js';
import { sendBroadcast as sendBroadcastWithSock, joinGroupViaLink as joinGroupViaLinkWithSock } from '../Utils/text-tools.js';
import { shareGroupHistory as shareGroupHistoryWithSock } from '../Utils/history-share.js';
import { transcribeMessage as transcribeMessageWithSock } from '../Utils/transcribe.js';
import { askMetaAI as askMetaAIWithSock } from '../Utils/meta-ai.js';
import { sendHumanized as sendHumanizedWithSock } from '../Utils/humanizer.js';
import { printBanner } from '../Utils/banner.js';
export { Dugong } from './dugong.js';
// JAP@Port: chain top moved communities -> username (makeUsernameSocket wraps
// makeCommunitiesSocket internally), adding checkUsername/setUsername/etc.
const makeWASocket = (config) => {
    // JAP@Add: 'auto' is only valid through makeWASocketAuto() — the version
    // lookup is network-async while this factory is sync. Fail loudly instead
    // of letting WA reject the handshake with a confusing 405 later.
    if (config?.version === 'auto') {
        throw new Error("version: 'auto' requires the async factory: use `await makeWASocketAuto(config)` (or call fetchBestWaVersion() yourself and pass its version).");
    }
    // JAP@Add: one-time startup banner (replaces the removed postinstall banner).
    // Permanent — always shown once per process: full banner on a TTY, a single
    // plain signature line on non-TTY output (never corrupts JSON/structured logs).
    printBanner();
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
    sock.sendBroadcast = (jids, content, options) => sendBroadcastWithSock(sock, jids, content, options);
    sock.joinGroupViaLink = (linkOrCode) => joinGroupViaLinkWithSock(sock, linkOrCode);
    return sock;
};
/**
 * JAP@Add --- async factory with automatic WA Web version resolution.
 * `await makeWASocketAuto(config)` resolves the freshest client version via
 * fetchBestWaVersion() (WA's own sw.js -> baileys fork -> hardcoded fallback,
 * never throws) before opening the socket — the same stale-version guard the
 * Framework Bot already has, now for direct socket users. A pinned
 * `config.version` array is respected untouched; `version: 'auto'` (or no
 * version at all) triggers the lookup.
 */
export const makeWASocketAuto = async (config = {}) => {
    const { version, ...rest } = config;
    if (Array.isArray(version)) {
        return makeWASocket(config);
    }
    const best = await fetchBestWaVersion();
    return makeWASocket({ ...rest, version: best.version });
};
export default makeWASocket;
