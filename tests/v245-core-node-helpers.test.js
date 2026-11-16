// Tests for the ten core WABinary node-parsing helpers added in v2.4.5
// (getBinaryNodeAttr, getBinaryNodeChildAttr, getBinaryNodeChildInt,
//  getBinaryNodeChildBool, hasBinaryNodeChild, countBinaryNodeChildren,
//  getBinaryNodeChildrenAttrs, filterBinaryNodeChildren,
//  getBinaryNodeContentString, getBinaryNodeErrorStatus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getBinaryNodeAttr,
    getBinaryNodeChildAttr,
    getBinaryNodeChildInt,
    getBinaryNodeChildBool,
    hasBinaryNodeChild,
    countBinaryNodeChildren,
    getBinaryNodeChildrenAttrs,
    filterBinaryNodeChildren,
    getBinaryNodeContentString,
    getBinaryNodeErrorStatus
} from '../lib/WABinary/generic-utils.js';

// A realistic IQ-result stanza shape
const iq = {
    tag: 'iq',
    attrs: { from: 's.whatsapp.net', type: 'result', id: 'abc' },
    content: [
        { tag: 'count', attrs: { value: '42' }, content: undefined },
        { tag: 'enabled', attrs: { state: 'true' }, content: undefined },
        { tag: 'ping', attrs: {}, content: Buffer.from('pong') },
        { tag: 'device', attrs: { id: '1' } },
        { tag: 'device', attrs: { id: '2' } },
        { tag: 'device', attrs: { id: '3' } }
    ]
};

// -------------------------------------------------------- getBinaryNodeAttr
test('getBinaryNodeAttr reads own attr and honors fallback', () => {
    assert.equal(getBinaryNodeAttr(iq, 'type'), 'result');
    assert.equal(getBinaryNodeAttr(iq, 'missing'), undefined);
    assert.equal(getBinaryNodeAttr(iq, 'missing', 'x'), 'x');
    assert.equal(getBinaryNodeAttr(null, 'type', 'safe'), 'safe');
    assert.equal(getBinaryNodeAttr({}, 'type', 'safe'), 'safe');
});

// -------------------------------------------------------- getBinaryNodeChildAttr
test('getBinaryNodeChildAttr reads attr of first matching child', () => {
    assert.equal(getBinaryNodeChildAttr(iq, 'count', 'value'), '42');
    assert.equal(getBinaryNodeChildAttr(iq, 'device', 'id'), '1'); // first device only
    assert.equal(getBinaryNodeChildAttr(iq, 'count', 'missing'), undefined);
    assert.equal(getBinaryNodeChildAttr(iq, 'nope', 'value'), undefined);
});

// -------------------------------------------------------- getBinaryNodeChildInt
test('getBinaryNodeChildInt parses attr and content, with fallback', () => {
    assert.equal(getBinaryNodeChildInt(iq, 'count', 'value'), 42);
    assert.equal(getBinaryNodeChildInt(iq, 'device', 'id'), 1);
    // from content (no attr arg): <ping>pong</ping> is not numeric → fallback
    assert.equal(getBinaryNodeChildInt(iq, 'ping', undefined, -1), -1);
    // missing child → undefined (distinct from unparseable fallback)
    assert.equal(getBinaryNodeChildInt(iq, 'nope', 'value'), undefined);
    assert.equal(getBinaryNodeChildInt(iq, 'nope', 'value', 0), undefined);
    // numeric content
    const node = { content: [{ tag: 'n', content: '7' }] };
    assert.equal(getBinaryNodeChildInt(node, 'n'), 7);
});

