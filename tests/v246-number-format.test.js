// Tests for the v2.4.6 number-format helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactNumber, ordinal, groupDigits, formatIDR } from '../lib/Utils/number-format.js';

test('compactNumber: K/M/B/T with trimmed .0', () => {
    assert.equal(compactNumber(1_500), '1.5K');
    assert.equal(compactNumber(2_000), '2K');
    assert.equal(compactNumber(2_400_000), '2.4M');
    assert.equal(compactNumber(3_000_000_000), '3B');
    assert.equal(compactNumber(1_200_000_000_000), '1.2T');
});

test('compactNumber: below 1000 and negatives', () => {
    assert.equal(compactNumber(999), '999');
    assert.equal(compactNumber(0), '0');
    assert.equal(compactNumber(-1_500), '-1.5K');
});

test('compactNumber: non-finite → 0', () => {
    assert.equal(compactNumber(NaN), '0');
    assert.equal(compactNumber(Infinity), '0');
});

test('ordinal: standard suffixes', () => {
    assert.deepEqual([1, 2, 3, 4].map(ordinal), ['1st', '2nd', '3rd', '4th']);
});

test('ordinal: 11/12/13 are always th', () => {
    assert.deepEqual([11, 12, 13].map(ordinal), ['11th', '12th', '13th']);
    assert.deepEqual([111, 112, 113].map(ordinal), ['111th', '112th', '113th']);
});

test('ordinal: 21/22/23/101 keep the base suffix', () => {
    assert.deepEqual([21, 22, 23, 101].map(ordinal), ['21st', '22nd', '23rd', '101st']);
});

test('groupDigits: thousands separator, sign, fraction', () => {
    assert.equal(groupDigits(1234567), '1,234,567');
    assert.equal(groupDigits(-1000), '-1,000');
    assert.equal(groupDigits(999), '999');
    assert.equal(groupDigits(1234.56), '1,234.56');
});

test('groupDigits: custom separator', () => {
    assert.equal(groupDigits(1234567, { separator: '.' }), '1.234.567');
});

test('formatIDR: id-ID style with dot separators', () => {
    assert.equal(formatIDR(15000), 'Rp15.000');
    assert.equal(formatIDR(1_500_000), 'Rp1.500.000');
    assert.equal(formatIDR(-2500), '-Rp2.500');
    assert.equal(formatIDR(999), 'Rp999');
});

test('formatIDR: rounds by default, honors decimals', () => {
    assert.equal(formatIDR(15000.7), 'Rp15.001');
    assert.equal(formatIDR(15000.5, { decimals: 2 }), 'Rp15.000,50');
});
