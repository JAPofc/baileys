// Tests for the v2.4.6 LID<->PN alternate-identity decrypt retry
// (ported from WhiskeySockets/Baileys#2763): when the primary decrypt fails
// with a session-identity mismatch, retry ONCE against the alternate form the
// stanza itself paired, and preserve the original error if the retry also fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '../WAProto/index.js';
import { getAlternateDecryptionJid, decryptMessageNode } from '../lib/Utils/decode-wa-message.js';

const silentLogger = () => {
    const noop = () => {};
    const l = { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
    l.child = () => l;
    return l;
};

// ── pure helper: getAlternateDecryptionJid ──────────────────────────────────

test('PN-addressed stanza → returns the paired LID (device carried over)', () => {
    const stanza = { attrs: { from: '5511999@s.whatsapp.net', addressing_mode: 'pn', sender_lid: '888@lid' } };
    const alt = getAlternateDecryptionJid(stanza, '5511999@s.whatsapp.net', '5511999:3@s.whatsapp.net');
    assert.equal(alt, '888:3@lid', 'alt LID gets the author device (3)');
});

test('LID-addressed stanza → returns the paired PN', () => {
    const stanza = { attrs: { from: '888@lid', addressing_mode: 'lid', sender_pn: '5511999@s.whatsapp.net' } };
    const alt = getAlternateDecryptionJid(stanza, '888@lid', '888@lid');
    assert.equal(alt, '5511999@s.whatsapp.net');
});

test('group stanza uses participant_lid/participant_pn', () => {
    const stanza = { attrs: { from: '123@g.us', participant: '5511999@s.whatsapp.net', addressing_mode: 'pn', participant_lid: '888@lid' } };
    const alt = getAlternateDecryptionJid(stanza, '5511999@s.whatsapp.net', '5511999@s.whatsapp.net');
    assert.equal(alt, '888@lid');
});

test('no alternate form on the stanza → undefined (no retry)', () => {
    const stanza = { attrs: { from: '5511999@s.whatsapp.net', addressing_mode: 'pn' } };
    assert.equal(getAlternateDecryptionJid(stanza, '5511999@s.whatsapp.net', '5511999@s.whatsapp.net'), undefined);
});

test('alternate resolves to the same identity already tried → undefined', () => {
    // tried the LID already; the stanza's alt form is that same LID user
    const stanza = { attrs: { from: '888@lid', addressing_mode: 'lid', sender_pn: '888@lid' } };
    assert.equal(getAlternateDecryptionJid(stanza, '888@lid', '888@lid'), undefined);
});

// ── integration: decrypt() retry via a mock repository ──────────────────────

const padded = (obj) => {
    const inner = proto.Message.encode(proto.Message.fromObject(obj)).finish();
    return new Uint8Array([...inner, 1]); // 1-byte pkcs7-style pad, unpadded on decode
};

const makeStanza = () => ({
    attrs: { id: 'MSGID1', from: '5511999@s.whatsapp.net', addressing_mode: 'pn', sender_lid: '888@lid' },
    content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([9, 9, 9]) }]
});

const baseRepo = () => ({
    lidMapping: {
        getLIDForPN: async () => null,          // keep decryptionJid = PN
        storeLIDPNMappings: async () => {},
    },
    migrateSession: async () => {},
    decryptGroupMessage: async () => { throw new Error('unexpected skmsg'); },
    processSenderKeyDistributionMessage: async () => {},
});

test('retries with the alternate identity and decrypts when the primary fails', async () => {
    const repo = baseRepo();
    const tried = [];
    repo.decryptMessage = async ({ jid }) => {
        tried.push(jid);
        if (jid === '5511999@s.whatsapp.net') throw new Error('Bad MAC');   // primary PN fails
        if (jid === '888@lid') return padded({ conversation: 'hello alt' }); // alt LID works
        throw new Error('no session');
    };
    const meId = '620000@s.whatsapp.net';
    const node = decryptMessageNode(makeStanza(), meId, '620000@lid', repo, silentLogger());
    await node.decrypt();
    assert.deepEqual(tried, ['5511999@s.whatsapp.net', '888@lid'], 'primary then alternate');
    assert.equal(node.fullMessage.message?.conversation, 'hello alt');
    assert.equal(node.fullMessage.messageStubType, undefined, 'no CIPHERTEXT stub on success');
});

test('preserves the ORIGINAL error when the alternate retry also fails', async () => {
    const repo = baseRepo();
    repo.decryptMessage = async ({ jid }) => {
        if (jid === '5511999@s.whatsapp.net') throw new Error('Bad MAC');   // original
        throw new Error('no session for alternate');                        // retry error (less useful)
    };
    const node = decryptMessageNode(makeStanza(), '620000@s.whatsapp.net', '620000@lid', repo, silentLogger());
    await node.decrypt();
    assert.equal(node.fullMessage.messageStubType, proto.WebMessageInfo.StubType.CIPHERTEXT);
    assert.deepEqual(node.fullMessage.messageStubParameters, ['Bad MAC'], 'original error kept, not the retry error');
});

test('no retry when there is no alternate form (single decrypt attempt, original error)', async () => {
    const repo = baseRepo();
    let calls = 0;
    repo.decryptMessage = async () => { calls++; throw new Error('Bad MAC'); };
    const stanza = { attrs: { id: 'X', from: '5511999@s.whatsapp.net', addressing_mode: 'pn' }, // no sender_lid
        content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }] };
    const node = decryptMessageNode(stanza, '620000@s.whatsapp.net', '620000@lid', repo, silentLogger());
    await node.decrypt();
    assert.equal(calls, 1, 'exactly one decrypt attempt, no wasteful retry');
    assert.deepEqual(node.fullMessage.messageStubParameters, ['Bad MAC']);
});

test('successful primary decrypt never triggers a retry', async () => {
    const repo = baseRepo();
    let calls = 0;
    repo.decryptMessage = async () => { calls++; return padded({ conversation: 'ok' }); };
    const node = decryptMessageNode(makeStanza(), '620000@s.whatsapp.net', '620000@lid', repo, silentLogger());
    await node.decrypt();
    assert.equal(calls, 1);
    assert.equal(node.fullMessage.message?.conversation, 'ok');
});