// -------------------------------------------------------- getBinaryNodeChildBool
test('getBinaryNodeChildBool coerces truthy strings', () => {
    assert.equal(getBinaryNodeChildBool(iq, 'enabled', 'state'), true);
    const f = { content: [{ tag: 'a', attrs: { v: 'false' } }, { tag: 'b', attrs: { v: '0' } }, { tag: 'c', attrs: { v: 'YES' } }] };
    assert.equal(getBinaryNodeChildBool(f, 'a', 'v'), false);
    assert.equal(getBinaryNodeChildBool(f, 'b', 'v'), false);
    assert.equal(getBinaryNodeChildBool(f, 'c', 'v'), true);
    assert.equal(getBinaryNodeChildBool(iq, 'missing', 'state'), undefined);
});

// -------------------------------------------------------- hasBinaryNodeChild / count
test('hasBinaryNodeChild and countBinaryNodeChildren', () => {
    assert.equal(hasBinaryNodeChild(iq, 'device'), true);
    assert.equal(hasBinaryNodeChild(iq, 'ghost'), false);
    assert.equal(hasBinaryNodeChild(null, 'x'), false);
    assert.equal(countBinaryNodeChildren(iq, 'device'), 3);
    assert.equal(countBinaryNodeChildren(iq, 'count'), 1);
    assert.equal(countBinaryNodeChildren(iq, 'ghost'), 0);
});

// -------------------------------------------------------- getBinaryNodeChildrenAttrs
test('getBinaryNodeChildrenAttrs returns attrs of every match', () => {
    const attrs = getBinaryNodeChildrenAttrs(iq, 'device');
    assert.deepEqual(attrs, [{ id: '1' }, { id: '2' }, { id: '3' }]);
    assert.deepEqual(getBinaryNodeChildrenAttrs(iq, 'ghost'), []);
    // child without attrs → {}
    const n = { content: [{ tag: 'x' }] };
    assert.deepEqual(getBinaryNodeChildrenAttrs(n, 'x'), [{}]);
});

// -------------------------------------------------------- filterBinaryNodeChildren
test('filterBinaryNodeChildren filters content safely', () => {
    const evens = filterBinaryNodeChildren(iq, (c) => c.tag === 'device' && +c.attrs.id % 2 === 0);
    assert.equal(evens.length, 1);
    assert.equal(evens[0].attrs.id, '2');
    // non-array content → []
    assert.deepEqual(filterBinaryNodeChildren({ content: 'str' }, () => true), []);
    assert.deepEqual(filterBinaryNodeChildren(null, () => true), []);
});

// -------------------------------------------------------- getBinaryNodeContentString
test('getBinaryNodeContentString coerces buffer/string content', () => {
    assert.equal(getBinaryNodeContentString({ content: Buffer.from('hi') }), 'hi');
    assert.equal(getBinaryNodeContentString({ content: new Uint8Array([104, 105]) }), 'hi');
    assert.equal(getBinaryNodeContentString({ content: 'plain' }), 'plain');
    assert.equal(getBinaryNodeContentString({ content: [] }), undefined); // array content
    assert.equal(getBinaryNodeContentString(null), undefined);
});

// -------------------------------------------------------- getBinaryNodeErrorStatus
test('getBinaryNodeErrorStatus returns error info without throwing', () => {
    const errStanza = {
        tag: 'iq',
        attrs: { type: 'error' },
        content: [{ tag: 'error', attrs: { code: '401', text: 'not-authorized' } }]
    };
    assert.deepEqual(getBinaryNodeErrorStatus(errStanza), { code: 401, text: 'not-authorized' });
    // error stanza with code on the node itself (no <error> child)
    const selfErr = { tag: 'iq', attrs: { type: 'error', code: '404', text: 'item-not-found' } };
    assert.deepEqual(getBinaryNodeErrorStatus(selfErr), { code: 404, text: 'item-not-found' });
    // <error> without numeric code
    const noCode = { content: [{ tag: 'error', attrs: {} }] };
    assert.deepEqual(getBinaryNodeErrorStatus(noCode), { code: undefined, text: 'Unknown error' });
    // clean stanza → undefined
    assert.equal(getBinaryNodeErrorStatus(iq), undefined);
    assert.equal(getBinaryNodeErrorStatus(null), undefined);
});
