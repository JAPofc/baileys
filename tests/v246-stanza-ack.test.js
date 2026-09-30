// Tests for buildAckStanza (stanza-ack) — the pure ACK/NACK builder, was uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAckStanza } from '../lib/Utils/stanza-ack.js';

test('basic ACK mirrors id, routes to sender, and carries the node class', () => {
    const s = buildAckStanza({ tag: 'receipt', attrs: { id: 'X', from: '62@s.whatsapp.net' } });
    assert.deepEqual(s, {
        tag: 'ack',
        attrs: { id: 'X', to: '62@s.whatsapp.net', class: 'receipt' }
    });
});

test('errorCode becomes a stringified NACK error attribute', () => {
    const s = buildAckStanza({ tag: 'iq', attrs: { id: 'I', from: 's' } }, 500);
    assert.equal(s.attrs.error, '500');
});

test('participant and recipient are forwarded when present', () => {
    const s = buildAckStanza({ tag: 'receipt', attrs: { id: 'R', from: 'g@g.us', participant: '62@s.whatsapp.net', recipient: 'r@s.whatsapp.net' } });
    assert.equal(s.attrs.participant, '62@s.whatsapp.net');
    assert.equal(s.attrs.recipient, 'r@s.whatsapp.net');
});

test('type is included only when present', () => {
    assert.equal(buildAckStanza({ tag: 'message', attrs: { id: 'M', from: 'g', type: 'text' } }).attrs.type, 'text');
    assert.equal('type' in buildAckStanza({ tag: 'message', attrs: { id: 'M', from: 'g' } }).attrs, false);
});

test('message-class ACKs add `from: meId`; other classes and missing meId do not', () => {
    const withMe = buildAckStanza({ tag: 'message', attrs: { id: 'M', from: 'g@g.us' } }, null, 'me@s.whatsapp.net');
    assert.equal(withMe.attrs.from, 'me@s.whatsapp.net');
    assert.equal('from' in buildAckStanza({ tag: 'message', attrs: { id: 'M', from: 'g' } }).attrs, false);
    assert.equal('from' in buildAckStanza({ tag: 'receipt', attrs: { id: 'R', from: 'g' } }, null, 'me@s.whatsapp.net').attrs, false);
});

test('no errorCode → no error attribute', () => {
    assert.equal('error' in buildAckStanza({ tag: 'receipt', attrs: { id: 'X', from: 's' } }).attrs, false);
});
