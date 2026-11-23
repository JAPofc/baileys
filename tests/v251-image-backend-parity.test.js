import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import {
	_setImageProcessingLibrary,
	generateProfilePicture
} from '../lib/Utils/messages-media.js'
import { _toStickerWebP } from '../lib/Utils/stickerpack.js'

/**
 * §2.212 / §2.213 — the backends did not agree with each other.
 *
 * `getImageProcessingLibrary()` picks sharp > @napi-rs/image > jimp and caches the winner.
 * Every CI machine has sharp, so the other two branches were never executed by any test —
 * and both carried bugs that changed the OUTPUT, not just the code path:
 *
 *   §2.212  `generateProfilePicture()` on @napi-rs/image returned a 300x300 image while
 *           reporting `{ width: 720, height: 720 }` (napi never upscales), and `contain`
 *           returned the original picture, not square and not letterboxed at all.
 *   §2.213  `_toStickerWebP()` on @napi-rs/image used the default ResizeFit.Cover, which
 *           CROPS — a 600x300 sticker lost a third of its content, where sharp keeps the
 *           aspect ratio with `fit: 'inside'`.
 *
 * These tests run the same inputs through each backend and demand the same answer. A
 * backend that is not installed is skipped with a stated reason, never silently.
 */

const backends = {}
for (const [key, loader] of [
	['sharp', async () => ({ sharp: await import('sharp') })],
	['image', async () => ({ image: await import('@napi-rs/image') })],
	['jimp', async () => ({ jimp: await import('jimp') })]
]) {
	try {
		backends[key] = await loader()
	} catch {
		backends[key] = null
	}
}

const { Jimp } = await import('jimp')

/** A 3-stripe image so a crop that eats content is visible, not just a size change. */
const picture = async (w, h) => {
	const img = new Jimp({ width: w, height: h, color: 0xffffffff })
	for (let x = 0; x < w; x++) {
		const colour = x < w / 3 ? 0xff0000ff : x < (2 * w) / 3 ? 0xffffffff : 0x0000ffff
		for (let y = 0; y < h; y++) {
			img.setPixelColor(colour, x, y)
		}
	}
	return await img.getBuffer('image/jpeg')
}

/** Dimensions from the file header — no image library involved, so no backend can lie. */
const dimensions = buffer => {
	const b = Buffer.from(buffer)
	if (b[0] === 0xff && b[1] === 0xd8) {
		let o = 2
		while (o < b.length) {
			if (b[o] !== 0xff) {
				o++
				continue
			}
			const marker = b[o + 1]
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return { width: b.readUInt16BE(o + 7), height: b.readUInt16BE(o + 5) }
			}
			o += 2 + b.readUInt16BE(o + 2)
		}
		throw new Error('malformed jpeg')
	}
	if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
		const format = b.slice(12, 16).toString()
		if (format === 'VP8X') {
			return { width: (b.readUIntLE(24, 3) & 0xffffff) + 1, height: (b.readUIntLE(27, 3) & 0xffffff) + 1 }
		}
		if (format === 'VP8L') {
			const bits = b.readUInt32LE(21)
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
		}
		if (format === 'VP8 ') {
			return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
		}
	}
	throw new Error('unrecognised image: ' + b.slice(0, 4).toString('hex'))
}

const reason = key => (backends[key] ? false : `${key} backend is not installed`)

after(() => _setImageProcessingLibrary(null))

describe('§2.212 generateProfilePicture() — every backend returns the size it claims', () => {
	for (const key of ['sharp', 'image', 'jimp']) {
		it(`${key}: cover produces an exact 720x720 square`, { skip: reason(key) }, async () => {
			_setImageProcessingLibrary(backends[key])
			try {
				const result = await generateProfilePicture(await picture(600, 300))
				assert.deepEqual(dimensions(result.img), { width: 720, height: 720 })
				// the bug was not just the pixels: the reported size disagreed with the bytes
				assert.equal(result.width, 720)
				assert.equal(result.height, 720)
			} finally {
				_setImageProcessingLibrary(null)
			}
		})

		it(`${key}: contain letterboxes onto the same square canvas`, { skip: reason(key) }, async () => {
			_setImageProcessingLibrary(backends[key])
			try {
				const result = await generateProfilePicture(await picture(600, 300), { fit: 'contain' })
				assert.deepEqual(dimensions(result.img), { width: 720, height: 720 },
					'contain must still fill the declared canvas, not hand back the original')
			} finally {
				_setImageProcessingLibrary(null)
			}
		})

		it(`${key}: a source SMALLER than the canvas is still 720x720`, { skip: reason(key) }, async () => {
			// this is the case @napi-rs/image silently refused: it never upscales
			_setImageProcessingLibrary(backends[key])
			try {
				const result = await generateProfilePicture(await picture(120, 90))
				assert.deepEqual(dimensions(result.img), { width: 720, height: 720 })
			} finally {
				_setImageProcessingLibrary(null)
			}
		})

		it(`${key}: a custom canvas is honoured too`, { skip: reason(key) }, async () => {
			_setImageProcessingLibrary(backends[key])
			try {
				const result = await generateProfilePicture(await picture(640, 480), { width: 256, height: 256 })
				assert.deepEqual(dimensions(result.img), { width: 256, height: 256 })
			} finally {
				_setImageProcessingLibrary(null)
			}
		})
	}
})

describe('§2.213 _toStickerWebP() — the 512 box keeps the aspect ratio on every backend', () => {
	const cases = [
		[[600, 300], [512, 256], 'landscape fits by width'],
		[[300, 600], [256, 512], 'portrait fits by height'],
		[[512, 512], [512, 512], 'already square and in the box'],
		[[100, 50], [512, 256], 'smaller than the box is enlarged to it']
	]

	for (const key of ['sharp', 'image']) {
		for (const [[w, h], [ew, eh], label] of cases) {
			it(`${key}: ${w}x${h} -> ${ew}x${eh} (${label})`, { skip: reason(key) }, async () => {
				const out = await _toStickerWebP(await picture(w, h), backends[key])
				assert.deepEqual(dimensions(out.buffer), { width: ew, height: eh })
				assert.equal(out.isAnimated, false)
			})
		}
	}

	it('sharp and @napi-rs/image agree on every shape', { skip: reason('sharp') || reason('image') }, async () => {
		for (const [[w, h]] of cases) {
			const src = await picture(w, h)
			const viaSharp = dimensions((await _toStickerWebP(src, backends.sharp)).buffer)
			const viaImage = dimensions((await _toStickerWebP(src, backends.image)).buffer)
			assert.deepEqual(viaImage, viaSharp, `backends disagree for ${w}x${h}`)
		}
	})
})
