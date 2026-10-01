// Tests for the v2.4.6 `messages.decrypt-failed` observability event
// (the app-facing hook requested in WhiskeySockets/Baileys#2234) via its pure
// payload builder buildDecryptFailureEvent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '../WAProto/index.js';
import {
    buildDecryptFailureEvent,
    decryptMessageNode,
    NO_MESSAGE_FOUND_ERROR_TEXT,
    MISSING_KEYS_ERROR_TEXT
} from '../lib/Utils/index.js';

const CIPHERTEXT = proto.WebMessageInfo.StubType.CIPHERTEXT;
const key = { remoteJid: '5511999@s.whatsapp.net', id: 'ABC', fromMe: false };

test('builds a payload for a genuine CIPHERTEXT failure, willRetry=true', () => {
    const evt = buildDecryptFailureEvent({ key, messageStubType: CIPHERTEXT, messageStubParameters: ['Bad MAC'] });
    assert.deepEqual(evt, { key, error: 'Bad MAC', willRetry: true });
});

test('willRetry=false for missing-keys and no-message-found failures', () => {
    const a = buildDecryptFailureEvent({ key, messageStubType: CIPHERTEXT, messageStubParameters: [MISSING_KEYS_ERROR_TEXT] });
    const b = buildDecryptFailureEvent({ key, messageStubType: CIPHERTEXT, messageStubParameters: [NO_MESSAGE_FOUND_ERROR_TEXT] });
    assert.equal(a.willRetry, false);
    assert.equal(b.willRetry, false);
});

test('returns undefined for peer-category failures (handled separately, never retried)', () => {
    const evt = buildDecryptFailureEvent({ key, messageStubType: CIPHERTEXT, messageStubParameters: ['Bad MAC'], category: 'peer' });
    assert.equal(evt, undefined);
});

test('returns undefined for successfully-decrypted (non-CIPHERTEXT) messages', () => {
    assert.equal(buildDecryptFailureEvent({ key, messageStubType: undefined }), undefined);
    assert.equal(buildDecryptFailureEvent({ key, messageStubType: proto.WebMessageInfo.StubType.REVOKE }), undefined);
    assert.equal(buildDecryptFailureEvent(undefined), undefined);
});

test('coerces a missing/empty error to an empty string (never throws)', () => {
    const evt = buildDecryptFailureEvent({ key, messageStubType: CIPHERTEXT });
    assert.equal(evt.error, '');
    assert.equal(evt.willRetry, true);
});

// end-to-end: a real failed decrypt from decryptMessageNode produces a valid event payload
test('event payload derives correctly from an actual decryptMessageNode failure', async () => {
    const stanza = {
        attrs: { id: 'M1', from: '5511999@s.whatsapp.net', addressing_mode: 'pn' },
        content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1, 2, 3]) }]
    };
    const repo = {
        lidMapping: { getLIDForPN: async () => null, storeLIDPNMappings: async () => {} },
        migrateSession: async () => {},
        decryptMessage: async () => { throw new Error('Bad MAC'); }
    };
    const logger = { error: () => {}, warn: () => {}, debug: () => {}, info: () => {}, trace: () => {} };
    logger.child = () => logger;
    const node = decryptMessageNode(stanza, '620@s.whatsapp.net', '620@lid', repo, logger);
    await node.decrypt();
    const evt = buildDecryptFailureEvent(node.fullMessage);
    assert.ok(evt, 'a failure event is produced');
    assert.equal(evt.error, 'Bad MAC');
    assert.equal(evt.willRetry, true);
    assert.equal(evt.key.id, 'M1');
});
