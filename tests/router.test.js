import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRouter, extractCommandText } from '../lib/index.js';

const msg = (text, extra = {}) => ({
    key: { remoteJid: '1@g.us', participant: '2@s.whatsapp.net', fromMe: false, id: 'm1', ...extra.key },
    pushName: 'Tester',
    message: { conversation: text },
    ...extra
});
const fakeSock = (sent) => ({ sendMessage: async (j, c, o) => { sent.push([j, c, o]); return { ok: 1 }; }, ev: new EventEmitter() });

describe('extractCommandText', () => {
    it('reads conversation / extended / captions', () => {
        assert.equal(extractCommandText(msg('hi')), 'hi');
        assert.equal(extractCommandText({ message: { extendedTextMessage: { text: 'yo' } } }), 'yo');
        assert.equal(extractCommandText({ message: { imageMessage: { caption: 'cap' } } }), 'cap');
        assert.equal(extractCommandText({}), '');
    });
});

describe('createRouter', () => {
    it('parses command + args + reply quotes', async () => {
        const sent = [];
        const r = createRouter({ prefix: '!', help: false });
        r.command('add', async (ctx) => {
            assert.deepEqual(ctx.args, ['1', '2']);
            await ctx.reply(`sum=${ctx.args.join('+')}`);
        });
        assert.equal(await r.handle(fakeSock(sent), msg('!add 1 2')), true);
        assert.ok(sent[0][1].text.includes('sum='));
        assert.ok(sent[0][2].quoted, 'reply quotes original');
    });
    it('ignores non-commands, unknown, fromMe', async () => {
        const r = createRouter({ help: false });
        r.command('ping', async () => { throw new Error('must not run'); });
        const sock = fakeSock([]);
        assert.equal(await r.handle(sock, msg('hello')), false);
        assert.equal(await r.handle(sock, msg('!nope')), false);
        assert.equal(await r.handle(sock, msg('!ping', { key: { fromMe: true } })), false);
    });
    it('supports aliases + arrays of prefixes', async () => {
        let ran = '';
        const r = createRouter({ prefix: ['!', '.'], help: false });
        r.command(['hi', 'hello'], async (ctx) => { ran = ctx.command; });
        const sock = fakeSock([]);
        assert.equal(await r.handle(sock, msg('.HELLO x')), true);
        assert.equal(ran, 'hello');
    });
    it('runs middleware in order', async () => {
        const order = [];
        const r = createRouter({ help: false });
        r.use(async (ctx, next) => { order.push(1); await next(); order.push(4); });
        r.use(async (ctx, next) => { order.push(2); await next(); });
        r.command('go', async () => { order.push(3); });
        await r.handle(fakeSock([]), msg('!go'));
        assert.deepEqual(order, [1, 2, 3, 4]);
    });
    it('routes handler errors to onError', async () => {
        let caught = null;
        const r = createRouter({ help: false, onError: (e) => { caught = e; } });
        r.command('boom', async () => { throw new Error('kaboom'); });
        assert.equal(await r.handle(fakeSock([]), msg('!boom')), true);
        assert.equal(caught?.message, 'kaboom');
    });
    it('auto-help lists commands', async () => {
        const sent = [];
        const sock = fakeSock(sent);
        const r = createRouter({ prefix: '!' });
        r.command('ping', async () => { }, { desc: 'Check' });
        await r.handle(sock, msg('!menu'));
        assert.ok(sent[0][1].text.includes('!ping'));
        assert.equal(r.list().length, 2); // ping + help
    });
    it('attach/detach wires messages.upsert', async () => {
        const sent = [];
        const sock = fakeSock(sent);
        const r = createRouter({ help: false });
        r.command('ping', async (ctx) => ctx.reply('pong'));
        const detach = r.attach(sock);
        sock.ev.emit('messages.upsert', { messages: [msg('!ping')] });
        await new Promise((r2) => setTimeout(r2, 20));
        assert.equal(sent.length, 1);
        detach();
        sock.ev.emit('messages.upsert', { messages: [msg('!ping')] });
        await new Promise((r2) => setTimeout(r2, 20));
        assert.equal(sent.length, 1);
    });
});
