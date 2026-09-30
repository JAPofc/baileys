// v2.4.6 — text-only / button-only carousel cards.
//
// WhatsApp renders carousel cards that carry only text/buttons, but our builder
// rejected any card whose media header didn't resolve ("Invalid media type for
// carousel card"), making text-only cards impossible. We now allow text/button-only
// cards while keeping the strict media error for cards that clearly intended media,
// and we fixed a latent Object.assign(undefined,…) crash on media-without-caption
// / button-only cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessCarouselCard, generateWAMessageContent } from '../lib/Utils/index.js';

// ── pure helper ──────────────────────────────────────────────────────────────

test('text-only card is valid (no media header needed)', () => {
    assert.deepEqual(assessCarouselCard({ text: 'hello' }, false), { ok: true, reason: null });
    assert.deepEqual(assessCarouselCard({ caption: 'hi' }, false), { ok: true, reason: null });
});

test('button-only card is valid', () => {
    assert.deepEqual(assessCarouselCard({ nativeFlow: [{ name: 'quick_reply' }] }, false), { ok: true, reason: null });
});

test('a card that intended media but failed to resolve still errors', () => {
    assert.deepEqual(assessCarouselCard({ image: { url: 'x' }, text: 'hi' }, false), { ok: false, reason: 'invalid-media' });
    assert.deepEqual(assessCarouselCard({ video: { url: 'x' } }, false), { ok: false, reason: 'invalid-media' });
});

test('a valid media header always passes', () => {
    assert.deepEqual(assessCarouselCard({ image: { url: 'x' } }, true), { ok: true, reason: null });
    assert.deepEqual(assessCarouselCard({ text: 'hi', image: { url: 'x' } }, true), { ok: true, reason: null });
});

test('a truly empty card is rejected', () => {
    assert.deepEqual(assessCarouselCard({}, false), { ok: false, reason: 'empty-card' });
    assert.deepEqual(assessCarouselCard(undefined, false), { ok: false, reason: 'empty-card' });
});

// ── end-to-end through the real builder ──────────────────────────────────────

test('generateWAMessageContent builds a text-only carousel without throwing', async () => {
    const content = await generateWAMessageContent({
        text: 'Pick one',
        footer: 'menu',
        cards: [
            { text: 'Card A', nativeFlow: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'A', id: 'a' }) }] },
            { caption: 'Card B' }
        ]
    }, { upload: async () => ({}) });

    const cards = content.interactiveMessage.carouselMessage.cards;
    assert.equal(cards.length, 2);
    assert.equal(cards[0].body.text, 'Card A');
    assert.equal(cards[1].body.text, 'Card B');
    // no media header should have been fabricated for the text-only card
    assert.equal(cards[0].header, undefined);
});

test('generateWAMessageContent still rejects a card that intended media but failed', async () => {
    await assert.rejects(
        generateWAMessageContent({
            text: 'x',
            cards: [{ image: { url: 'not-a-real-image://nope' }, caption: 'boom' }]
        }, { upload: async () => { throw new Error('upload failed'); } }),
        /Invalid media type for carousel card/
    );
});
