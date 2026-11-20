// §2.123 — a negative/32-bit-signed length must not rewind the decoder.
// §2.124 — nested lists are capped instead of overflowing the stack.
// §2.125 — an attribute named __proto__ survives decoding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as constants from '../lib/WABinary/constants.js'
import { decodeDecompressedBinaryNode, MAX_BINARY_NODE_DEPTH, encodeBinaryNode } from '../lib/WABinary/index.js'

const T = constants.TAGS
const decode = (buf, ref) => decodeDecompressedBinaryNode(buf, constants, ref)

test('§2.123 a BINARY_32 length with the high bit set is rejected, not treated as negative', () => {
	const buf = Buffer.from([T.LIST_8, 2, 1, T.BINARY_32, 0xff, 0xff, 0xff, 0xff, 0x41, 0x42])
	const ref = { index: 0 }
	assert.throws(() => decode(buf, ref), /end of stream/)
	assert.ok(ref.index >= 8, `cursor must not rewind, got ${ref.index}`)
})

test('§2.123 a BINARY_20 length that overruns the buffer still throws end of stream', () => {
	assert.throws(() => decode(Buffer.from([T.LIST_8, 2, 1, T.BINARY_20, 0xff, 0xff, 0xff, 0x41])), /end of stream/)
})

test('§2.123 a four-byte length above 2^31 reads as a positive number', () => {
	// 0x80000001 bytes of payload are obviously not there — the point is the sign
	const buf = Buffer.from([T.LIST_8, 2, 1, T.BINARY_32, 0x80, 0x00, 0x00, 0x01])
	const err = (() => { try { decode(buf) } catch (e) { return e } })()
	assert.ok(err)
	assert.doesNotMatch(err.message, /invalid length: -/)
})

test('§2.124 a reasonable nesting depth still decodes', () => {
	const parts = []
	for (let i = 0; i < 50; i++) parts.push(T.LIST_8, 2, 1, T.LIST_8, 1)
	parts.push(T.LIST_8, 1, 1)
	const node = decode(Buffer.from(parts))
	let levels = 0
	let cur = node
	while (Array.isArray(cur?.content)) {
		levels++
		cur = cur.content[0]
	}
	assert.equal(levels, 50)
})

test('§2.124 an over-deep frame throws a protocol error instead of a RangeError', () => {
	const parts = []
	for (let i = 0; i < 5000; i++) parts.push(T.LIST_8, 2, 1, T.LIST_8, 1)
	parts.push(T.LIST_8, 1, 1)
	const err = (() => { try { decode(Buffer.from(parts)) } catch (e) { return e } })()
	assert.ok(err)
	assert.notEqual(err.constructor.name, 'RangeError')
	assert.match(err.message, new RegExp(`nested deeper than ${MAX_BINARY_NODE_DEPTH} levels`))
})

test('§2.124 the depth counter is reset, so sibling nodes are unaffected', () => {
	const ref = { index: 0, depth: 0 }
	const parts = [T.LIST_8, 2, 1, T.LIST_8, 2, T.LIST_8, 1, 1, T.LIST_8, 1, 1]
	decode(Buffer.from(parts), ref)
	assert.equal(ref.depth, 0)
})

test('§2.125 an attribute named __proto__ is kept as an own property', () => {
	const buf = Buffer.from([
		T.LIST_8, 3, 1,
		T.BINARY_8, 9, ...Buffer.from('__proto__'),
		T.BINARY_8, 3, ...Buffer.from('bad')
	])
	const node = decode(buf)
	assert.deepEqual(Object.keys(node.attrs), ['__proto__'])
	assert.equal(Object.getOwnPropertyDescriptor(node.attrs, '__proto__').value, 'bad')
	assert.equal(Object.getPrototypeOf({}), Object.prototype)
})

test('§2.123/§2.125 an ordinary node round-trips through encode/decode unchanged', async () => {
	const node = {
		tag: 'iq',
		attrs: { id: '42', to: 's.whatsapp.net', type: 'get' },
		content: [{ tag: 'ping', attrs: {} }]
	}
	const encoded = encodeBinaryNode(node)
	const decoded = decode(Buffer.from(encoded.subarray(1)))
	assert.equal(decoded.tag, 'iq')
	assert.deepEqual({ ...decoded.attrs }, node.attrs)
	assert.equal(decoded.content[0].tag, 'ping')
})

test('§2.123 a long binary payload (BINARY_20 range) decodes intact', () => {
	const payload = Buffer.alloc(70000, 7)
	const header = Buffer.from([T.LIST_8, 2, 1, T.BINARY_20, (70000 >> 16) & 15, (70000 >> 8) & 255, 70000 & 255])
	const node = decode(Buffer.concat([header, payload]))
	assert.equal(node.content.length, 70000)
	assert.equal(node.content[69999], 7)
})
