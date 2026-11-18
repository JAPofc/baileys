import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPhoneNumber, getLidForPhone } from '../lib/index.js';

const sockWith = (mapping) => ({ signalRepository: { lidMapping: mapping } });

describe('getPhoneNumber', () => {
    it('passes PN through without socket', async () => {
        assert.equal(await getPhoneNumber(null, '62812@s.whatsapp.net'), '62812');
    });
    it('resolves LID via mapping', async () => {
        const sock = sockWith({ getPNForLID: async () => '62812@s.whatsapp.net' });
        assert.equal(await getPhoneNumber(sock, '999@lid'), '62812');
    });
    it('returns null when unknown / mapping fails', async () => {
        const sock = sockWith({ getPNForLID: async () => null });
        assert.equal(await getPhoneNumber(sock, '999@lid'), null);
        const bad = sockWith({ getPNForLID: async () => { throw new Error('offline'); } });
        assert.equal(await getPhoneNumber(bad, '999@lid'), null);
    });
    it('returns null for groups/channels', async () => {
        assert.equal(await getPhoneNumber(null, '1@g.us'), null);
        assert.equal(await getPhoneNumber(null, '1@newsletter'), null);
    });
    it('throws on bad input / missing sock for LID', async () => {
        await assert.rejects(getPhoneNumber(null, 'notajid'), /JID/);
        await assert.rejects(getPhoneNumber(null, '999@lid'), /active socket/);
    });
});

describe('getLidForPhone', () => {
    it('resolves phone to LID', async () => {
        const sock = sockWith({ getLIDForPN: async () => '999@lid' });
        assert.equal(await getLidForPhone(sock, '62812'), '999@lid');
        assert.equal(await getLidForPhone(sock, '62812@s.whatsapp.net'), '999@lid');
    });
    it('returns null when unknown', async () => {
        const sock = sockWith({ getLIDForPN: async () => null });
        assert.equal(await getLidForPhone(sock, '62812'), null);
    });
    it('throws without socket / phone', async () => {
        await assert.rejects(getLidForPhone(null, '62812'), /active socket/);
        const sock = sockWith({ getLIDForPN: async () => null });
        await assert.rejects(getLidForPhone(sock, ''), /phone number/);
    });
});
