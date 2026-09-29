import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    createSessionHealthMonitor,
    canonicalizeJid,
    makeJidCanonicalizer,
    WAMessageStubType
} from '../lib/index.js';

const CIPHERTEXT = WAMessageStubType.CIPHERTEXT;

const cipherMsg = (remoteJid, participant) => ({
    key: { remoteJid, participant, fromMe: false, id: Math.random().toString(36) },
    messageStubType: CIPHERTEXT
});

// minimal ev emitter with the on/off/emit surface the monitor uses
const makeEv = () => {
    const map = new Map();
    return {
        on: (e, fn) => { (map.get(e) || map.set(e, new Set()).get(e)).add(fn); },
        off: (e, fn) => { map.get(e)?.delete(fn); },
        emit: (e, data) => { for (const fn of map.get(e) || []) fn(data); }
    };
};

describe('canonicalizeJid', () => {
    it('strips device suffix and normalizes to bare user', () => {
        assert.equal(canonicalizeJid('123:4@s.whatsapp.net'), '123@s.whatsapp.net');
        assert.equal(canonicalizeJid('123@s.whatsapp.net'), '123@s.whatsapp.net');
    });
    it('is safe on undefined / junk', () => {
        assert.equal(canonicalizeJid(undefined), undefined);
        assert.equal(canonicalizeJid(''), '');
    });
});

describe('makeJidCanonicalizer', () => {
    it('resolves a LID to its PN via the socket mapping', async () => {
        const sock = { getPNForLID: async (lid) => (lid === '99@lid' ? '123@s.whatsapp.net' : null) };
        const canon = makeJidCanonicalizer(sock, { prefer: 'pn' });
        assert.equal(await canon('99:2@lid'), '123@s.whatsapp.net');
    });
    it('falls back to syntactic canonical when no mapping', async () => {
        const canon = makeJidCanonicalizer({});
        assert.equal(await canon('123:5@s.whatsapp.net'), '123@s.whatsapp.net');
    });
});

describe('createSessionHealthMonitor', () => {
    it('flags a contact unhealthy after threshold failures', () => {
        const mon = createSessionHealthMonitor({ badMacThreshold: 3, windowMs: 10_000 });
        const events = [];
        mon.onUnhealthy(e => events.push(e));
        const jid = '123@s.whatsapp.net';
        mon.record(jid);
        mon.record(jid);
        assert.equal(mon.isHealthy(jid), true);
        mon.record(jid);
        assert.equal(mon.isHealthy(jid), false);
        assert.equal(events.length, 1);
        assert.equal(events[0].jid, jid);
        assert.equal(events[0].failures, 3);
    });

    it('detects failures via messages.upsert and keys by canonical jid', () => {
        const mon = createSessionHealthMonitor({ badMacThreshold: 2, windowMs: 10_000 });
        const ev = makeEv();
        mon.bind({ ev });
        // same contact, different device suffix -> must collapse to one key
        ev.emit('messages.upsert', { messages: [cipherMsg('55:1@s.whatsapp.net')] });
        ev.emit('messages.upsert', { messages: [cipherMsg('55:2@s.whatsapp.net')] });
        assert.equal(mon.isHealthy('55@s.whatsapp.net'), false);
        const stats = mon.getStats();
        assert.equal(stats.unhealthy, 1);
        mon.unbind();
    });

    it('ignores non-cipher and fromMe messages', () => {
        const mon = createSessionHealthMonitor({ badMacThreshold: 1, windowMs: 10_000 });
        const ev = makeEv();
        mon.bind({ ev });
        ev.emit('messages.upsert', { messages: [{ key: { remoteJid: 'x@s.whatsapp.net', fromMe: false }, message: {} }] });
        ev.emit('messages.upsert', { messages: [{ key: { remoteJid: 'y@s.whatsapp.net', fromMe: true }, messageStubType: CIPHERTEXT }] });
        assert.equal(mon.getStats().tracked, 0);
        mon.unbind();
    });

    it('recovers when failures age out of the window', () => {
        let t = 1000;
        const mon = createSessionHealthMonitor({ badMacThreshold: 2, windowMs: 5000, now: () => t });
        const recovered = [];
        mon.onRecover(e => recovered.push(e));
        mon.record('a@s.whatsapp.net');
        mon.record('a@s.whatsapp.net');
        assert.equal(mon.isHealthy('a@s.whatsapp.net'), false);
        t += 6000; // window passes
        mon.sweep();
        assert.equal(mon.isHealthy('a@s.whatsapp.net'), true);
        assert.equal(recovered.length, 1);
    });

    it('reset clears state; onError never lets a bad callback crash the loop', () => {
        const mon = createSessionHealthMonitor({ badMacThreshold: 1, windowMs: 10_000 });
        const errs = [];
        mon.onError(e => errs.push(e));
        mon.onUnhealthy(() => { throw new Error('boom'); });
        assert.doesNotThrow(() => mon.record('z@s.whatsapp.net'));
        assert.equal(errs.length, 1);
        mon.reset();
        assert.equal(mon.getStats().tracked, 0);
    });
});
