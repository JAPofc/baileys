import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessage } from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };
const FAKE_KEY = { remoteJid: JID, fromMe: false, id: 'ABC123' };

describe('music message (experimental)', () => {
    it('builds musicMessage with passthrough fields', async () => {
        const m = await generateWAMessage(JID, {
            music: { songUri: 'https://x/song', artworkUri: 'https://x/art', embeddedMusic: { songId: 's1', title: 'T', author: 'A' } }
        }, OPTS);
        assert.equal(m.message.musicMessage.songUri, 'https://x/song');
        assert.equal(m.message.musicMessage.embeddedMusic.title, 'T');
    });
    it('rejects empty music', async () => {
        await assert.rejects(generateWAMessage(JID, { music: {} }, OPTS), /songUri/);
    });
});

describe('payments', () => {
    it('requestPayment builds + converts amount→amount1000', async () => {
        const m = await generateWAMessage(JID, {
            requestPayment: { currency: 'IDR', amount: 50.5, note: 'kopi', requestFrom: '62812@s.whatsapp.net' }
        }, OPTS);
        const r = m.message.requestPaymentMessage;
        assert.equal(r.currencyCodeIso4217, 'IDR');
        assert.equal(r.amount1000, 50500);
        assert.equal(r.noteMessage.conversation, 'kopi');
    });
    it('requestPayment rejects bad currency/amount', async () => {
        await assert.rejects(generateWAMessage(JID, { requestPayment: { amount: 5 } }, OPTS), /currency/);
        await assert.rejects(generateWAMessage(JID, { requestPayment: { currency: 'IDR' } }, OPTS), /amount/);
    });
    it('sendPayment / cancel / decline carry keys', async () => {
        const s = await generateWAMessage(JID, { sendPayment: { requestKey: FAKE_KEY, note: 'lunas' } }, OPTS);
        assert.equal(s.message.sendPaymentMessage.requestMessageKey.id, 'ABC123');
        const c = await generateWAMessage(JID, { cancelPayment: { key: FAKE_KEY } }, OPTS);
        assert.equal(c.message.cancelPaymentRequestMessage.key.id, 'ABC123');
        const d = await generateWAMessage(JID, { declinePayment: FAKE_KEY }, OPTS);
        assert.equal(d.message.declinePaymentRequestMessage.key.id, 'ABC123');
        await assert.rejects(generateWAMessage(JID, { sendPayment: {} }, OPTS), /requestKey/);
    });
    it('invoice builds', async () => {
        const m = await generateWAMessage(JID, { invoice: { note: 'INV-1', token: 'tok' } }, OPTS);
        assert.equal(m.message.invoiceMessage.note, 'INV-1');
        await assert.rejects(generateWAMessage(JID, { invoice: {} }, OPTS), /note/);
    });
});

describe('poll upgrades (already-wired fields)', () => {
    it('endDate/hideVoter/canAddOption pass through', async () => {
        const m = await generateWAMessage(JID, {
            poll: { name: 'Q?', values: ['a', 'b'], endDate: new Date('2026-09-16T00:00:00Z'), hideVoter: true, canAddOption: true }
        }, OPTS);
        const p = m.message.pollCreationMessage;
        assert.equal(p.hideParticipantName, true);
        assert.equal(p.allowAddOption, true);
        assert.ok(Number(p.endTime) > 0);
    });
    it('pollAddOption builds', async () => {
        const m = await generateWAMessage(JID, { pollAddOption: { pollKey: FAKE_KEY, options: ['c', { optionName: 'd' }] } }, OPTS);
        const a = m.message.pollAddOptionMessage;
        assert.equal(a.pollCreationMessageKey.id, 'ABC123');
        assert.deepEqual(a.addOption.map((o) => o.optionName), ['c', 'd']);
        await assert.rejects(generateWAMessage(JID, { pollAddOption: { options: ['x'] } }, OPTS), /pollKey/);
    });
});

describe('invites / comment / statusQuote', () => {
    it('eventInvite builds', async () => {
        const m = await generateWAMessage(JID, {
            eventInvite: { eventTitle: 'Party', startTime: new Date('2026-09-20T19:00:00+07:00') }
        }, OPTS);
        assert.equal(m.message.eventInviteMessage.eventTitle, 'Party');
        assert.ok(Number(m.message.eventInviteMessage.startTime) > 0);
    });
    it('newsletterInvite builds', async () => {
        const m = await generateWAMessage(JID, {
            newsletterInvite: { newsletterJid: '120@newsletter', newsletterName: 'News', caption: 'join!' }
        }, OPTS);
        assert.equal(m.message.newsletterAdminInviteMessage.newsletterName, 'News');
        await assert.rejects(generateWAMessage(JID, { newsletterInvite: {} }, OPTS), /newsletterJid/);
    });
    it('comment + statusQuote build', async () => {
        const c = await generateWAMessage(JID, { comment: { text: 'nice', targetKey: FAKE_KEY } }, OPTS);
        assert.equal(c.message.commentMessage.message.conversation, 'nice');
        const s = await generateWAMessage(JID, { statusQuote: { text: 'wow', originalStatusId: 'ST1' } }, OPTS);
        assert.equal(s.message.statusQuotedMessage.originalStatusId, 'ST1');
    });
});

describe('raw escape hatch (any proto field)', () => {
    it('passes arbitrary Message fields through', async () => {
        const m = await generateWAMessage(JID, { raw: true, musicMessage: { songUri: 'https://x/s' } }, OPTS);
        assert.equal(m.message.musicMessage.songUri, 'https://x/s');
    });
});
