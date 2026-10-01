import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Session upgrades: anti-edit (original-content capture for edited messages),
// extractMessageText coverage for newer content types, sticker status.

const JID = '628x@s.whatsapp.net';

const makeEdit = (targetId, newContent, { chatJid = JID, envelopeId = 'ENV', participant } = {}) => ({
    key: { remoteJid: chatJid, id: envelopeId, participant },
    message: {
        protocolMessage: {
            type: 14, // proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            key: { remoteJid: chatJid, id: targetId },
            editedMessage: newContent
        }
    }
});

describe('anti-edit', () => {
    it('reports before/after and chains consecutive edits', async () => {
        const { MessageStore, createMessageStoreHandler, createAntiEditUpsertHandler } = await import('../lib/index.js');
        const store = new MessageStore();
        try {
            const seen = [];
            const storeHandler = createMessageStoreHandler(store);
            const editHandler = createAntiEditUpsertHandler(store, (i) => seen.push(i));

            storeHandler({ messages: [{ key: { remoteJid: JID, id: 'M1', fromMe: false }, message: { conversation: 'harga 100rb' } }] });

            const [r1] = editHandler({ messages: [makeEdit('M1', { conversation: 'harga 150rb' })] });
            assert.equal(r1.beforeText, 'harga 100rb');
            assert.equal(r1.afterText, 'harga 150rb');
            assert.equal(r1.editCount, 1);

            // second edit's "before" must be what the first edit produced
            const [r2] = editHandler({ messages: [makeEdit('M1', { message: { conversation: 'harga 200rb' } })] });
            assert.equal(r2.beforeText, 'harga 150rb');
            assert.equal(r2.afterText, 'harga 200rb');
            assert.equal(r2.editCount, 2);
            assert.deepEqual(r2.history.map((h) => h.conversation), ['harga 100rb', 'harga 150rb']);
            assert.equal(seen.length, 2, 'callback fired per edit');
        } finally {
            store.stopCleanup();
        }
    });

    it('edit of a never-seen message still reports (before = null)', async () => {
        const { MessageStore, createAntiEditUpsertHandler } = await import('../lib/index.js');
        const store = new MessageStore();
        try {
            const handler = createAntiEditUpsertHandler(store);
            const [r] = handler({ messages: [makeEdit('UNSEEN', { conversation: 'baru' })] });
            assert.equal(r.before, null);
            assert.equal(r.beforeText, '');
            assert.equal(r.afterText, 'baru');
        } finally {
            store.stopCleanup();
        }
    });

    it('ignores non-edit messages and junk input', async () => {
        const { MessageStore, createAntiEditUpsertHandler, isEditMessage } = await import('../lib/index.js');
        const store = new MessageStore();
        try {
            const handler = createAntiEditUpsertHandler(store);
            assert.equal(handler({ messages: [{ key: { remoteJid: JID, id: 'X' }, message: { conversation: 'plain' } }] }).length, 0);
            assert.equal(handler({ messages: [] }).length, 0);
            assert.equal(handler({}).length, 0);
            assert.equal(isEditMessage({ message: { protocolMessage: { type: 0 } } }), false);
            // REVOKE (delete) is NOT an edit
            assert.equal(isEditMessage({ message: { protocolMessage: { type: 0, key: { id: 'a' } } } }), false);
        } finally {
            store.stopCleanup();
        }
    });

    it('group edits attribute editedBy to the participant', async () => {
        const { MessageStore, createAntiEditUpsertHandler } = await import('../lib/index.js');
        const store = new MessageStore();
        try {
            const handler = createAntiEditUpsertHandler(store);
            const [r] = handler({
                messages: [makeEdit('G1', { conversation: 'edited' }, { chatJid: '123@g.us', participant: '628y@s.whatsapp.net' })]
            });
            assert.equal(r.editedBy, '628y@s.whatsapp.net');
        } finally {
            store.stopCleanup();
        }
    });
});

describe('extractMessageText — newer content types', () => {
    const cases = [
        [{ pollCreationMessageV2: { name: 'p2' } }, 'p2'],
        [{ pollCreationMessageV3: { name: 'p3' } }, 'p3'],
        [{ pollCreationMessageV6: { name: 'p6' } }, 'p6'],
        [{ eventMessage: { name: 'Meetup', description: 'Sabtu' } }, 'Meetup\nSabtu'],
        [{ eventMessage: { name: 'Solo' } }, 'Solo'],
        [{ groupInviteMessage: { groupName: 'Grup', caption: 'Join!' } }, 'Join!'],
        [{ groupInviteMessage: { groupName: 'Grup' } }, 'Grup'],
        [{ liveLocationMessage: { caption: 'OTW' } }, 'OTW'],
        [{ productMessage: { product: { title: 'Kopi', description: 'Arabica' } } }, 'Kopi\nArabica'],
        [{ orderMessage: { message: 'Pesanan #1' } }, 'Pesanan #1'],
        [{ buttonsMessage: { contentText: 'Pilih:' } }, 'Pilih:'],
        [{ listMessage: { title: 'Menu', description: 'Daftar' } }, 'Daftar'],
        [{ templateMessage: { hydratedTemplate: { hydratedContentText: 'Promo!' } } }, 'Promo!'],
        [{ interactiveMessage: { body: { text: 'Body ix' } } }, 'Body ix'],
        [{ contactsArrayMessage: { displayName: '3 kontak' } }, '3 kontak']
    ];

    it('extracts text from every newly covered type', async () => {
        const { extractMessageText } = await import('../lib/index.js');
        for (const [message, expected] of cases) {
            assert.equal(extractMessageText({ message }), expected, JSON.stringify(message).slice(0, 60));
        }
    });

    it('payment notes resolve recursively; wrappers still unwrap; old types unchanged', async () => {
        const { extractMessageText } = await import('../lib/index.js');
        assert.equal(extractMessageText({ message: { requestPaymentMessage: { noteMessage: { extendedTextMessage: { text: 'bayar dong' } } } } }), 'bayar dong');
        assert.equal(extractMessageText({ message: { ephemeralMessage: { message: { eventMessage: { name: 'X' } } } } }), 'X');
        assert.equal(extractMessageText({ message: { conversation: 'halo' } }), 'halo');
        assert.equal(extractMessageText({ message: { imageMessage: { caption: 'cap' } } }), 'cap');
        assert.equal(extractMessageText({ message: {} }), '');
    });
});

describe('sticker status', () => {
    it('createStickerStatus + StatusHelper.sticker build the right content', async () => {
        const { createStickerStatus, StatusHelper } = await import('../lib/index.js');
        assert.deepEqual(createStickerStatus('./s.webp'), { sticker: { url: './s.webp' }, isAnimated: false });
        const buf = Buffer.from('x');
        assert.deepEqual(createStickerStatus(buf, { isAnimated: true }), { sticker: buf, isAnimated: true });
        assert.deepEqual(StatusHelper.sticker('./a.webp', true), { sticker: { url: './a.webp' }, isAnimated: true });
    });
});

describe('exports', () => {
    it('anti-edit surface is on the barrel with types', async () => {
        const m = await import('../lib/index.js');
        for (const fn of ['isEditMessage', 'getEditedMessageKey', 'getEditedContent', 'createAntiEditUpsertHandler', 'createStickerStatus']) {
            assert.equal(typeof m[fn], 'function', fn);
        }
        const { readFile } = await import('node:fs/promises');
        const dts = await readFile(new URL('../lib/Utils/anti-edit.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /export function createAntiEditUpsertHandler\(store: MessageStore/);
    });
});
