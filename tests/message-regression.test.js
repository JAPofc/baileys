import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessage, proto } from '../lib/index.js';

// Protocol-drift regression suite for the message shapes that break most
// often when WA bumps its proto: every case generates the message, pushes it
// through a REAL protobuf encode→decode round-trip, and asserts the fields
// that official clients actually read. If a proto field is renumbered,
// renamed, or a wrapper changes, these fail loudly instead of silently
// producing messages that render as empty bubbles.

const JID = '628123456789@s.whatsapp.net';
const OPTS = { userJid: '627000000000@s.whatsapp.net' };
const FAKE_KEY = { remoteJid: JID, fromMe: true, id: 'TARGET123' };

// 1x1 transparent PNG for media headers (carousel cards need real media)
const PNG_1PX = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c626001000000ffff03000006000557bfabd4' +
    '0000000049454e44ae426082', 'hex');
const fakeUpload = async () => ({ mediaUrl: 'https://mmg.whatsapp.net/x', directPath: '/v/t62.7118-24/x' });
const MEDIA_OPTS = { ...OPTS, upload: fakeUpload };

/** encode → decode through the actual wire format */
const wire = (m) => proto.Message.decode(proto.Message.encode(m.message).finish());

describe('message regression: buttons', () => {
    it('buttonsMessage survives the wire with ids + display text', async () => {
        const m = await generateWAMessage(JID, {
            text: 'pilih salah satu', footer: 'bot',
            buttons: [
                { buttonId: 'opt-1', buttonText: { displayText: 'Satu' } },
                { buttonId: 'opt-2', buttonText: { displayText: 'Dua' } },
            ],
        }, OPTS);
        const w = wire(m);
        assert.equal(w.buttonsMessage.buttons.length, 2);
        assert.equal(w.buttonsMessage.buttons[0].buttonId, 'opt-1');
        assert.equal(w.buttonsMessage.buttons[0].buttonText.displayText, 'Satu');
        assert.equal(w.buttonsMessage.contentText, 'pilih salah satu');
        assert.equal(w.buttonsMessage.footerText, 'bot');
        // RESPONSE type enum — official clients ignore buttons without it
        assert.ok(w.buttonsMessage.headerType !== undefined);
    });
});

