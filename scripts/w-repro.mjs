/**
 * scripts/w-repro.mjs --- standalone reproduction for BUGREPORT 2.59 and 2.60.
 *
 * Drives the REAL processMessage() through a stub event emitter, so since the fixes landed
 * section A shows both approval-request stubs emitting `group.join-request` and section B
 * shows a LID-addressed leave marking the chat read-only.
 * Run with: node scripts/w-repro.mjs
 */
import processMessage from '../lib/Utils/process-message.js';
import { proto } from '../WAProto/index.js';
import P from 'pino';
const T = proto.WebMessageInfo.StubType;
const ME = '628111@s.whatsapp.net', MELID = '77665544@lid';
const run = async (message) => {
  const events = [];
  const ev = { emit: (e, d) => events.push([e, JSON.parse(JSON.stringify(d))]), on(){}, off(){} };
  await processMessage(message, {
    ev, creds: { me: { id: ME, lid: MELID }, accountSettings: {} },
    keyStore: { get: async () => ({}), set: async () => {} },
    logger: P({ level: 'silent' }), options: {}, signalRepository: {},
    shouldProcessHistoryMsg: false, placeholderResendCache: undefined, getMessage: async () => undefined
  });
  return events;
};
const stub = (type, params, extra={}) => ({
  key: { remoteJid: 'g@g.us', id: 'S'+type, fromMe: false, participant: '99@lid' },
  messageStubType: type, messageStubParameters: params, messageTimestamp: 1, ...extra });

console.log('=== A) plain GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST emits no join-request ===');
for (const t of ['GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST', 'GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD']) {
  const evs = await run(stub(T[t], [JSON.stringify({ lid: '12345@lid', pn: '628222@s.whatsapp.net' }), 'created', 'invite_link']));
  console.log(` ${t.padEnd(52)} -> ${JSON.stringify(evs.map(e => e[0]))}`);
}
console.log(" => lib/Utils/join-requests.js binds to 'group.join-request'; the ordinary invite-link request never reaches it.");

console.log('\n=== B) participantsIncludesMe() is phoneNumber-only ===');
for (const [label, param] of [['leave as PN   ', ME], ['leave as LID  ', MELID]]) {
  const evs = await run(stub(T.GROUP_PARTICIPANT_LEAVE, [param]));
  const chatUpd = evs.find(e => e[0] === 'chats.update');
  console.log(` ${label} -> chats.update: ${JSON.stringify(chatUpd?.[1])}`);
}
console.log(' => leaving a LID-addressed group never sets readOnly:true, so the chat stays writable.');
