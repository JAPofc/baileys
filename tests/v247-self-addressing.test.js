/**
 * tests/v247-self-addressing.test.js — batch AA (v2.4.7)
 *
 * Covers BUGREPORT §2.64: in a LID-addressed group we sent under our LID but named
 * ourselves by phone number in `contextInfo.participant` and in the message's own
 * `participant` field (the two `TODO: Add support for LIDs`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	keyAddressingMode,
	quotedParticipantJid,
	resolveSelfAddressingMode,
	selfJidForAddressingMode
} from '../lib/Utils/index.js';
import { generateWAMessageFromContent } from '../lib/Utils/messages.js';

const GROUP = '120363000000000000@g.us';
const ME_PN = '628111111111@s.whatsapp.net';
const ME_LID = '77777777777777@lid';
const THEM_LID = '88888888888888@lid';
const THEM_PN = '628222222222@s.whatsapp.net';
const me = { userJid: ME_PN, userLid: ME_LID };

const ownLid = {
	key: { remoteJid: GROUP, fromMe: true, id: 'MSG-1', participant: ME_LID, participantAlt: ME_PN, addressingMode: 'lid' },
	message: { conversation: 'mine' }
};
const ownPn = {
	key: { remoteJid: GROUP, fromMe: true, id: 'MSG-1', participant: ME_PN, addressingMode: 'pn' },
	message: { conversation: 'mine' }
};
const theirLid = {
	key: { remoteJid: GROUP, fromMe: false, id: 'MSG-2', participant: THEM_LID, addressingMode: 'lid' },
	message: { conversation: 'theirs' }
};
const reply = (opts) =>
	generateWAMessageFromContent(GROUP, { extendedTextMessage: { text: 'hi' } }, { messageId: 'OUT', ...opts });

describe('§2.64 we name ourselves the way the chat addresses us', () => {
	it('quoting our own message in a LID group uses our LID', () => {
		assert.equal(quotedParticipantJid(ownLid, me), ME_LID);
	});

	it('quoting our own message in a PN group still uses our phone number', () => {
		assert.equal(quotedParticipantJid(ownPn, me), ME_PN);
	});

	it('quoting somebody else is untouched', () => {
		assert.equal(quotedParticipantJid(theirLid, me), THEM_LID);
		assert.equal(quotedParticipantJid({ key: { fromMe: false, remoteJid: THEM_PN } }, me), THEM_PN);
		assert.equal(quotedParticipantJid({ key: { fromMe: false, remoteJid: GROUP }, participant: THEM_PN }, me), THEM_PN);
	});

	it('falls back to the phone number when we have no LID', () => {
		assert.equal(quotedParticipantJid(ownLid, { userJid: ME_PN }), ME_PN);
	});

	it('is safe without a quote', () => {
		assert.equal(quotedParticipantJid(undefined, me), undefined);
		assert.equal(quotedParticipantJid({}, me), undefined);
	});

	it('end to end: contextInfo.participant and participant both become the LID', () => {
		const msg = reply({ ...me, quoted: ownLid });
		assert.equal(msg.message.extendedTextMessage.contextInfo.participant, ME_LID);
		assert.equal(msg.message.extendedTextMessage.contextInfo.stanzaId, 'MSG-1');
		assert.equal(msg.participant, ME_LID);
	});

	it('end to end: a PN-addressed group is unchanged', () => {
		const msg = reply({ ...me, quoted: ownPn });
		assert.equal(msg.message.extendedTextMessage.contextInfo.participant, ME_PN);
		assert.equal(msg.participant, ME_PN);
	});

	it('end to end: an explicit addressingMode hint drives a group message with no quote', () => {
		assert.equal(reply({ ...me, addressingMode: 'lid' }).participant, ME_LID);
		assert.equal(reply({ ...me, addressingMode: 'pn' }).participant, ME_PN);
		assert.equal(reply({ ...me }).participant, ME_PN, 'no evidence at all → the old behaviour');
	});

	it('end to end: quoting someone else in a LID group still names us by LID on the envelope', () => {
		const msg = reply({ ...me, quoted: theirLid });
		assert.equal(msg.message.extendedTextMessage.contextInfo.participant, THEM_LID);
		assert.equal(msg.participant, ME_LID);
	});

	it('end to end: a 1:1 chat carries no participant at all', () => {
		const msg = generateWAMessageFromContent(THEM_PN, { extendedTextMessage: { text: 'hi' } }, { ...me, messageId: 'OUT' });
		assert.ok(!msg.participant);
	});

	it('the TODOs are gone from messages.js', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Utils/messages.js', import.meta.url), 'utf8');
		assert.doesNotMatch(source, /\/\/ TODO: Add support for LIDs/);
		assert.match(source, /participant: isJidGroup\(jid\) \|\| isJidStatusBroadcast\(jid\) \? selfJid : undefined/);
	});

	it('messages-send.js passes our LID and the cached group addressing mode', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
		assert.match(source, /const userLid = authState\.creds\.me\?\.lid;/);
		assert.match(source, /resolveGroupAddressingMode = async/);
		assert.match(source, /^\s+userLid,$/m);
		assert.match(source, /^\s+addressingMode,$/m);
	});
});

describe('self-addressing helpers (v2.4.7 upgrade)', () => {
	it('reads the mode off a key, explicitly or by inference', () => {
		assert.equal(keyAddressingMode({ addressingMode: 'lid' }), 'lid');
		assert.equal(keyAddressingMode({ addressingMode: 'pn' }), 'pn');
		assert.equal(keyAddressingMode({ participant: THEM_LID }), 'lid');
		assert.equal(keyAddressingMode({ participant: THEM_PN }), 'pn');
		assert.equal(keyAddressingMode({ remoteJid: THEM_LID }), 'lid');
		assert.equal(keyAddressingMode({ remoteJid: GROUP }), undefined, 'a group jid says nothing about the mode');
		assert.equal(keyAddressingMode({ addressingMode: 'nonsense', remoteJid: THEM_PN }), 'pn');
		assert.equal(keyAddressingMode(undefined), undefined);
		assert.equal(keyAddressingMode('x'), undefined);
	});

	it('prefers the participant over the remoteJid', () => {
		assert.equal(keyAddressingMode({ participant: THEM_LID, remoteJid: THEM_PN }), 'lid');
	});

	it('maps a mode to one of our identities', () => {
		assert.equal(selfJidForAddressingMode('lid', me), ME_LID);
		assert.equal(selfJidForAddressingMode('pn', me), ME_PN);
		assert.equal(selfJidForAddressingMode(undefined, me), ME_PN);
		assert.equal(selfJidForAddressingMode('lid', { userJid: ME_PN }), ME_PN);
		assert.equal(selfJidForAddressingMode('lid', {}), undefined);
	});

	it('normalises the device suffix off our identity', () => {
		assert.equal(selfJidForAddressingMode('lid', { userLid: '77777777777777:12@lid' }), ME_LID);
		assert.equal(selfJidForAddressingMode('pn', { userJid: '628111111111:5@s.whatsapp.net' }), ME_PN);
	});

	it('resolves the mode by precedence: hint, quote, chat jid', () => {
		assert.equal(resolveSelfAddressingMode({ addressingMode: 'pn', quoted: theirLid, jid: THEM_LID }), 'pn');
		assert.equal(resolveSelfAddressingMode({ quoted: theirLid, jid: THEM_PN }), 'lid');
		assert.equal(resolveSelfAddressingMode({ jid: THEM_LID }), 'lid');
		assert.equal(resolveSelfAddressingMode({ jid: THEM_PN }), 'pn');
		assert.equal(resolveSelfAddressingMode({ jid: GROUP }), undefined);
		assert.equal(resolveSelfAddressingMode(), undefined);
	});
});
