// Tests for the v2.4.6 parseDuration bug fix (garbage guard) + weeks support.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../lib/Utils/reminders.js';

test('parseDuration: single units', () => {
    assert.equal(parseDuration('90s'), 90_000);
    assert.equal(parseDuration('10m'), 600_000);
    assert.equal(parseDuration('2h'), 7_200_000);
    assert.equal(parseDuration('3d'), 259_200_000);
});

test('parseDuration: weeks are supported (new)', () => {
    assert.equal(parseDuration('1w'), 604_800_000);
    assert.equal(parseDuration('2w 3d'), 2 * 604_800_000 + 3 * 86_400_000);
});

test('parseDuration: compound forms', () => {
    assert.equal(parseDuration('1h30m'), 5_400_000);
    assert.equal(parseDuration('2d 4h'), 187_200_000);
    assert.equal(parseDuration('1d2h3m4s'), 93_784_000);
    assert.equal(parseDuration('0.5h'), 1_800_000);
});

test('parseDuration: ms is NOT a unit (m = minutes)', () => {
    assert.equal(parseDuration('10ms'), null);
});

test('parseDuration: rejects glued garbage (regression: dead guard let x10m through)', () => {
    assert.equal(parseDuration('x10m'), null);
    assert.equal(parseDuration('abc5mxyz'), null);
});

test('parseDuration: rejects trailing words / pure garbage', () => {
    assert.equal(parseDuration('10m tomorrow'), null);
    assert.equal(parseDuration('ngawur'), null);
    assert.equal(parseDuration(''), null);
    assert.equal(parseDuration(null), null);
});

test('parseDuration: commas and spacing between tokens are fine', () => {
    assert.equal(parseDuration('1h, 30m'), 5_400_000);
    assert.equal(parseDuration('  2h   15m '), 2 * 3_600_000 + 15 * 60_000);
});
