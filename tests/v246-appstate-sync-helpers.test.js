// Tests for the pure app-state / LT-hash sync helpers in chat-utils — core
// Baileys plumbing that was previously uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    newLTHashState, ensureLTHashStateVersion, isMissingKeyError,
    isAppStateSyncIrrecoverable, MAX_SYNC_ATTEMPTS
} from '../lib/Utils/chat-utils.js';

test('newLTHashState() is a fresh zeroed 128-byte state', () => {
    const s = newLTHashState();
    assert.equal(s.version, 0);
    assert.ok(Buffer.isBuffer(s.hash));
    assert.equal(s.hash.length, 128);
    assert.ok(s.hash.every((b) => b === 0));
    assert.deepEqual(s.indexValueMap, {});
    // fresh object each call
    assert.notEqual(newLTHashState().hash, s.hash);
});

test('ensureLTHashStateVersion coerces a bad version to 0, in place', () => {
    assert.equal(ensureLTHashStateVersion({ version: 5 }).version, 5);
    assert.equal(ensureLTHashStateVersion({ version: NaN }).version, 0);
    assert.equal(ensureLTHashStateVersion({ version: 'x' }).version, 0);
    assert.equal(ensureLTHashStateVersion({}).version, 0);
    const obj = { version: NaN };
    assert.equal(ensureLTHashStateVersion(obj), obj); // mutates & returns same ref
});

test('isMissingKeyError only matches error.data.isMissingKey === true', () => {
    assert.equal(isMissingKeyError({ data: { isMissingKey: true } }), true);
    assert.equal(isMissingKeyError({ data: { isMissingKey: false } }), false);
    assert.equal(isMissingKeyError({ data: {} }), false);
    assert.equal(isMissingKeyError(new Error('x')), false);
    assert.equal(isMissingKeyError(null), false);
    assert.equal(isMissingKeyError(undefined), false);
});

test('isAppStateSyncIrrecoverable: give up after MAX_SYNC_ATTEMPTS or on TypeError', () => {
    assert.equal(MAX_SYNC_ATTEMPTS, 2);
    assert.equal(isAppStateSyncIrrecoverable({}, MAX_SYNC_ATTEMPTS), true);
    assert.equal(isAppStateSyncIrrecoverable({}, MAX_SYNC_ATTEMPTS + 1), true);
    assert.equal(isAppStateSyncIrrecoverable({}, 1), false);
    assert.equal(isAppStateSyncIrrecoverable(new TypeError('wasm crash'), 0), true);
    assert.equal(isAppStateSyncIrrecoverable(new Error('other'), 0), false);
});
