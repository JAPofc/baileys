// Tests for the v2.4.6 binary-node BUILDER helpers (write-side complement to the
// reader helpers): normalizeBinaryNodeAttrs, binaryNode, attrNode, textNode,
// childrenNode, withBinaryNodeAttr, appendBinaryNodeChildren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeBinaryNodeAttrs,
    binaryNode,
    attrNode,
    textNode,
    childrenNode,
    withBinaryNodeAttr,
    appendBinaryNodeChildren,
    getBinaryNodeChild,
    getBinaryNodeChildString
} from '../lib/WABinary/generic-utils.js';
import { encodeBinaryNode, decodeBinaryNode } from '../lib/WABinary/index.js';

test('normalizeBinaryNodeAttrs drops nullish and stringifies the rest', () => {
    assert.deepEqual(
        normalizeBinaryNodeAttrs({ a: 1, b: true, c: false, d: 'x', e: undefined, f: null }),
        { a: '1', b: 'true', c: 'false', d: 'x' }
    );
    assert.deepEqual(normalizeBinaryNodeAttrs(null), {});
    assert.deepEqual(normalizeBinaryNodeAttrs(undefined), {});
});

test('binaryNode builds a normalized node and omits empty array content', () => {
    const n = binaryNode('iq', { to: 's.whatsapp.net', type: 'get', count: 5, flag: true, skip: undefined });
    assert.equal(n.tag, 'iq');
    assert.deepEqual(n.attrs, { to: 's.whatsapp.net', type: 'get', count: '5', flag: 'true' });
    assert.equal('content' in n, false); // no content given

    const empty = binaryNode('x', {}, []);
    assert.equal('content' in empty, false); // empty array → omitted

    const withKids = binaryNode('x', {}, [binaryNode('y'), null, false, binaryNode('z')]);
    assert.equal(withKids.content.length, 2); // falsy dropped

    assert.throws(() => binaryNode(''), /non-empty string/);
    assert.throws(() => binaryNode(123), /non-empty string/);
});

test('attrNode / textNode / childrenNode', () => {
    assert.deepEqual(attrNode('ping', { v: 2 }), { tag: 'ping', attrs: { v: '2' } });

    const t = textNode('name', 'JAP', { lang: 'id' });
    assert.equal(t.content, 'JAP');
    assert.deepEqual(t.attrs, { lang: 'id' });
    assert.equal(textNode('empty', null).content, ''); // null → ''

    const c = childrenNode('list', [attrNode('item', { id: 1 }), attrNode('item', { id: 2 })], { type: 'a' });
    assert.equal(c.content.length, 2);
    assert.equal(c.attrs.type, 'a');
    // single child (not array) is accepted
    assert.equal(childrenNode('wrap', attrNode('solo')).content.length, 1);
});

test('withBinaryNodeAttr is non-mutating and set/removes', () => {
    const base = binaryNode('iq', { type: 'get' });
    const set = withBinaryNodeAttr(base, 'id', 42);
    assert.equal(set.attrs.id, '42');
    assert.equal(base.attrs.id, undefined, 'original untouched');
    const removed = withBinaryNodeAttr(set, 'type', null);
    assert.equal('type' in removed.attrs, false);
    assert.equal(set.attrs.type, 'get', 'original untouched');
});

test('appendBinaryNodeChildren is non-mutating and drops falsy', () => {
    const base = childrenNode('q', [attrNode('a')]);
    const more = appendBinaryNodeChildren(base, [attrNode('b'), null, attrNode('c')]);
    assert.equal(more.content.length, 3);
    assert.equal(base.content.length, 1, 'original untouched');
    // accepts a single child, and works on a node with no prior content
    const fromEmpty = appendBinaryNodeChildren(binaryNode('x'), attrNode('only'));
    assert.equal(fromEmpty.content.length, 1);
});

test('built nodes survive a real encode → decode roundtrip', async () => {
    const node = childrenNode('iq',
        [childrenNode('link_code_companion_reg',
            [textNode('blob', 'hello'), attrNode('meta', { n: 7, ok: true })],
            { stage: 'companion_hello' })],
        { to: 's.whatsapp.net', type: 'set', xmlns: 'md', id: 'round-x', count: 3 });

    const buf = encodeBinaryNode(node);
    assert.ok(buf.length > 0);
    const dec = await decodeBinaryNode(buf);
    assert.equal(dec.tag, 'iq');
    assert.equal(dec.attrs.type, 'set');
    assert.equal(dec.attrs.count, '3'); // number stringified survived
    const reg = getBinaryNodeChild(dec, 'link_code_companion_reg');
    assert.equal(reg.attrs.stage, 'companion_hello');
    assert.equal(getBinaryNodeChildString(reg, 'blob'), 'hello');
    assert.equal(getBinaryNodeChild(reg, 'meta').attrs.ok, 'true');
});
