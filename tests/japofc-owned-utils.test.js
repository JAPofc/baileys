import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveButtonAddonKind, parseInteractiveReply } from '../lib/Utils/message-kind.js';
import { generateVCard, parseVCard, createContactCards, quickContact } from '../lib/Utils/vcard.js';
import { MessageScheduler } from '../lib/Utils/scheduling.js';
import { extractMessageText, searchMessages, searchMessagesRegex, createMessageSearch } from '../lib/Utils/message-search.js';
import { AutoReplyHandler } from '../lib/Utils/auto-reply.js';
import { TemplateManager, createTemplateManager, renderTemplate } from '../lib/Utils/templates.js';
import { DISAPPEARING_DURATIONS, createTypingIndicator, createPinnedMessagesManager, createReadReceiptController } from '../lib/Utils/chat-control.js';
import { processPastParticipants, hasPastParticipants } from '../lib/Utils/past-participants.js';
import { useCacheManagerAuthState } from '../lib/Utils/use-cache-manager-auth-state.js';
import { captureEventStream, readAndEmitEventStream } from '../lib/Utils/baileys-event-stream.js';
import EventEmitter from 'node:events';

describe('JAPofc-owned utility rewrites', () => {
    it('normalizes button/list/native-flow kinds and replies', () => {
        assert.equal(resolveButtonAddonKind({ listMessage: {} }), 'list');
        assert.equal(resolveButtonAddonKind({ buttonsMessage: {} }), 'interactive');
        assert.equal(resolveButtonAddonKind({ interactiveMessage: { nativeFlowMessage: { buttons: [{ name: 'payment_info' }] } } }), 'payment_info');
        assert.equal(resolveButtonAddonKind({ ephemeralMessage: { message: { interactiveMessage: { nativeFlowMessage: { buttons: [{ name: 'review_and_pay' }] } } } } }), 'order_details');

        assert.deepEqual(parseInteractiveReply({ buttonsResponseMessage: { selectedButtonId: 'a', selectedDisplayText: 'A' } }), {
            kind: 'buttons_response', id: 'a', displayText: 'A', params: null
        });
        assert.deepEqual(parseInteractiveReply({ interactiveResponseMessage: { body: { text: 'Pick' }, nativeFlowResponseMessage: { name: 'flow', paramsJson: '{"id":"row-1"}' } } }), {
            kind: 'native_flow_response', id: 'row-1', displayText: 'Pick', params: { id: 'row-1' }
        });
        assert.equal(parseInteractiveReply({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{bad' } } }).params, null);
    });

    it('generates and parses contact cards', () => {
        const contact = quickContact('JAP Ofic, Jr', '+62 812-0000', { organization: 'JAPofc', email: 'team@japofc.example' });
        contact.title = 'Lead\nMaintainer';
        contact.note = 'hello; world, ok';
        const vcard = generateVCard(contact);
        assert.match(vcard, /BEGIN:VCARD/);
        assert.match(vcard, /FN:JAP Ofic\\, Jr/);

        const parsed = parseVCard(vcard);
        assert.equal(parsed.fullName, 'JAP Ofic, Jr');
        assert.equal(parsed.organization, 'JAPofc');
        assert.equal(parsed.title, 'Lead\nMaintainer');
        assert.equal(parsed.phones?.[0]?.number, '+628120000');
        assert.equal(parsed.emails?.[0]?.email, 'team@japofc.example');

        const content = createContactCards([contact]);
        assert.equal(content.contacts.contacts.length, 1);
    });

    it('schedules one-shot and repeating messages without leaking timers', async () => {
        const sent = [];
        const scheduler = new MessageScheduler(async (jid, content) => {
            sent.push({ jid, content });
            return { key: { id: `m${sent.length}` } };
        }, { checkInterval: 1 });

        const one = scheduler.schedule('user@s.whatsapp.net', { text: 'hello' }, new Date(Date.now() + 10));
        one.scheduledTime = new Date(Date.now() - 1);
        await scheduler.processQueue();
        assert.equal(sent.length, 1);
        assert.equal(scheduler.get(one.id), undefined);

        const repeat = scheduler.schedule('user@s.whatsapp.net', { text: 'ping' }, new Date(Date.now() + 10), { repeatIntervalMs: 5, maxRepeats: 2 });
        repeat.scheduledTime = new Date(Date.now() - 1);
        await scheduler.processQueue();
        assert.equal(scheduler.get(repeat.id)?.status, 'pending');
        scheduler.get(repeat.id).scheduledTime = new Date(Date.now() - 1);
        await scheduler.processQueue();
        assert.equal(sent.length, 3);
        assert.equal(scheduler.get(repeat.id), undefined);
        scheduler.stop();
    });

    it('extracts and searches common message text shapes', () => {
        const messages = [
            { key: { id: '1', remoteJid: 'a@s.whatsapp.net', fromMe: false }, messageTimestamp: 10, message: { conversation: 'low match keyword' } },
            { key: { id: '2', remoteJid: 'a@s.whatsapp.net', fromMe: false }, messageTimestamp: 20, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'keyword exact' } } } } },
            { key: { id: '3', remoteJid: 'b@s.whatsapp.net', fromMe: true }, messageTimestamp: 30, message: { imageMessage: { caption: 'photo keyword' } } }
        ];

        assert.equal(extractMessageText(messages[1]), 'keyword exact');
        assert.equal(searchMessages(messages, 'keyword', { jid: 'a@s.whatsapp.net', limit: 1 })[0].message.key.id, '2');
        assert.equal(searchMessagesRegex(messages, /photo\s+keyword/g)[0].message.key.id, '3');

        const manager = createMessageSearch();
        manager.addMessages(messages);
        manager.addMessages(messages);
        assert.equal(manager.count, 3);
        assert.equal(manager.getByType('image')[0].key.id, '3');
        manager.removeMessages(['2']);
        assert.equal(manager.getById('2'), undefined);
    });

    it('processes auto replies with priority, cooldown, and JID guards', async () => {
        const sent = [];
        const auto = new AutoReplyHandler(async (jid, content, options) => sent.push({ jid, content, options }), undefined, { globalCooldown: 0 });
        auto.addRule({ id: 'blocked-newsletter', keywords: ['hello'], response: { text: 'no' } });
        auto.addRule({ id: 'main', exactMatch: 'hello', response: (message, match) => ({ text: `hi ${match[0]}` }), priority: 10, quoted: true });

        assert.equal(await auto.processMessage({ key: { remoteJid: '120@newsletter' }, message: { conversation: 'hello' } }), false);
        assert.equal(await auto.processMessage({ key: { remoteJid: 'user@s.whatsapp.net' }, message: { conversation: 'hello' } }), true);
        assert.equal(sent[0].content.text, 'hi hello');
        assert.ok(sent[0].options.quoted);
    });

    it('renders, validates, exports, and imports templates', () => {
        assert.equal(renderTemplate('Hi {{name:there}} from {{team}}', { team: 'JAPofc' }), 'Hi there from JAPofc');

        const manager = new TemplateManager();
        const template = manager.create({ id: 'welcome', name: 'Welcome', category: 'greeting', content: 'Hi {{name}} from {{team:JAPofc}}' });
        assert.deepEqual(manager.validate(template.id, {}), { valid: false, missing: ['name'] });
        assert.equal(manager.render(template.id, { name: 'Bot' }), 'Hi Bot from JAPofc');

        const imported = new TemplateManager();
        assert.equal(imported.import(manager.export()), 1);
        assert.equal(imported.get('welcome').variables.length, 2);
        assert.ok(createTemplateManager().get('welcome'));
    });

    it('controls typing, pins, disappearing constants, and read receipts', async () => {
        assert.equal(DISAPPEARING_DURATIONS.DAYS_7, 604800);

        const presence = [];
        const typing = createTypingIndicator(async (jid, state) => presence.push(`${jid}:${state}`));
        await typing.startTyping('a@s.whatsapp.net');
        await typing.stopAll();
        assert.deepEqual(presence, ['a@s.whatsapp.net:composing', 'a@s.whatsapp.net:paused']);

        const pins = createPinnedMessagesManager();
        pins.pin('chat@g.us', 'm1', 'admin@s.whatsapp.net', new Date(Date.now() - 1000));
        pins.pin('chat@g.us', 'm2');
        assert.equal(pins.isPinned('chat@g.us', 'm1'), true);
        assert.equal(pins.clearExpired(), 1);
        assert.equal(pins.totalPins, 1);
        assert.equal(pins.unpin('chat@g.us', 'm2'), true);

        const receipts = [];
        const receiptController = createReadReceiptController(async (...args) => receipts.push(args), { excludeJids: ['skip@s.whatsapp.net'] });
        await receiptController.markRead('skip@s.whatsapp.net', undefined, ['a']);
        await receiptController.forceMarkRead('skip@s.whatsapp.net', undefined, ['b']);
        assert.equal(receipts.length, 1);
    });

    it('processes past participants and cache-manager auth state', async () => {
        assert.equal(hasPastParticipants({ pastParticipants: [{}] }), true);
        const processed = processPastParticipants([{ groupJid: 'g@g.us', pastParticipants: [{ userJid: 'u@s.whatsapp.net', leaveTs: 7, leaveReason: 'LEFT' }] }]);
        assert.deepEqual(processed, [{ groupJid: 'g@g.us', participants: [{ jid: 'u@s.whatsapp.net', leaveTs: 7, leaveReason: 'left' }] }]);

        const map = new Map();
        const store = {
            async set(key, value) { map.set(key, value); },
            async get(key) { return map.get(key); },
            async del(key) { map.delete(key); },
            async keys(pattern) {
                const prefix = pattern.replace('*', '');
                return Array.from(map.keys()).filter((key) => key.startsWith(prefix));
            }
        };
        const auth = await useCacheManagerAuthState(store, 'session');
        await auth.state.keys.set({ session: { abc: { value: 1 } } });
        assert.deepEqual(await auth.state.keys.get('session', ['abc']), { abc: { value: 1 } });
        await auth.saveCreds();
        assert.ok(map.has('session:creds'));
        await auth.clearState();
        assert.equal(map.size, 0);
    });

    it('captures and replays event streams', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'japofc-events-'));
        try {
            const file = join(dir, 'events.ndjson');
            const ev = new EventEmitter();
            captureEventStream(ev, file);
            ev.emit('connection.update', { connection: 'open' });
            await new Promise((resolve) => setTimeout(resolve, 20));

            const replay = readAndEmitEventStream(file);
            const received = [];
            replay.ev.on('connection.update', (data) => received.push(data));
            await replay.task;
            assert.deepEqual(received, [{ connection: 'open' }]);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
