/**
 * tests/v247-exif-orientation.test.js — batch X (v2.4.7)
 *
 * Covers BUGREPORT §2.61: thumbnails and `imageMessage.width`/`height` that ignored the
 * EXIF Orientation tag, so a portrait phone photo went out sideways with swapped
 * dimensions — and did so differently depending on which optional image library was
 * installed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { exifOrientedDimensions, isOrientationSwapped, SWAPPED_EXIF_ORIENTATIONS } from '../lib/Utils/index.js';
import { extractImageThumb, generateThumbnail, getImageProcessingLibrary } from '../lib/Utils/messages-media.js';

describe('exifOrientedDimensions() (v2.4.7 upgrade)', () => {
	it('swaps for the quarter-turn orientations only', () => {
		for (const orientation of [5, 6, 7, 8]) {
			assert.deepEqual(exifOrientedDimensions({ width: 400, height: 200, orientation }), { width: 200, height: 400 });
			assert.equal(isOrientationSwapped(orientation), true);
		}
		for (const orientation of [1, 2, 3, 4]) {
			assert.deepEqual(exifOrientedDimensions({ width: 400, height: 200, orientation }), { width: 400, height: 200 });
			assert.equal(isOrientationSwapped(orientation), false);
		}
	});

	it('leaves everything alone when the tag is missing or nonsense', () => {
		assert.deepEqual(exifOrientedDimensions({ width: 400, height: 200 }), { width: 400, height: 200 });
		assert.deepEqual(exifOrientedDimensions({ width: 400, height: 200, orientation: 0 }), { width: 400, height: 200 });
		assert.deepEqual(exifOrientedDimensions({ width: 400, height: 200, orientation: 99 }), { width: 400, height: 200 });
		assert.equal(isOrientationSwapped(undefined), false);
		assert.equal(isOrientationSwapped(null), false);
	});

	it('is null-safe and preserves undefined dimensions', () => {
		assert.deepEqual(exifOrientedDimensions(null), { width: undefined, height: undefined });
		assert.deepEqual(exifOrientedDimensions(undefined), { width: undefined, height: undefined });
		assert.deepEqual(exifOrientedDimensions({ orientation: 6 }), { width: undefined, height: undefined });
	});

	it('exposes the table', () => {
		assert.deepEqual([...SWAPPED_EXIF_ORIENTATIONS], [5, 6, 7, 8]);
	});
});

describe('§2.61 extractImageThumb() honours EXIF orientation', async () => {
	const lib = await getImageProcessingLibrary();
	const sharp = 'sharp' in lib ? lib.sharp?.default : undefined;
	const landscape = (orientation) => {
		const img = sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg();
		return (orientation ? img.withMetadata({ orientation }) : img).toBuffer();
	};
	const dimsOf = async (buffer) => {
		const meta = await sharp(buffer).metadata();
		return `${meta.width}x${meta.height}`;
	};

	it('reports the displayed dimensions, not the stored ones', { skip: !sharp }, async () => {
		const buffer = await landscape(6);
		const { original } = await extractImageThumb(buffer, 32);
		assert.deepEqual(original, { width: 200, height: 400 }, 'the sensor stores 400x200; the user sees 200x400');
	});

	it('produces an upright thumbnail', { skip: !sharp }, async () => {
		const { buffer } = await extractImageThumb(await landscape(6), 32);
		assert.equal(await dimsOf(buffer), '32x64', 'portrait, matching what the viewer shows');
	});

	it('covers every quarter-turn orientation', { skip: !sharp }, async () => {
		for (const orientation of [5, 6, 7, 8]) {
			const { original } = await extractImageThumb(await landscape(orientation), 32);
			assert.deepEqual(original, { width: 200, height: 400 }, `orientation ${orientation}`);
		}
	});

	it('leaves an untagged or upright image exactly as before', { skip: !sharp }, async () => {
		for (const orientation of [undefined, 1]) {
			const { buffer, original } = await extractImageThumb(await landscape(orientation), 32);
			assert.deepEqual(original, { width: 400, height: 200 }, `orientation ${orientation}`);
			assert.equal(await dimsOf(buffer), '32x16');
		}
	});

	it('agrees with what the viewer would show after auto-rotation', { skip: !sharp }, async () => {
		const source = await landscape(6);
		const rotated = await sharp(source).rotate().jpeg().toBuffer();
		const displayed = await sharp(rotated).metadata();
		const { original } = await extractImageThumb(source, 32);
		assert.deepEqual(original, { width: displayed.width, height: displayed.height });
	});

	it('honours the requested width', { skip: !sharp }, async () => {
		const { buffer } = await extractImageThumb(await landscape(1), 64);
		assert.equal(await dimsOf(buffer), '64x32');
	});

	it('generateThumbnail() passes the corrected dimensions through to the message', { skip: !sharp }, async () => {
		const { thumbnail, originalImageDimensions } = await generateThumbnail(await landscape(6), 'image', {});
		assert.deepEqual(originalImageDimensions, { width: 200, height: 400 },
			'these become imageMessage.width/height on the wire');
		assert.equal(typeof thumbnail, 'string');
		assert.ok(thumbnail.length > 0);
	});

	it('still accepts a Readable stream', { skip: !sharp }, async () => {
		const { Readable } = await import('node:stream');
		const buffer = await landscape(6);
		const { original } = await extractImageThumb(Readable.from([buffer]), 32);
		assert.deepEqual(original, { width: 200, height: 400 });
	});

	it('the sharp branch auto-orients in the source', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Utils/messages-media.js', import.meta.url), 'utf8');
		assert.match(source, /img\.rotate\(\)\.resize\(width\)/);
		assert.match(source, /original: exifOrientedDimensions\(dimensions\)/);
		assert.doesNotMatch(source, /^\s*\/\/ TODO: Move entirely to sharp.*$/m);
	});
});
