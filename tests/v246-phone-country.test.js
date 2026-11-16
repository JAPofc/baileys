// Tests for the v2.4.6 phone-country detection helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCountry, dialCodeOf, flagEmoji, countryFlagOf } from '../lib/Utils/phone-country.js';

test('detectCountry: Indonesia from a bare number', () => {
    assert.deepEqual(detectCountry('6281234567890'), { dialCode: '62', iso2: 'ID', name: 'Indonesia' });
});

test('detectCountry: strips + / server / device suffix', () => {
    assert.equal(detectCountry('+62 812-3456-7890').iso2, 'ID');
    assert.equal(detectCountry('14155550123@s.whatsapp.net').iso2, 'US');
    assert.equal(detectCountry('6281234567890:12@s.whatsapp.net').iso2, 'ID');
});

test('detectCountry: longest-prefix wins (multi-digit codes)', () => {
    assert.equal(detectCountry('6591234567').iso2, 'SG'); // 65, not 6
    assert.equal(detectCountry('971501234567').iso2, 'AE'); // 971
    assert.equal(detectCountry('8801712345678').iso2, 'BD'); // 880
});

test('detectCountry: single-digit code (US/1)', () => {
    assert.equal(detectCountry('14155550123').dialCode, '1');
});

test('detectCountry: unknown / empty → null', () => {
    assert.equal(detectCountry('999999'), null);
    assert.equal(detectCountry(''), null);
    assert.equal(detectCountry(null), null);
});

test('dialCodeOf', () => {
    assert.equal(dialCodeOf('62812'), '62');
    assert.equal(dialCodeOf('000'), null);
});

test('flagEmoji: valid 2-letter code', () => {
    assert.equal(flagEmoji('ID'), '🇮🇩');
    assert.equal(flagEmoji('us'), '🇺🇸'); // case-insensitive
});

test('flagEmoji: invalid input → empty string', () => {
    assert.equal(flagEmoji('X'), '');
    assert.equal(flagEmoji('USA'), '');
    assert.equal(flagEmoji(''), '');
});

test('countryFlagOf: phone → flag, unknown → empty', () => {
    assert.equal(countryFlagOf('6281234567890'), '🇮🇩');
    assert.equal(countryFlagOf('999999'), '');
});
