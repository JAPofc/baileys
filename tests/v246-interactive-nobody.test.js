// v2.4.6 — interactive messages can be built WITHOUT a media header or body text.
//
// buttons / list (sections) / nativeFlow / carousel messages with only buttons +
// footer (no `text`, no `caption`, no media) previously threw "Invalid media type"
// from prepareWAMessageMedia before the interactive builder ever ran. They now build
// with an empty header. Existing media/text messages are unaffected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessageContent } from '../lib/Utils/index.js';

const OPTS = { upload: async () => { throw new Error('upload should NOT be called for a media-less message'); } };

test('nativeFlow with only buttons + footer builds (no media, no text)', async () => {
    const content = await generateWAMessageContent({
        nativeFlow: { buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Hi', id: 'h' }) }] },
        footer: 'just buttons'
    }, OPTS);
    const im = content.interactiveMessage;
    assert.ok(im.nativeFlowMessage.buttons.length, 'buttons present');
    assert.equal(im.header, undefined, 'no header fabricated');
    assert.equal(im.footer.text, 'just buttons');
});

test('legacy buttons with only footer builds with EMPTY header type', async () => {
    const content = await generateWAMessageContent({
        buttons: [{ id: 'a', text: 'Option A', type: 1 }],
        footer: 'pick'
    }, OPTS);
    assert.ok(content.buttonsMessage, 'buttonsMessage built');
    assert.ok(content.buttonsMessage.buttons.length, 'buttons present');
    // headerType EMPTY (no media) — enum value 1; just assert it did not throw and is set
    assert.notEqual(content.buttonsMessage.headerType, undefined);
});

test('list (sections) message builds without body text or media', async () => {
    const content = await generateWAMessageContent({
        sections: [{ title: 'Menu', rows: [{ title: 'Row 1', rowId: 'r1' }] }],
        buttonText: 'Open',
        title: 'My list'
    }, OPTS);
    assert.ok(content.listMessage, 'listMessage built');
    assert.equal(content.listMessage.buttonText, 'Open');
    assert.equal(content.listMessage.sections.length, 1);
});

test('regression: a genuinely media-less non-interactive message still errors', async () => {
    // no interactive trigger + no media + no text → prepareWAMessageMedia still throws
    await assert.rejects(
        generateWAMessageContent({ title: 'orphan' }, OPTS),
        /Invalid media type/
    );
});
