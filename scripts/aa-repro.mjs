/**
 * scripts/aa-repro.mjs --- batch AA repro for BUGREPORT 2.64
 *
 * In a LID-addressed group our messages go out under our **LID**
 * (`messages-send.js`: `const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId`).
 * But `generateWAMessageFromContent()` hard-coded `userJid` (our phone number) both for
 * `contextInfo.participant` when quoting ourselves and for the message's own `participant`
 * field — the two `// TODO: Add support for LIDs`.
 *
 * Run: node scripts/aa-repro.mjs
 */
import { generateWAMessageFromContent } from '../lib/Utils/messages.js';
import { quotedParticipantJid, resolveSelfAddressingMode } from '../lib/Utils/self-addressing.js';

const GROUP = '120363000000000000@g.us';
const ME_PN = '628111111111@s.whatsapp.net';
const ME_LID = '77777777777777@lid';
const THEM_LID = '88888888888888@lid';

/** one of our own messages, as the decoder hands it back from a LID-addressed group */
const ownLidMessage = {
	key: { remoteJid: GROUP, fromMe: true, id: 'MSG-1', participant: ME_LID, participantAlt: ME_PN, addressingMode: 'lid' },
	message: { conversation: 'hello from me' }
};

/** somebody else's message in the same group */
const theirLidMessage = {
	key: { remoteJid: GROUP, fromMe: false, id: 'MSG-2', participant: THEM_LID, addressingMode: 'lid' },
	message: { conversation: 'hi' }
};

/** the pre-fix rule, inlined verbatim */
const beforeParticipant = (quoted, userJid) =>
	quoted.key.fromMe ? userJid : quoted.participant || quoted.key.participant || quoted.key.remoteJid;

console.log('=== A. contextInfo.participant when quoting in a LID-addressed group ===');
for (const [label, quoted] of [['our own message', ownLidMessage], ['their message', theirLidMessage]]) {
	const before = beforeParticipant(quoted, ME_PN);
	const after = quotedParticipantJid(quoted, { userJid: ME_PN, userLid: ME_LID });
	console.log(`${label.padEnd(16)} BEFORE ${before.padEnd(30)} AFTER ${after}`);
}
console.log(`the group only knows us as ${ME_LID} — the "before" value names an identity it never saw`);

console.log('\n=== B. end to end through generateWAMessageFromContent() ===');
const reply = generateWAMessageFromContent(
	GROUP,
	{ extendedTextMessage: { text: 'replying to myself' } },
	{ userJid: ME_PN, userLid: ME_LID, quoted: ownLidMessage, messageId: 'OUT-1' }
);
console.log('contextInfo.participant :', reply.message.extendedTextMessage.contextInfo.participant);
console.log('contextInfo.stanzaId    :', reply.message.extendedTextMessage.contextInfo.stanzaId);
console.log('message.participant     :', reply.participant);

const pnOnly = generateWAMessageFromContent(
	GROUP,
	{ extendedTextMessage: { text: 'replying to myself' } },
	{ userJid: ME_PN, userLid: ME_LID, quoted: { ...ownLidMessage, key: { ...ownLidMessage.key, participant: ME_PN, addressingMode: 'pn' } }, messageId: 'OUT-2' }
);
console.log('\na PN-addressed group is untouched ->', pnOnly.message.extendedTextMessage.contextInfo.participant, '/', pnOnly.participant);

console.log('\n=== C. mode resolution precedence ===');
console.log('explicit hint wins          :', resolveSelfAddressingMode({ addressingMode: 'lid', quoted: theirLidMessage, jid: GROUP }));
console.log('else the quoted message     :', resolveSelfAddressingMode({ quoted: theirLidMessage, jid: GROUP }));
console.log('else the chat jid           :', resolveSelfAddressingMode({ jid: '99999999999999@lid' }));
console.log('nothing to go on            :', resolveSelfAddressingMode({ jid: GROUP }));