describe('message regression: flows (interactive/nativeFlow)', () => {
    it('nativeFlowMessage keeps button name + params JSON intact', async () => {
        const params = JSON.stringify({ display_text: 'Ya, lanjut', id: 'yes' });
        const m = await generateWAMessage(JID, {
            text: 'konfirmasi?',
            nativeFlow: { buttons: [{ name: 'quick_reply', buttonParamsJson: params }] },
        }, OPTS);
        const w = wire(m);
        const btn = w.interactiveMessage.nativeFlowMessage.buttons[0];
        assert.equal(btn.name, 'quick_reply');
        assert.deepEqual(JSON.parse(btn.buttonParamsJson), { display_text: 'Ya, lanjut', id: 'yes' });
        assert.equal(w.interactiveMessage.body.text, 'konfirmasi?');
    });
    it('single_select flow keeps sections through the wire', async () => {
        const params = JSON.stringify({
            title: 'Menu', sections: [{ title: 'Food', rows: [{ title: 'Rice', id: 'n1' }] }],
        });
        const m = await generateWAMessage(JID, {
            text: 'menu hari ini',
            nativeFlow: { buttons: [{ name: 'single_select', buttonParamsJson: params }] },
        }, OPTS);
        const w = wire(m);
        const parsed = JSON.parse(w.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        assert.equal(parsed.sections[0].rows[0].id, 'n1');
    });
});

describe('message regression: carousel', () => {
    it('cards with media headers + flow buttons survive the wire', async () => {
        const m = await generateWAMessage(JID, {
            text: 'katalog',
            cards: [
                {
                    image: PNG_1PX, caption: 'Produk A', title: 'A',
                    nativeFlow: { buttons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Beli A","id":"a"}' }] },
                },
                {
                    image: PNG_1PX, caption: 'Produk B', title: 'B',
                    nativeFlow: { buttons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Beli B","id":"b"}' }] },
                },
            ],
        }, MEDIA_OPTS);
        const w = wire(m);
        const cards = w.interactiveMessage.carouselMessage.cards;
        assert.equal(cards.length, 2);
        assert.ok(cards[0].header.imageMessage, 'card header carries the image');
        assert.equal(JSON.parse(cards[1].nativeFlowMessage.buttons[0].buttonParamsJson).id, 'b');
    });
    it('rejects a card without a valid media/product header', async () => {
        await assert.rejects(
            generateWAMessage(JID, { text: 'x', cards: [{ title: 'no-media' }] }, OPTS),
            /Invalid media type for carousel card/
        );
    });
});

describe('message regression: poll / quiz', () => {
    it('single-select poll → pollCreationMessageV3 with options intact', async () => {
        const m = await generateWAMessage(JID, {
            poll: { name: 'What to eat?', values: ['Rice', 'Noodles'], selectableCount: 1 },
        }, OPTS);
        const w = wire(m);
        assert.equal(w.pollCreationMessageV3.name, 'What to eat?');
        assert.deepEqual(w.pollCreationMessageV3.options.map((o) => o.optionName), ['Rice', 'Noodles']);
        assert.equal(w.pollCreationMessageV3.selectableOptionsCount, 1);
        // polls are E2E-keyed: messageContextInfo must carry a secret
        assert.ok(m.message.messageContextInfo?.messageSecret?.length >= 32);
    });
    it('multi-select poll uses pollCreationMessage (not V3)', async () => {
        const m = await generateWAMessage(JID, {
            poll: { name: 'multi', values: ['a', 'b', 'c'], selectableCount: 2 },
        }, OPTS);
        assert.ok(wire(m).pollCreationMessage, 'multi-select goes to base pollCreationMessage');
    });
    it('quiz (pollType 1) → V5 with correctAnswer, throws without one', async () => {
        const m = await generateWAMessage(JID, {
            poll: { name: 'Ibukota RI?', values: ['Jakarta', 'Bandung'], pollType: 1, correctAnswer: 'Jakarta' },
        }, OPTS);
        const w = wire(m);
        assert.equal(w.pollCreationMessageV5.pollType, 1);
        assert.equal(w.pollCreationMessageV5.correctAnswer.optionName, 'Jakarta');
        await assert.rejects(
            generateWAMessage(JID, { poll: { name: 'q', values: ['a'], pollType: 1 } }, OPTS),
            /correctAnswer/
        );
    });
});

describe('message regression: event', () => {
    it('eventMessage keeps name/time/location through the wire', async () => {
        const m = await generateWAMessage(JID, {
            event: {
                name: 'Kopdar', description: 'ngopi',
                startDate: new Date('2026-10-01T10:00:00+07:00'),
                location: { degreesLatitude: -6.2, degreesLongitude: 106.816, name: 'Monas' },
            },
        }, OPTS);
        const w = wire(m);
        assert.equal(w.eventMessage.name, 'Kopdar');
        assert.equal(Number(w.eventMessage.startTime), Math.floor(new Date('2026-10-01T10:00:00+07:00').getTime() / 1000));
        assert.ok(Math.abs(w.eventMessage.location.degreesLatitude - -6.2) < 1e-6);
        assert.equal(w.eventMessage.location.name, 'Monas');
    });
});

describe('message regression: location / contact', () => {
    it('locationMessage coordinates survive as doubles', async () => {
        const m = await generateWAMessage(JID, {
            location: { degreesLatitude: -6.175392, degreesLongitude: 106.827153, name: 'Monas', address: 'Gambir' },
        }, OPTS);
        const w = wire(m);
        assert.ok(Math.abs(w.locationMessage.degreesLatitude - -6.175392) < 1e-6);
        assert.ok(Math.abs(w.locationMessage.degreesLongitude - 106.827153) < 1e-6);
        assert.equal(w.locationMessage.name, 'Monas');
    });
    it('contactMessage vcard string is byte-identical after the wire', async () => {
        const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:John\nTEL;type=CELL:+628111\nEND:VCARD';
        const m = await generateWAMessage(JID, {
            contacts: { displayName: 'John', contacts: [{ vcard }] },
        }, OPTS);
        const w = wire(m);
        assert.equal(w.contactMessage.vcard, vcard);
        assert.equal(w.contactMessage.displayName, 'John');
    });
});

describe('message regression: reaction', () => {
    it('reactionMessage targets the right key + emoji', async () => {
        const m = await generateWAMessage(JID, { react: { text: '🔥', key: FAKE_KEY } }, OPTS);
        const w = wire(m);
        assert.equal(w.reactionMessage.text, '🔥');
        assert.equal(w.reactionMessage.key.id, 'TARGET123');
        assert.equal(w.reactionMessage.key.remoteJid, JID);
        assert.ok(Number(w.reactionMessage.senderTimestampMs) > 0);
    });
    it('empty text removes a reaction (still a valid message)', async () => {
        const m = await generateWAMessage(JID, { react: { text: '', key: FAKE_KEY } }, OPTS);
        assert.equal(wire(m).reactionMessage.text, '');
    });
});

describe('message regression: edit / delete', () => {
    it('edit → protocolMessage MESSAGE_EDIT with the edited content', async () => {
        const m = await generateWAMessage(JID, { text: 'teks baru', edit: FAKE_KEY }, OPTS);
        const w = wire(m);
        assert.equal(w.protocolMessage.type, proto.Message.ProtocolMessage.Type.MESSAGE_EDIT);
        assert.equal(w.protocolMessage.key.id, 'TARGET123');
        const edited = w.protocolMessage.editedMessage;
        assert.equal(edited.extendedTextMessage?.text ?? edited.conversation, 'teks baru');
    });
    it('delete → protocolMessage REVOKE for the target key', async () => {
        const m = await generateWAMessage(JID, { delete: FAKE_KEY }, OPTS);
        const w = wire(m);
        assert.equal(w.protocolMessage.type, proto.Message.ProtocolMessage.Type.REVOKE);
        assert.equal(w.protocolMessage.key.id, 'TARGET123');
    });
});

describe('message regression: quoted message', () => {
    it('contextInfo carries stanzaId, participant and quoted content', async () => {
        const quoted = await generateWAMessage(JID, { text: 'pesan asli' }, OPTS);
        const m = await generateWAMessage(JID, { text: 'balasan' }, { ...OPTS, quoted });
        const w = wire(m);
        const ctx = w.extendedTextMessage.contextInfo;
        assert.equal(ctx.stanzaId, quoted.key.id);
        assert.ok(ctx.participant, 'participant recorded');
        const qText = ctx.quotedMessage.extendedTextMessage?.text ?? ctx.quotedMessage.conversation;
        assert.equal(qText, 'pesan asli');
    });
    it('quoting works across content types (reply to a location)', async () => {
        const quoted = await generateWAMessage(JID, {
            location: { degreesLatitude: 1, degreesLongitude: 2 },
        }, OPTS);
        const m = await generateWAMessage(JID, { text: 'di sana?' }, { ...OPTS, quoted });
        const ctx = wire(m).extendedTextMessage.contextInfo;
        assert.ok(ctx.quotedMessage.locationMessage);
    });
});

describe('message regression: ephemeral / disappearing', () => {
    it('ephemeralExpiration lands in contextInfo.expiration', async () => {
        const m = await generateWAMessage(JID, { text: 'rahasia' }, { ...OPTS, ephemeralExpiration: 86400 });
        const w = wire(m);
        const holder = w.ephemeralMessage?.message ?? w;
        const inner = holder.extendedTextMessage ?? holder.conversation;
        const exp = holder.extendedTextMessage?.contextInfo?.expiration;
        assert.ok(inner, 'text content still present');
        assert.equal(exp, 86400, 'expiration seconds preserved');
    });
    it('disappearingMessagesInChat → protocolMessage EPHEMERAL_SETTING', async () => {
        const m = await generateWAMessage(JID, { disappearingMessagesInChat: 604800 }, OPTS);
        const w = wire(m);
        // toggling the chat setting is a protocol/ephemeral wrapper, not a text
        const pm = w.protocolMessage ?? w.ephemeralMessage?.message?.protocolMessage;
        assert.ok(pm, 'setting change is a protocolMessage');
        assert.equal(pm.type, proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING);
        assert.equal(pm.ephemeralExpiration, 604800);
        // and `false` turns it off (expiration 0)
        const off = await generateWAMessage(JID, { disappearingMessagesInChat: false }, OPTS);
        const pmOff = wire(off).protocolMessage ?? wire(off).ephemeralMessage?.message?.protocolMessage;
        assert.equal(pmOff.ephemeralExpiration ?? 0, 0);
    });
});
