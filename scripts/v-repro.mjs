/**
 * scripts/v-repro.mjs --- standalone reproduction for BUGREPORT 2.57 and 2.58.
 *
 * Both sections drive the REAL code (isRealMessage + makeEventBuffer), so since the fixes
 * landed section A prints `true` for the stub types that could never match before, and
 * section B shows the chat-wide delete actually being released on flush.
 * Run with: node scripts/v-repro.mjs
 */
import { isRealMessage, shouldIncrementChatUnread } from '../lib/Utils/process-message.js';
import { makeEventBuffer } from '../lib/Utils/event-buffer.js';
import { proto } from '../WAProto/index.js';
import P from 'pino';
const { WebMessageInfo } = proto;
const T = WebMessageInfo.StubType;

console.log('=== A) isRealMessage(): the stub-type allowances are unreachable ===');
const missedCall = { key: { remoteJid: '628111@s.whatsapp.net', id: 'C1', fromMe: false }, messageStubType: T.CALL_MISSED_VOICE, messageTimestamp: 1 };
const groupAdd  = { key: { remoteJid: 'g@g.us', id: 'G1', fromMe: false, participant: '628222@s.whatsapp.net' }, messageStubType: T.GROUP_PARTICIPANT_ADD, messageStubParameters: ['628111@s.whatsapp.net'], messageTimestamp: 1 };
const textMsg   = { key: { remoteJid: '628111@s.whatsapp.net', id: 'M1', fromMe: false }, message: { conversation: 'hi' }, messageTimestamp: 1 };
for (const [name, m] of [['CALL_MISSED_VOICE stub', missedCall], ['GROUP_PARTICIPANT_ADD stub', groupAdd], ['plain text message', textMsg]]) {
  console.log(` isRealMessage(${name.padEnd(26)}) = ${isRealMessage(m)}  (shouldIncrementChatUnread=${shouldIncrementChatUnread(m)})`);
}
console.log(' => REAL_MSG_STUB_TYPES / REAL_MSG_REQ_ME_STUB_TYPES can never match: `hasSomeContent` is ANDed over the whole expression,');
console.log('    and a stub has no content. So a missed call never bumps conversationTimestamp/unreadCount.');

console.log('\n=== B) the event buffer silently swallows messages.delete { all: true } ===');
const ev = makeEventBuffer(P({ level: 'silent' }));
const seen = [];
ev.on('messages.delete', d => seen.push(d));
ev.on('messages.upsert', d => seen.push({ upsert: d.messages.map(m => m.key.id) }));
ev.buffer();
ev.emit('messages.upsert', { type: 'notify', messages: [WebMessageInfo.fromObject(textMsg)] });
ev.emit('messages.delete', { jid: '628111@s.whatsapp.net', all: true });
ev.flush();
await new Promise(r => setTimeout(r, 50));
console.log(' events delivered after flush:', JSON.stringify(seen));
console.log(' delete delivered?', seen.some(e => e && 'all' in e), '<- the chat-clear is lost, and the buffered upsert survives it');
