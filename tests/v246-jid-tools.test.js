// Tests for jid-tools (getPhoneNumber / getLidForPhone / resolveSenderPn).
// The socket-dependent LID branches are exercised with a tiny mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPhoneNumber, getLidForPhone, resolveSenderPn } from '../lib/Utils/jid-tools.js';

const mockSock = (over = {}) => ({
    signalRepository: {
        lidMapping: {
            getPNForLID: async () => '62999@s.whatsapp.net',
            getLIDForPN: async () => '555@lid',
            ...over
        }
    }
});

test('a PN JID returns its user part directly (no socket needed)', async () => {
    assert.equal(await getPhoneNumber({}, '62812@s.whatsapp.net'), '62812');
});

test('groups / channels / status return null', async () => {
    assert.equal(await getPhoneNumber({}, '123-456@g.us'), null);
    assert.equal(await getPhoneNumber({}, '0@s.whatsapp.net'), '0');
});

test('invalid JID input throws a 400 Boom', async () => {
    await assert.rejects(() => getPhoneNumber({}, 'notajid'), (e) => e?.output?.statusCode === 400);
    await assert.rejects(() => getPhoneNumber({}, 123), (e) => e?.output?.statusCode === 400);
});

test('a LID resolves through the socket mapping', async () => {
    assert.equal(await getPhoneNumber(mockSock(), '111@lid'), '62999');
});

test('LID resolution needs a socket; missing mapping throws', async () => {
    await assert.rejects(() => getPhoneNumber({}, '111@lid'), (e) => e?.output?.statusCode === 400);
});

test('LID mapping miss returns null (best-effort, never throws)', async () => {
    const sock = mockSock({ getPNForLID: async () => null });
    assert.equal(await getPhoneNumber(sock, '111@lid'), null);
    const sock2 = mockSock({ getPNForLID: async () => { throw new Error('offline'); } });
    assert.equal(await getPhoneNumber(sock2, '111@lid'), null);
});

test('getLidForPhone accepts a bare number or a PN JID', async () => {
    assert.equal(await getLidForPhone(mockSock(), '62999'), '555@lid');
    assert.equal(await getLidForPhone(mockSock(), '62999@s.whatsapp.net'), '555@lid');
});

test('getLidForPhone throws without a socket, and returns null on miss', async () => {
    await assert.rejects(() => getLidForPhone({}, '62999'), (e) => e?.output?.statusCode === 400);
    const sock = mockSock({ getLIDForPN: async () => null });
    assert.equal(await getLidForPhone(sock, '62999'), null);
});

test('resolveSenderPn pulls sender from a message key', async () => {
    assert.equal(await resolveSenderPn({}, { key: { participant: '62812@s.whatsapp.net' } }), '62812');
    assert.equal(await resolveSenderPn({}, { key: { remoteJid: '62813@s.whatsapp.net' } }), '62813');
    await assert.rejects(() => resolveSenderPn({}, { key: {} }), (e) => e?.output?.statusCode === 400);
});
