// Tests for the v2.4.6 JID convenience helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isJidUser,
    serverOf,
    withDevice,
    isMe,
    toJidList,
    mentionText
} from '../lib/Utils/jid-extras.js';

test('isJidUser: true for user/lid, false for the rest', () => {
    assert.equal(isJidUser('628123@s.whatsapp.net'), true);
    assert.equal(isJidUser('628123@c.us'), true);
    assert.equal(isJidUser('123@lid'), true);
    assert.equal(isJidUser('123-456@g.us'), false);
    assert.equal(isJidUser('status@broadcast'), false);
    assert.equal(isJidUser('abc@newsletter'), false);
    assert.equal(isJidUser('nope'), false);
});

test('serverOf returns the server part or null', () => {
    assert.equal(serverOf('628123@s.whatsapp.net'), 's.whatsapp.net');
    assert.equal(serverOf('628123:5@s.whatsapp.net'), 's.whatsapp.net');
    assert.equal(serverOf('x@g.us'), 'g.us');
    assert.equal(serverOf('nope'), null);
    assert.equal(serverOf(''), null);
});

test('withDevice sets, replaces, and strips the device suffix', () => {
    assert.equal(withDevice('628123@s.whatsapp.net', 5), '628123:5@s.whatsapp.net');
    assert.equal(withDevice('628123:5@s.whatsapp.net', 9), '628123:9@s.whatsapp.net');
    assert.equal(withDevice('628123:5@s.whatsapp.net', 0), '628123@s.whatsapp.net');
    assert.equal(withDevice('628123:5@s.whatsapp.net', null), '628123@s.whatsapp.net');
    assert.equal(withDevice('nope', 1), 'nope');
});

test('isMe is device-agnostic', () => {
    assert.equal(isMe('628123:12@s.whatsapp.net', '628123@s.whatsapp.net'), true);
    assert.equal(isMe('628123@s.whatsapp.net', '628999@s.whatsapp.net'), false);
    assert.equal(isMe(undefined, '628123@s.whatsapp.net'), false);
});

test('toJidList normalizes strings, phones, arrays, and dedupes', () => {
    assert.deepEqual(toJidList('628111@s.whatsapp.net'), ['628111@s.whatsapp.net']);
    // comma-separated, mixed jid + phone (string input splits on whitespace too)
    assert.deepEqual(
        toJidList('628111@s.whatsapp.net,628222,628111@s.whatsapp.net'),
        ['628111@s.whatsapp.net', '628222@s.whatsapp.net']
    );
    // array elements are NOT split, so a spaced phone still converts
    assert.deepEqual(toJidList(['+62 822 1111']), ['628221111@s.whatsapp.net']);
    // array with numbers and jids
    assert.deepEqual(
        toJidList([628111, '123-456@g.us', '0']),
        ['628111@s.whatsapp.net', '123-456@g.us']
    );
    // unconvertible entries skipped, never throws
    assert.deepEqual(toJidList('not-a-phone-!!'), []);
    assert.deepEqual(toJidList(''), []);
});

test('mentionText builds an @<number> token or empty', () => {
    assert.equal(mentionText('628123@s.whatsapp.net'), '@628123');
    assert.equal(mentionText('628123:4@s.whatsapp.net'), '@628123');
    assert.equal(mentionText('status@broadcast'), '');
    assert.equal(mentionText(''), '');
});
