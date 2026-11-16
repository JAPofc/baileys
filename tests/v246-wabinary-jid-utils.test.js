// Core coverage for WABinary/jid-utils: encode/decode round-trips, domain-type
// detection, normalization, device transfer, and the JID predicate family.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    jidEncode, jidDecode, jidNormalizedUser, transferDevice, areJidsSameUser,
    isJidGroup, isLidUser, isPnUser, isJidNewsletter, isHostedPnUser, isHostedLidUser,
    isJidBroadcast, isJidStatusBroadcast, isJidBot, isJidMetaAI, getServerFromDomainType,
    WAJIDDomains
} from '../lib/WABinary/jid-utils.js';

test('jidEncode composes user/device/server, defaulting server to lid', () => {
    assert.equal(jidEncode('62812', 's.whatsapp.net'), '62812@s.whatsapp.net');
    assert.equal(jidEncode('62812', 's.whatsapp.net', 3), '62812:3@s.whatsapp.net');
    assert.equal(jidEncode('', undefined), '@lid'); // server falls back to lid
    assert.equal(jidEncode('5', 'g.us', undefined), '5@g.us'); // undefined device omitted
});

test('jidDecode extracts user/server/device and returns undefined for non-JIDs', () => {
    const d = jidDecode('62812:3@s.whatsapp.net');
    assert.equal(d.user, '62812');
    assert.equal(d.server, 's.whatsapp.net');
    assert.equal(d.device, 3);
    assert.equal(jidDecode('nojid'), undefined);
    assert.equal(jidDecode(123), undefined);
    assert.equal(jidDecode(null), undefined);
});

test('jidDecode maps the special servers to their domain types', () => {
    assert.equal(jidDecode('111@lid').domainType, WAJIDDomains.LID);
    assert.equal(jidDecode('111@hosted').domainType, WAJIDDomains.HOSTED);
    assert.equal(jidDecode('111@hosted.lid').domainType, WAJIDDomains.HOSTED_LID);
    assert.equal(jidDecode('111@s.whatsapp.net').domainType, WAJIDDomains.WHATSAPP);
});

test('jidNormalizedUser rewrites c.us to s.whatsapp.net and drops the device', () => {
    assert.equal(jidNormalizedUser('62812:2@c.us'), '62812@s.whatsapp.net');
    assert.equal(jidNormalizedUser('62812@lid'), '62812@lid');
    assert.equal(jidNormalizedUser('bad'), '');
});

test('transferDevice carries the source device onto the target user', () => {
    assert.equal(transferDevice('62812:5@s.whatsapp.net', '62999@s.whatsapp.net'), '62999:5@s.whatsapp.net');
    // device 0 (absent) is omitted from the encoded JID
    assert.equal(transferDevice('62812@s.whatsapp.net', '62999@s.whatsapp.net'), '62999@s.whatsapp.net');
});

test('areJidsSameUser compares the user part regardless of device', () => {
    assert.equal(areJidsSameUser('62812:1@s.whatsapp.net', '62812:2@s.whatsapp.net'), true);
    assert.equal(areJidsSameUser('62812@s.whatsapp.net', '62813@s.whatsapp.net'), false);
});

test('JID predicates classify by server suffix', () => {
    assert.ok(isJidGroup('1-2@g.us') && !isJidGroup('x@s.whatsapp.net'));
    assert.ok(isLidUser('1@lid') && !isLidUser('1@s.whatsapp.net'));
    assert.ok(isPnUser('1@s.whatsapp.net'));
    assert.ok(isJidNewsletter('1@newsletter'));
    assert.ok(isJidBroadcast('status@broadcast'));
    assert.ok(isJidStatusBroadcast('status@broadcast') && !isJidStatusBroadcast('1@broadcast'));
    assert.ok(isJidMetaAI('123@bot'));
});

test('hosted predicates do not cross-match hosted vs hosted.lid', () => {
    assert.ok(isHostedPnUser('1@hosted'));
    assert.equal(isHostedPnUser('1@hosted.lid'), false); // .lid does not end with @hosted
    assert.ok(isHostedLidUser('1@hosted.lid'));
});

test('isJidBot only matches the Meta bot number ranges on c.us', () => {
    assert.equal(isJidBot('13135550001@c.us'), true);
    assert.equal(isJidBot('13165550001@c.us'), true);
    assert.ok(!isJidBot('62812@c.us'));
    assert.ok(!isJidBot('13135550001@s.whatsapp.net'));
});

test('getServerFromDomainType resolves the server label, defaulting to the initial', () => {
    assert.equal(getServerFromDomainType('s.whatsapp.net', WAJIDDomains.LID), 'lid');
    assert.equal(getServerFromDomainType('s.whatsapp.net', WAJIDDomains.HOSTED), 'hosted');
    assert.equal(getServerFromDomainType('s.whatsapp.net', WAJIDDomains.HOSTED_LID), 'hosted.lid');
    assert.equal(getServerFromDomainType('s.whatsapp.net', WAJIDDomains.WHATSAPP), 's.whatsapp.net');
});
