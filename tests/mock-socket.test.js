import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSocket, createRouter } from '../lib/index.js';

describe('createMockSocket — offline bot test harness', () => {
    it('captures sendMessage output as a real proto message in the outbox', async () => {
        const mock = createMockSocket();
        const sent = await mock.sock.sendMessage('62811@s.whatsapp.net', { text: 'hello' });
        assert.equal(mock.outbox.length, 1);
        assert.equal(mock.outbox[0].jid, '62811@s.whatsapp.net');
        assert.equal(mock.outbox[0].content.text, 'hello');
        // real WAMessage shape from the real pipeline
        assert.ok(sent.key.id, 'must have a message id');
        assert.equal(sent.key.fromMe, true);
        assert.equal(sent.message.extendedTextMessage?.text ?? sent.message.conversation, 'hello');
    });
    it('drives a real createRouter bot end-to-end offline', async () => {
        const mock = createMockSocket();
        const router = createRouter({ prefix: '!' });
        router.command('ping', async (ctx) => ctx.reply('pong! 🏓'));
        router.command('echo', async (ctx) => ctx.reply(ctx.args.join(' ')));
        const detach = router.attach(mock.sock);
        await mock.receiveText('62811@s.whatsapp.net', '!ping');
        const reply = await mock.waitForReply();
        assert.equal(reply.content.text, 'pong! 🏓');
        mock.reset();
        await mock.receiveText('62811@s.whatsapp.net', '!echo halo dunia');
        const echo = await mock.waitForReply();
        assert.equal(echo.content.text, 'halo dunia');
        detach();
    });
    it('group messages carry participant and reach group-aware handlers', async () => {
        const mock = createMockSocket();
        let seen;
        mock.sock.ev.on('messages.upsert', ({ messages }) => { seen = messages[0]; });
        await mock.receiveText('62811@s.whatsapp.net', 'hi group', { groupJid: '123@g.us', pushName: 'Rina' });
        assert.equal(seen.key.remoteJid, '123@g.us');
        assert.equal(seen.key.participant, '62811@s.whatsapp.net');
        assert.equal(seen.pushName, 'Rina');
    });
    it('quoted injection produces extendedTextMessage with contextInfo', async () => {
        const mock = createMockSocket();
        const original = await mock.receiveText('62811@s.whatsapp.net', 'first message');
        const quoted = await mock.receiveText('62812@s.whatsapp.net', 'replying to you', { quoted: original });
        const ctx = quoted.message.extendedTextMessage.contextInfo;
        assert.equal(ctx.stanzaId, original.key.id);
        assert.deepEqual(ctx.quotedMessage, original.message);
    });
    it('waitForReply filter + timeout behave correctly', async () => {
        const mock = createMockSocket();
        await mock.sock.sendMessage('a@s.whatsapp.net', { text: 'not this' });
        const waiting = mock.waitForReply((e) => e.jid === 'b@s.whatsapp.net', 300);
        await mock.sock.sendMessage('b@s.whatsapp.net', { text: 'this one' });
        const hit = await waiting;
        assert.equal(hit.content.text, 'this one');
        await assert.rejects(mock.waitForReply((e) => e.jid === 'never@s.whatsapp.net', 100), /no matching outgoing message/);
    });
    it('records read receipts and presence updates', async () => {
        const mock = createMockSocket();
        await mock.sock.readMessages([{ remoteJid: 'x@s.whatsapp.net', id: 'ABC', fromMe: false }]);
        await mock.sock.sendPresenceUpdate('composing', 'x@s.whatsapp.net');
        await mock.sock.sendPresenceUpdate('paused', 'x@s.whatsapp.net');
        assert.equal(mock.readReceipts.length, 1);
        assert.equal(mock.readReceipts[0].id, 'ABC');
        assert.deepEqual(mock.presenceLog.map((p) => p.type), ['composing', 'paused']);
    });
    it('connection lifecycle: autoConnect, disconnect(error), reconnect', async () => {
        const events = [];
        const mock = createMockSocket({ autoConnect: false });
        mock.sock.ev.on('connection.update', (u) => events.push(u.connection));
        assert.equal(mock.connectionState, 'close');
        mock.connect();
        assert.equal(mock.connectionState, 'open');
        const boom = new Error('stream errored');
        mock.disconnect(boom);
        assert.equal(mock.connectionState, 'close');
        assert.deepEqual(events, ['open', 'close']);
        const closeEvent = mock.eventLog.filter((e) => e.event === 'connection.update').pop();
        assert.equal(closeEvent.data.lastDisconnect.error, boom);
    });
    it('own sends loop back as messages.upsert (like the live socket)', async () => {
        const mock = createMockSocket();
        const seen = [];
        mock.sock.ev.on('messages.upsert', ({ messages }) => seen.push(messages[0]));
        await mock.sock.sendMessage('x@s.whatsapp.net', { text: 'loopback' });
        assert.equal(seen.length, 1);
        assert.equal(seen[0].key.fromMe, true);
    });
    it('custom identity: me + pushName appear on outgoing messages', async () => {
        const mock = createMockSocket({ me: '628123@s.whatsapp.net', pushName: 'ElaBot' });
        assert.equal(mock.sock.user.id, '628123@s.whatsapp.net');
        const sent = await mock.sock.sendMessage('y@s.whatsapp.net', { text: 'hi' });
        assert.equal(sent.pushName, 'ElaBot');
    });
    it('media content builds offline through the stub uploader', async () => {
        const mock = createMockSocket();
        const sent = await mock.sock.sendMessage('z@s.whatsapp.net', {
            image: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
            caption: 'pic'
        });
        assert.ok(sent.message.imageMessage, 'imageMessage must be built');
        assert.equal(sent.message.imageMessage.caption, 'pic');
    });
    it('reset clears state and rejects pending waiters', async () => {
        const mock = createMockSocket();
        await mock.sock.sendMessage('x@s.whatsapp.net', { text: 'pre' });
        const pending = mock.waitForReply((e) => e.jid === 'nope@s.whatsapp.net', 5000);
        mock.reset();
        await assert.rejects(pending, /mock reset/);
        assert.equal(mock.outbox.length, 0);
        assert.equal(mock.eventLog.length, 0);
    });
    it('validates jid input on sendMessage', async () => {
        const mock = createMockSocket();
        await assert.rejects(mock.sock.sendMessage(null, { text: 'x' }), /jid must be a string/);
    });
});
