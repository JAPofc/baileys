// v2.4.6 — media-only nativeFlow interactive messages no longer crash.
//
// A nativeFlow message with a media header but NO caption (e.g. { nativeFlow, image })
// reached the builder's no-caption branch with the header still unbuilt and hit
// Object.assign(undefined, m), throwing. It now builds a proper media header instead.
// (The media+`text` combo is handled far earlier by the top-level text branch, which
// turns it into an extendedText body — so it never reaches here; not covered.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessageContent } from '../lib/Utils/index.js';

const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);
const MEDIA_OPTS = { upload: async () => ({ url: 'https://x/enc', directPath: '/enc', mediaKey: new Uint8Array(32), fileEncSha256: new Uint8Array(32), fileSha256: new Uint8Array(32), fileLength: 1 }) };
const flowButtons = { nativeFlow: { buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Hi', id: 'h' }) }] } };

test('media-only nativeFlow (image, no caption) builds a header instead of crashing', async () => {
    const content = await generateWAMessageContent({ ...flowButtons, image: PNG_1PX, title: 'Only media' }, MEDIA_OPTS);
    const im = content.interactiveMessage;
    assert.ok(im.header, 'header built');
    assert.ok(im.header.imageMessage, 'image header present');
    assert.equal(im.header.hasMediaAttachment, true);
});

test('media + caption path still builds the header (unchanged)', async () => {
    const content = await generateWAMessageContent({ ...flowButtons, image: PNG_1PX, title: 'T', subtitle: 'S', caption: 'Body via caption' }, MEDIA_OPTS);
    const im = content.interactiveMessage;
    assert.equal(im.body.text, 'Body via caption');
    assert.ok(im.header.imageMessage);
    assert.equal(im.header.title, 'T');
});

test('text-only nativeFlow attaches no media header (unchanged)', async () => {
    const content = await generateWAMessageContent({ ...flowButtons, text: 'Just text' }, MEDIA_OPTS);
    const im = content.interactiveMessage;
    assert.equal(im.body.text, 'Just text');
    assert.equal(im.header, undefined);
});
