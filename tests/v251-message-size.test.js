import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MESSAGE_SIZE_MAX_BYTES, MESSAGE_SIZE_WARN_BYTES, estimateMessageSize } from '../lib/Utils/message-size.js'
import { proto } from '../WAProto/index.js'

/**
 * §2.221 — the size estimate must be a measurement, not a guess, and must never perform
 * I/O. Both properties are asserted directly: the byte count is compared against an
 * independently encoded protobuf, and the network-touching paths are checked by handing in
 * media that could only be sized by fetching it.
 */

const DM = '62811111111@s.whatsapp.net'

describe('§2.221 the number is the real encoded length', () => {
	it('matches an independently encoded protobuf for plain text', async () => {
		const text = 'halo dunia'
		const r = await estimateMessageSize({ text }, { userJid: DM })
		// encode the same thing by hand and allow only the context-info envelope to differ
		const bare = proto.Message.encode(proto.Message.create({ extendedTextMessage: { text } })).finish().length
		assert.ok(r.bytes >= bare, `estimate ${r.bytes} must cover at least the bare body ${bare}`)
		assert.ok(r.bytes < bare + 200, 'and must not be wildly larger than it')
	})

	it('grows by roughly one byte per added character', async () => {
		const small = await estimateMessageSize({ text: 'x'.repeat(100) })
		const big = await estimateMessageSize({ text: 'x'.repeat(5100) })
		const delta = big.bytes - small.bytes
		assert.ok(delta >= 5000 && delta <= 5010, `expected ~5000 extra bytes, got ${delta}`)
	})

	it('is not a character count dressed up as bytes', async () => {
		// 4-byte astral characters must cost about four bytes each, not one
		const ascii = await estimateMessageSize({ text: 'a'.repeat(1000) })
		const emoji = await estimateMessageSize({ text: '😀'.repeat(1000) })
		assert.ok(emoji.bytes > ascii.bytes * 3, `emoji ${emoji.bytes} vs ascii ${ascii.bytes}`)
	})

	it('reports the heaviest field so you know what to cut', async () => {
		const rows = Array.from({ length: 300 }, (_, i) => ({ title: `row ${i}`, rowId: `id-${i}` }))
		const r = await estimateMessageSize({ text: 'menu', sections: [{ title: 's', rows }] })
		assert.equal(r.heaviest.field, 'listMessage')
		assert.ok(r.heaviest.bytes > 3000)
	})
})

describe('§2.221 it never performs network I/O', () => {
	it('refuses to measure a url instead of downloading it', async () => {
		const r = await estimateMessageSize({ image: { url: 'https://example.invalid/huge.jpg' } })
		assert.equal(r.bytes, undefined)
		assert.match(r.unmeasurable, /remote media/)
		assert.equal(r.mediaBytes, undefined, 'an unknown size is undefined, never 0')
		assert.equal(r.hasUnknownMedia, true)
	})

	it('refuses a remote item nested inside an album', async () => {
		const r = await estimateMessageSize({ album: [{ image: Buffer.alloc(10) }, { image: { url: 'https://example.invalid/a.jpg' } }] })
		assert.match(r.unmeasurable, /remote media/)
	})

	it('measures a Buffer locally, without uploading', async () => {
		const r = await estimateMessageSize({ image: Buffer.alloc(50_000), caption: 'hi' })
		assert.equal(typeof r.bytes, 'number')
		assert.equal(r.mediaBytes, 50_000)
		assert.equal(r.hasUnknownMedia, false)
		assert.equal(r.heaviest.field, 'imageMessage')
		assert.ok(r.bytes < 2000, 'the node carries a pointer, not the picture')
	})

	it('the media pointer is included, not skipped', async () => {
		// a node without url/directPath would be conspicuously tiny
		const r = await estimateMessageSize({ image: Buffer.alloc(16) })
		assert.ok(r.bytes > 200, `expected a realistic media header, got ${r.bytes}`)
	})
})

describe('§2.221 unknown is never reported as zero', () => {
	it('mediaBytes is undefined for a stream, not 0', async () => {
		const r = await estimateMessageSize({ video: { url: 'https://example.invalid/v.mp4' } })
		assert.notEqual(r.mediaBytes, 0)
		assert.equal(r.mediaBytes, undefined)
	})

	it('sums known Buffers across an album', async () => {
		const r = await estimateMessageSize({ album: [{ image: Buffer.alloc(1000) }, { image: Buffer.alloc(2000) }] })
		assert.equal(r.mediaBytes, 3000)
	})
})

describe('§2.221 limits and honesty about scope', () => {
	it('flags a payload over the warn threshold', async () => {
		const r = await estimateMessageSize({ text: 'x'.repeat(MESSAGE_SIZE_WARN_BYTES + 10) })
		assert.equal(r.nearLimit, true)
		assert.equal(r.withinLimit, true, 'near the limit is not over it')
	})

	it('a small message is neither near nor over', async () => {
		const r = await estimateMessageSize({ text: 'halo' })
		assert.equal(r.nearLimit, false)
		assert.equal(r.withinLimit, true)
		assert.ok(MESSAGE_SIZE_WARN_BYTES < MESSAGE_SIZE_MAX_BYTES)
	})

	it('states what the byte count excludes', async () => {
		const r = await estimateMessageSize({ text: 'halo' })
		assert.ok(r.excludes.includes('signal-encryption-overhead'))
		assert.ok(r.excludes.includes('media-file-body'))
	})
})

describe('§2.221 bad input is reported, never thrown', () => {
	for (const [label, input] of [
		['null', null],
		['undefined', undefined],
		['a string', 'halo'],
		['a number', 7],
		['an array', [{ text: 'a' }]],
		['an empty object', {}],
		['an unknown content type', { somethingNobodySupports: true }]
	]) {
		it(`survives ${label}`, async () => {
			const r = await estimateMessageSize(input)
			assert.equal(typeof r, 'object')
			assert.ok('bytes' in r)
			if (r.bytes === undefined) assert.equal(typeof r.unmeasurable, 'string')
		})
	}
})
