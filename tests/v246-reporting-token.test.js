// Tests for shouldIncludeReportingToken (reporting-utils) — core message
// plumbing that decides whether a reporting token is attached. Was uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldIncludeReportingToken } from '../lib/Utils/reporting-utils.js';

test('normal content messages get a reporting token', () => {
    assert.equal(shouldIncludeReportingToken({ conversation: 'hi' }), true);
    assert.equal(shouldIncludeReportingToken({ imageMessage: {} }), true);
    assert.equal(shouldIncludeReportingToken({ extendedTextMessage: { text: 'x' } }), true);
    assert.equal(shouldIncludeReportingToken({}), true);
});

test('reactions, enc reactions, event responses and poll updates are excluded', () => {
    assert.equal(shouldIncludeReportingToken({ reactionMessage: {} }), false);
    assert.equal(shouldIncludeReportingToken({ encReactionMessage: {} }), false);
    assert.equal(shouldIncludeReportingToken({ encEventResponseMessage: {} }), false);
    assert.equal(shouldIncludeReportingToken({ pollUpdateMessage: {} }), false);
});
