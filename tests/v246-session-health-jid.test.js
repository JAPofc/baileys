// Tests for the pure canonicalizeJid() helper (session-health) — was uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeJid } from '../lib/Utils/session-health.js';

test('drops the device suffix to a stable per-contact identity', () => {
    assert.equal(canonicalizeJid('123:4@s.whatsapp.net'), '123@s.whatsapp.net');
    assert.equal(canonicalizeJid('123:15@s.whatsapp.net'), '123@s.whatsapp.net');
});

test('a plain user JID is returned unchanged', () => {
    assert.equal(canonicalizeJid('123@s.whatsapp.net'), '123@s.whatsapp.net');
});

test('non-string / nullish inputs pass through untouched (never throws)', () => {
    assert.equal(canonicalizeJid(null), null);
    assert.equal(canonicalizeJid(undefined), undefined);
    assert.equal(canonicalizeJid(12345), 12345);
});

test('an undecodable string is returned unchanged', () => {
    assert.equal(canonicalizeJid('garbage'), 'garbage');
    assert.equal(canonicalizeJid(''), '');
});
