// Tests for createMessageDedupe (message-dedupe) — previously uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageDedupe } from '../lib/Utils/message-dedupe.js';

const key = (id, over = {}) => ({ id, remoteJid: '62@s.whatsapp.net', fromMe: false, ...over });

test('seen() checks and records in one call', () => {
    const d = createMessageDedupe();
    const k = key('ABC');
    assert.equal(d.seen(k), false); // first time
    assert.equal(d.seen(k), true);  // recorded → repeat
    assert.equal(d.has(k), true);
});

test('accepts a bare key, a full message, or a string id (bare/full match)', () => {
    const d = createMessageDedupe();
    const k = key('SAME');
    assert.equal(d.seen(k), false);
    assert.equal(d.seen({ key: k }), true); // full message form maps to same key
    assert.equal(d.seen('raw'), false);
    assert.equal(d.seen('raw'), true);
});

test('blank / keyless inputs are never-seen and not stored', () => {
    const d = createMessageDedupe();
    assert.equal(d.seen(null), false);
    assert.equal(d.seen(undefined), false);
    assert.equal(d.seen({}), false);
    assert.equal(d.seen({ key: {} }), false);
    assert.equal(d.size, 0);
});

test('fromMe and remoteJid are part of the identity', () => {
    const d = createMessageDedupe();
    assert.equal(d.seen(key('Z', { fromMe: false })), false);
    assert.equal(d.seen(key('Z', { fromMe: true })), false);  // distinct
    assert.equal(d.seen(key('Z', { remoteJid: 'other' })), false); // distinct
    assert.equal(d.size, 3);
});

test('has() checks without recording; add() records without returning', () => {
    const d = createMessageDedupe();
    assert.equal(d.has('x'), false);
    assert.equal(d.has('x'), false); // still not recorded
    d.add('x');
    assert.equal(d.has('x'), true);
    assert.equal(d.seen('x'), true);
});

test('delete() and clear()', () => {
    const d = createMessageDedupe();
    d.add(key('A'));
    assert.equal(d.delete(key('A')), true);
    assert.equal(d.delete(key('A')), false);
    d.add('a'); d.add('b');
    d.clear();
    assert.equal(d.size, 0);
});

test('LRU eviction keeps the newest maxSize keys', () => {
    const d = createMessageDedupe({ maxSize: 3 });
    for (const id of ['a', 'b', 'c', 'd']) d.add(id);
    assert.equal(d.size, 3);
    assert.equal(d.has('a'), false); // oldest evicted
    assert.equal(d.has('d'), true);
});

test('ttlMs lets a stale id be processed again', () => {
    let clock = 1000;
    const d = createMessageDedupe({ ttlMs: 500, now: () => clock });
    assert.equal(d.seen('x'), false);
    clock = 1400;
    assert.equal(d.seen('x'), true);  // still within window
    clock = 1600;
    assert.equal(d.seen('x'), false); // window expired → reprocess
});

test('maxSize must be >= 1', () => {
    assert.throws(() => createMessageDedupe({ maxSize: 0 }), /maxSize must be >= 1/);
    assert.throws(() => createMessageDedupe({ maxSize: -3 }), /maxSize must be >= 1/);
});
