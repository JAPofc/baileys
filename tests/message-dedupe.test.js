import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageDedupe } from '../lib/index.js';

describe('createMessageDedupe', () => {
    it('seen() returns false first time, true after (records on check)', () => {
        const d = createMessageDedupe();
        const key = { id: 'ABC', remoteJid: 'x@s.whatsapp.net', fromMe: false };
        assert.equal(d.seen(key), false);
        assert.equal(d.seen(key), true);
        assert.equal(d.size, 1);
    });

    it('distinguishes same id across chats and fromMe', () => {
        const d = createMessageDedupe();
        assert.equal(d.seen({ id: 'X', remoteJid: 'a@s.whatsapp.net', fromMe: false }), false);
        assert.equal(d.seen({ id: 'X', remoteJid: 'b@s.whatsapp.net', fromMe: false }), false); // different chat
        assert.equal(d.seen({ id: 'X', remoteJid: 'a@s.whatsapp.net', fromMe: true }), false);  // different fromMe
        assert.equal(d.size, 3);
    });

    it('accepts full message objects and bare string ids', () => {
        const d = createMessageDedupe();
        assert.equal(d.seen({ key: { id: 'M1', remoteJid: 'g@g.us' } }), false);
        assert.equal(d.seen({ key: { id: 'M1', remoteJid: 'g@g.us' } }), true);
        assert.equal(d.seen('raw-string-id'), false);
        assert.equal(d.seen('raw-string-id'), true);
    });

    it('blank/invalid keys are never seen and not stored', () => {
        const d = createMessageDedupe();
        assert.equal(d.seen(null), false);
        assert.equal(d.seen({}), false);
        assert.equal(d.seen({ key: {} }), false);
        assert.equal(d.size, 0);
    });

    it('has() checks without recording; add()/delete()/clear() work', () => {
        const d = createMessageDedupe();
        assert.equal(d.has('a'), false);
        d.add('a');
        assert.equal(d.has('a'), true);
        assert.equal(d.size, 1);
        assert.equal(d.delete('a'), true);
        assert.equal(d.has('a'), false);
        d.add('b'); d.add('c');
        d.clear();
        assert.equal(d.size, 0);
    });

    it('evicts oldest entries beyond maxSize (LRU bound)', () => {
        const d = createMessageDedupe({ maxSize: 3 });
        d.seen('1'); d.seen('2'); d.seen('3');
        d.seen('4'); // evicts '1'
        assert.equal(d.size, 3);
        assert.equal(d.has('1'), false);
        assert.equal(d.has('4'), true);
    });

    it('ttlMs lets an old key be processed again', () => {
        let t = 1000;
        const d = createMessageDedupe({ ttlMs: 5000, now: () => t });
        assert.equal(d.seen('k'), false);
        assert.equal(d.seen('k'), true);
        t += 6000; // expired
        assert.equal(d.seen('k'), false); // treated as new again
    });
});
