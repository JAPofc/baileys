import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessage, resolveSenderPn } from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };
const FAKE_KEY = { remoteJid: JID, fromMe: false, id: 'ABC123' };

describe('event reminders (WA 2026)', () => {
    it('sets hasReminder + reminderOffsetSec', async () => {
        const m = await generateWAMessage(JID, {
            event: { title: 'Rapat', description: 'd', startDate: new Date('2026-09-15T09:00:00+07:00'), reminder: true, reminderOffsetSec: 1800 }
        }, OPTS);
        const ev = m.message.eventMessage;
        assert.equal(ev.hasReminder, true);
        assert.equal(ev.reminderOffsetSec, 1800);
    });
    it('aliases hasReminder + defaults false', async () => {
        const m = await generateWAMessage(JID, {
            event: { title: 'R', description: 'd', startDate: new Date('2026-09-15T09:00:00+07:00'), hasReminder: true }
        }, OPTS);
        assert.equal(m.message.eventMessage.hasReminder, true);
        const m2 = await generateWAMessage(JID, {
            event: { title: 'R', description: 'd', startDate: new Date('2026-09-15T09:00:00+07:00') }
        }, OPTS);
        assert.equal(m2.message.eventMessage.hasReminder, false);
    });
});

describe('mention-all', () => {
    it('mentionAll flag → nonJidMentions=1', async () => {
        const m = await generateWAMessage(JID, { text: 'Halo semua', mentionAll: true }, OPTS);
        assert.equal(m.message.extendedTextMessage.contextInfo.nonJidMentions, 1);
    });
});

describe('poll edit (WA 2026 editable polls)', () => {
    it('wraps pollCreationMessage in protocolMessage EDITED', async () => {
        const m = await generateWAMessage(JID, {
            edit: FAKE_KEY,
            poll: { name: 'Q?', values: ['a', 'b'] }
        }, OPTS);
        const pm = m.message.protocolMessage;
        assert.ok(pm, 'has protocolMessage');
        assert.equal(pm.type, 14); // EDITED_MESSAGE
        assert.equal(pm.key.id, 'ABC123');
        const edited = pm.editedMessage.pollCreationMessage;
        assert.equal(edited.name, 'Q?');
        assert.deepEqual(edited.options.map((o) => o.optionName), ['a', 'b']);
    });
});

describe('resolveSenderPn', () => {
    const sockWith = (map) => ({
        signalRepository: { lidMapping: { getPNForLID: async (lid) => map[/\d+/.exec(lid)?.[0]] ?? null } }
    });
    it('participant LID → phone number', async () => {
        const sock = sockWith({ 555: '62812@s.whatsapp.net' });
        const pn = await resolveSenderPn(sock, { key: { remoteJid: '1@g.us', participant: '555@lid' } });
        assert.equal(pn, '62812');
    });
    it('falls back to remoteJid, rejects empty', async () => {
        const sock = sockWith({});
        const pn = await resolveSenderPn(sock, { key: { remoteJid: '62813@s.whatsapp.net' } });
        assert.equal(pn, '62813');
        await assert.rejects(resolveSenderPn(sock, { key: {} }), /key/);
    });
});

describe('view-once voice note (stubbed upload)', () => {
    it('audio+ptt+viewOnce composes', async () => {
        const stubUpload = async () => ({ mediaUrl: 'https://x/y', directPath: '/d' });
        const m = await generateWAMessage(JID, {
            audio: Buffer.alloc(64),
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            viewOnce: true
        }, { ...OPTS, upload: stubUpload });
        const inner = m.message.viewOnceMessage.message.audioMessage;
        assert.equal(inner.ptt, true);
        assert.ok(inner.mediaKey);
    });
});
