// Tests for the v2.4.6 media-mime helpers: MIME⇆ext mapping + magic-byte sniffing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeMime,
    mimeToExtension,
    extensionToMime,
    mediaKindFromMime,
    sniffMediaType
} from '../lib/Utils/media-mime.js';

test('normalizeMime lowercases and strips parameters', () => {
    assert.equal(normalizeMime('Audio/OGG; codecs=opus'), 'audio/ogg');
    assert.equal(normalizeMime('  IMAGE/JPEG '), 'image/jpeg');
    assert.equal(normalizeMime(undefined), '');
});

test('mimeToExtension / extensionToMime', () => {
    assert.equal(mimeToExtension('image/jpeg'), 'jpg');
    assert.equal(mimeToExtension('audio/ogg; codecs=opus'), 'ogg');
    assert.equal(mimeToExtension('application/pdf'), 'pdf');
    assert.equal(mimeToExtension('application/x-unknown'), '');

    assert.equal(extensionToMime('jpg'), 'image/jpeg');
    assert.equal(extensionToMime('.PNG'), 'image/png');
    assert.equal(extensionToMime('opus'), 'audio/ogg');
    assert.equal(extensionToMime('docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(extensionToMime('nope'), '');
});

test('mediaKindFromMime maps to WA media kinds', () => {
    assert.equal(mediaKindFromMime('image/png'), 'image');
    assert.equal(mediaKindFromMime('video/mp4'), 'video');
    assert.equal(mediaKindFromMime('audio/ogg'), 'audio');
    assert.equal(mediaKindFromMime('application/pdf'), 'document');
    assert.equal(mediaKindFromMime('image/webp'), 'sticker');
    assert.equal(mediaKindFromMime('image/webp', { webpAsImage: true }), 'image');
    assert.equal(mediaKindFromMime(''), 'document');
});

test('sniffMediaType detects images by magic bytes', () => {
    assert.deepEqual(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), { mime: 'image/jpeg', ext: 'jpg', kind: 'image' });
    assert.equal(sniffMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime, 'image/png');
    assert.equal(sniffMediaType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).mime, 'image/gif');
    assert.equal(sniffMediaType(Buffer.from([0x42, 0x4d, 1, 2])).mime, 'image/bmp');
});

test('sniffMediaType distinguishes RIFF containers (WEBP vs WAV)', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    assert.equal(sniffMediaType(webp).mime, 'image/webp');
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVE')]);
    assert.equal(sniffMediaType(wav).mime, 'audio/wav');
});

test('sniffMediaType detects audio/documents', () => {
    assert.equal(sniffMediaType(Buffer.from([0x49, 0x44, 0x33, 4, 0, 0])).mime, 'audio/mpeg'); // ID3
    assert.equal(sniffMediaType(Buffer.from([0xff, 0xfb, 0x90, 0])).mime, 'audio/mpeg');       // MPEG frame
    assert.equal(sniffMediaType(Buffer.from('OggS____')).mime, 'audio/ogg');
    assert.equal(sniffMediaType(Buffer.from('%PDF-1.7')).mime, 'application/pdf');
    assert.equal(sniffMediaType(Buffer.from([0x50, 0x4b, 0x03, 0x04])).mime, 'application/zip');
});

test('sniffMediaType detects ISO-BMFF video/audio by ftyp brand', () => {
    const mk = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand)]);
    assert.equal(sniffMediaType(mk('mp42')).mime, 'video/mp4');
    assert.equal(sniffMediaType(mk('3gp5')).mime, 'video/3gpp');
    assert.equal(sniffMediaType(mk('M4A ')).mime, 'audio/mp4');
    assert.equal(sniffMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])).mime, 'video/webm');
});

test('sniffMediaType returns null for unknown/short input', () => {
    assert.equal(sniffMediaType(Buffer.from([1, 2, 3, 4, 5, 6])), null);
    assert.equal(sniffMediaType(Buffer.from([1, 2])), null);
    assert.equal(sniffMediaType(null), null);
    // accepts Uint8Array too
    assert.equal(sniffMediaType(Uint8Array.of(0xff, 0xd8, 0xff, 0)).mime, 'image/jpeg');
});
