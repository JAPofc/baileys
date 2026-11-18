// Deep encode/decode round-trip coverage for lib/WABinary, plus a regression
// lock on the JAP@Fix for the attribute list-size desync bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBinaryNode } from '../lib/WABinary/encode.js';
import { decodeDecompressedBinaryNode, decodeBinaryNode } from '../lib/WABinary/decode.js';
import * as constants from '../lib/WABinary/constants.js';

// encodeBinaryNode prepends a 0x00 "uncompressed" prefix; the low-level decoder
// consumes the already-stripped body, so slice(1) here mirrors decodeBinaryNode.
const roundTrip = (node) => decodeDecompressedBinaryNode(encodeBinaryNode(node).slice(1), constants);

// The decoder always emits a `content` key (undefined for leaves); strip those
// so structural comparisons stay readable. Buffer/array content is preserved.
const strip = (n) => {
    if (!n || typeof n !== 'object' || Buffer.isBuffer(n) || n instanceof Uint8Array) return n;
    const o = { tag: n.tag, attrs: n.attrs };
    if (n.content !== undefined) o.content = Array.isArray(n.content) ? n.content.map(strip) : n.content;
    return o;
};

test('plain node with string attrs and nested children round-trips', () => {
    const node = { tag: 'iq', attrs: { id: 'abc', to: 's.whatsapp.net' }, content: [{ tag: 'ping', attrs: {} }] };
    assert.deepEqual(strip(roundTrip(node)), node);
});

test('JID attributes round-trip: pair, device (AD), lid', () => {
    assert.equal(roundTrip({ tag: 'x', attrs: { jid: '628@s.whatsapp.net' } }).attrs.jid, '628@s.whatsapp.net');
    assert.equal(roundTrip({ tag: 'x', attrs: { jid: '628:3@s.whatsapp.net' } }).attrs.jid, '628:3@s.whatsapp.net');
    assert.equal(roundTrip({ tag: 'x', attrs: { jid: '628:1@lid' } }).attrs.jid, '628:1@lid');
});

test('packed string content round-trips (nibble digits and hex)', () => {
    // nibble/hex/token content decodes back to a string (readString path)
    assert.equal(roundTrip({ tag: 'x', content: '1234567890' }).content, '1234567890');
    assert.equal(roundTrip({ tag: 'x', content: 'ABCDEF' }).content, 'ABCDEF');
    assert.equal(roundTrip({ tag: 'x', content: '12345' }).content, '12345'); // odd-length nibble
});

test('a dictionary/single-byte token round-trips as tag and as content', () => {
    assert.equal(roundTrip({ tag: 'message', attrs: {} }).tag, 'message');
    assert.equal(roundTrip({ tag: 'x', content: 'message' }).content, 'message');
});

test('an arbitrary (raw) string content comes back as a Buffer (upstream behavior)', () => {
    const decoded = roundTrip({ tag: 'x', content: 'ok' });
    assert.ok(Buffer.isBuffer(decoded.content));
    assert.equal(Buffer.from(decoded.content).toString('utf-8'), 'ok');
});

test('buffer content round-trips across the BINARY_8 / BINARY_20 size boundary', () => {
    const small = Buffer.from([1, 2, 3, 0, 255]);
    assert.deepEqual(Buffer.from(roundTrip({ tag: 'x', content: small }).content), small);
    const big = Buffer.alloc(300, 7); // > 255 → BINARY_20
    const decoded = roundTrip({ tag: 'x', content: big });
    assert.equal(decoded.content.length, 300);
    assert.deepEqual(Buffer.from(decoded.content), big);
});

test('null/undefined attributes are dropped (both sides agree)', () => {
    const decoded = roundTrip({ tag: 'x', attrs: { a: '1', b: null, c: undefined, d: '2' } });
    assert.deepEqual(decoded.attrs, { a: '1', d: '2' });
});

test('REGRESSION (JAP@Fix): a non-string attr no longer corrupts the stream', () => {
    // Before the fix, the list-size header counted `count`/`flag`, but the writer
    // skipped them (non-string), so the decoder read content bytes as the missing
    // attr pair and threw "invalid string with tag …". Now they are cleanly
    // dropped and the rest of the node survives intact.
    const node = { tag: 'iq', attrs: { id: 'abc', count: 5, flag: true, to: 's.whatsapp.net' }, content: [{ tag: 'ping', attrs: {} }] };
    assert.deepEqual(strip(roundTrip(node)), {
        tag: 'iq', attrs: { id: 'abc', to: 's.whatsapp.net' }, content: [{ tag: 'ping', attrs: {} }]
    });
});

test('a node that is only string attrs (no content) round-trips', () => {
    const node = { tag: 'presence', attrs: { type: 'available', last: 'true' } };
    const decoded = roundTrip(node);
    assert.equal(decoded.tag, 'presence');
    assert.deepEqual(decoded.attrs, { type: 'available', last: 'true' });
    assert.equal(decoded.content, undefined);
});

test('deeply nested list content round-trips', () => {
    const node = {
        tag: 'root', attrs: {},
        content: [
            { tag: 'a', attrs: { k: 'v' }, content: [{ tag: 'a1', attrs: {} }] },
            { tag: 'b', attrs: {}, content: '2024' } // nibble → decodes back to string
        ]
    };
    assert.deepEqual(strip(roundTrip(node)), node);
});

test('encodeBinaryNode throws on a node without a tag', () => {
    assert.throws(() => encodeBinaryNode({ attrs: {} }), /tag cannot be undefined/);
});

test('decodeBinaryNode handles the uncompressed 0x00-prefixed wire buffer', async () => {
    const wire = encodeBinaryNode({ tag: 'stream', attrs: { id: '1' }, content: '2024' });
    const decoded = await decodeBinaryNode(wire);
    assert.equal(decoded.tag, 'stream');
    assert.equal(decoded.attrs.id, '1');
    assert.equal(decoded.content, '2024');
});
