import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessage } from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };
const FAKE_KEY = { remoteJid: JID, fromMe: false, id: 'ABC123' };

describe('scheduled-call primitive', () => {
    it('builds ScheduledCallCreationMessage (video=2)', async () => {
        const m = await generateWAMessage(JID, {
            scheduledCall: { title: 'Standup', scheduledAt: new Date('2026-09-15T09:00:00+07:00'), callType: 'video' }
        }, OPTS);
        assert.equal(m.message.scheduledCallCreationMessage.callType, 2);
        assert.equal(m.message.scheduledCallCreationMessage.title, 'Standup');
        assert.ok(Number(m.message.scheduledCallCreationMessage.scheduledTimestampMs) > 0);
    });
    it('defaults to voice (1) + accepts epoch-ms', async () => {
        const m = await generateWAMessage(JID, { scheduledCall: { title: 't', scheduledAt: 1789437600000 } }, OPTS);
        assert.equal(m.message.scheduledCallCreationMessage.callType, 1);
    });
    it('builds ScheduledCallEditMessage (CANCEL=1)', async () => {
        const m = await generateWAMessage(JID, { scheduledCallEdit: { key: FAKE_KEY } }, OPTS);
        assert.equal(m.message.scheduledCallEditMessage.editType, 1);
        assert.equal(m.message.scheduledCallEditMessage.key.id, 'ABC123');
    });
    it('rejects bad scheduledAt', async () => {
        await assert.rejects(generateWAMessage(JID, { scheduledCall: { title: 'x' } }, OPTS), /scheduledAt/);
    });
});

describe('pin / keep', () => {
    it('pin type=1 carries duration', async () => {
        const m = await generateWAMessage(JID, { pin: FAKE_KEY, type: 1, time: 3600 }, OPTS);
        assert.equal(m.message.pinInChatMessage.type, 1);
        assert.equal(m.message.messageContextInfo.messageAddOnDurationInSecs, 3600);
    });
    it('unpin type=2', async () => {
        const m = await generateWAMessage(JID, { pin: FAKE_KEY, type: 2 }, OPTS);
        assert.equal(m.message.pinInChatMessage.type, 2);
    });
    it('keep=1 / unkeep=2', async () => {
        const k = await generateWAMessage(JID, { keep: FAKE_KEY, type: 1 }, OPTS);
        assert.equal(k.message.keepInChatMessage.keepType, 1);
        const u = await generateWAMessage(JID, { keep: FAKE_KEY, type: 2 }, OPTS);
        assert.equal(u.message.keepInChatMessage.keepType, 2);
    });
});

describe('event', () => {
    it('builds eventMessage', async () => {
        const m = await generateWAMessage(JID, {
            event: { name: 'Rapat', startDate: new Date('2026-09-15T10:00:00+07:00'), location: { name: 'Kantor' } }
        }, OPTS);
        assert.equal(m.message.eventMessage.name, 'Rapat');
        assert.ok(m.message.eventMessage.startTime > 0);
    });
});

describe('poll / quiz content', () => {
    it('builds pollCreationMessage', async () => {
        const m = await generateWAMessage(JID, { poll: { name: 'Makan?', values: ['A', 'B'] } }, OPTS);
        assert.equal(m.message.pollCreationMessage.name, 'Makan?');
        assert.equal(m.message.pollCreationMessage.options.length, 2);
    });
    it('builds quiz with correctAnswer', async () => {
        const m = await generateWAMessage(JID, { poll: { name: 'Q', values: ['A', 'B'], correctAnswer: 'A', pollType: 1 } }, OPTS);
        const json = JSON.stringify(m.message);
        assert.ok(json.includes('correctAnswer'));
    });
    it('rejects quiz without correctAnswer', async () => {
        await assert.rejects(generateWAMessage(JID, { poll: { name: 'Q', values: ['A', 'B'], pollType: 1 } }, OPTS), /correctAnswer/);
    });
});

describe('wrappers: spoiler / viewOnce / V2', () => {
    it('spoiler wraps', async () => {
        const m = await generateWAMessage(JID, { text: 'hi', spoiler: true }, OPTS);
        assert.ok(m.message.spoilerMessage);
    });
    it('viewOnceV2 + V2Extension wrap', async () => {
        const a = await generateWAMessage(JID, { text: 'hi', viewOnceV2: true }, OPTS);
        assert.ok(a.message.viewOnceMessageV2);
        const b = await generateWAMessage(JID, { text: 'hi', viewOnceV2Extension: true }, OPTS);
        assert.ok(b.message.viewOnceMessageV2Extension);
    });
});
