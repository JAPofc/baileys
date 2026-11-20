/**
 * tests/v2410-content-extras-inbound.test.js — batch BX (v2.4.10)
 *
 * Covers BUGREPORT §2.141: the read* helpers in content-extras.js ran `new URL(...)`
 * on fields that arrive from the network, so a peer could crash a bot by sending a
 * music card or an ad-reply whose URL is not parseable. Also covers the clamp in
 * normalizeStickers(), which let NaN through because Math.max(0, NaN) is NaN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	readMusicMessage,
	readSocialPreview,
	normalizeStickers,
	buildMusicMessage
} from '../lib/Utils/content-extras.js';

test('§2.141 readMusicMessage survives a songUri the sender made up', () => {
	for (const songUri of ['bukan-url', '::broken::', 'javascript:alert(1)', '//x', 'http://']) {
		const read = readMusicMessage({ message: { music: { title: 't', songUri } } });
		assert.ok(read, `must still return a card for ${JSON.stringify(songUri)}`);
		assert.equal(read.title, 't');
		// the raw value is handed back untouched; only the derived host is dropped
		assert.equal(read.songUri, songUri, 'the raw value is handed back untouched');
		assert.equal(read.host, null, 'an unparseable uri has no host');
	}
});

test('§2.141 a well-formed songUri still yields its host', () => {
	const read = readMusicMessage({ message: { music: { title: 't', songUri: 'https://open.spotify.com/track/1' } } });
	assert.equal(read.host, 'open.spotify.com');
});

test('§2.141 readSocialPreview survives a broken sourceUrl', () => {
	const read = readSocialPreview({
		message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceUrl: '::broken::', title: 'x' } } } }
	});
	assert.ok(read);
	assert.equal(read.title, 'x');
	assert.equal(read.platform, null);
});

test('§2.141 readSocialPreview still strips www. from a good sourceUrl', () => {
	const read = readSocialPreview({
		message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceUrl: 'https://www.instagram.com/p/1' } } } }
	});
	assert.equal(read.platform, 'instagram.com');
});

test('§2.141 a non-numeric sticker position is clamped, not passed through as NaN', () => {
	const [sticker] = normalizeStickers([
		{ type: 'link', url: 'https://example.com', position: { x: 'left', y: 5, scale: 'big', rotation: null } }
	]);
	assert.equal(sticker.position.x, 0.5, 'unparseable x falls back to the centre');
	assert.equal(sticker.position.y, 1, 'an out-of-range number is still clamped');
	assert.ok(!Number.isNaN(sticker.position.x));
	assert.equal(sticker.position.scale, undefined, 'a non-numeric scale is dropped, not sent as NaN');
	assert.equal(sticker.position.rotation, undefined);
	// and nothing in the serialised form is null
	assert.doesNotMatch(JSON.stringify(sticker.position), /null/);
});

test('§2.141 a numeric position is untouched', () => {
	const [sticker] = normalizeStickers([
		{ type: 'link', url: 'https://example.com', position: { x: 0.25, y: 0.75, scale: 2, rotation: -90 } }
	]);
	assert.deepEqual(sticker.position, { x: 0.25, y: 0.75, scale: 2, rotation: -90 });
});

test('§2.141 building a music card still validates its host (unchanged)', () => {
	assert.throws(
		() => buildMusicMessage({ title: 't', songUri: 'https://evil.example/x' }),
		/not one of the supported hosts/
	);
});
