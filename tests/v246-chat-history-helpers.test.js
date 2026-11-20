// Tests for getLastMessageInChat / getOldestMessageInChat (chat-history-helpers).
// These read from a store bucket that may be a plain array, a KeyedDB-style
// { array }, or a Map — previously uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLastMessageInChat, getOldestMessageInChat } from '../lib/Utils/chat-history-helpers.js';

test('plain array bucket: first/last', () => {
    const store = { messages: { 'a@s': [{ id: 1 }, { id: 2 }, { id: 3 }] } };
    assert.equal(getLastMessageInChat(store, 'a@s').id, 3);
    assert.equal(getOldestMessageInChat(store, 'a@s').id, 1);
});

test('KeyedDB-style { array } bucket', () => {
    const store = { messages: { 'a@s': { array: [{ id: 10 }, { id: 20 }] } } };
    assert.equal(getLastMessageInChat(store, 'a@s').id, 20);
    assert.equal(getOldestMessageInChat(store, 'a@s').id, 10);
});

test('Map bucket (insertion order)', () => {
    const m = new Map([['x', { id: 100 }], ['y', { id: 200 }]]);
    const store = { messages: { 'a@s': m } };
    assert.equal(getLastMessageInChat(store, 'a@s').id, 200);
    assert.equal(getOldestMessageInChat(store, 'a@s').id, 100);
});

test('missing store / bucket / empty → undefined (never throws)', () => {
    assert.equal(getLastMessageInChat(null, 'a@s'), undefined);
    assert.equal(getLastMessageInChat({}, 'a@s'), undefined);
    assert.equal(getLastMessageInChat({ messages: {} }, 'a@s'), undefined);
    assert.equal(getLastMessageInChat({ messages: { 'a@s': [] } }, 'a@s'), undefined);
    assert.equal(getOldestMessageInChat({ messages: { 'a@s': [] } }, 'a@s'), undefined);
});

test('unknown bucket shape → undefined', () => {
    assert.equal(getLastMessageInChat({ messages: { 'a@s': {} } }, 'a@s'), undefined);
    assert.equal(getLastMessageInChat({ messages: { 'a@s': 42 } }, 'a@s'), undefined);
});
