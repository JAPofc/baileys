/**
 * tests/v2410-batch-ce.test.js — Batch CE (§2.167–§2.173).
 *
 * Three modules that shipped without a single test: `payment-messages.js`,
 * `button-helper-utils.js` and the certificate placeholder in `rich-message-utils.js`.
 */
import { test } from 'node:test'
import assert from 'node:assert'

import {
	readSplitPaymentMessage,
	readPaymentMessage,
	buildSplitPaymentMessage,
	SPLIT_PAYMENT_PARTICIPANT_STATUS
} from '../lib/Utils/payment-messages.js'
import {
	getButtonType,
	getButtonArgs,
	patchMessageForMdIfRequired,
	extractFromButtonsMessage,
	prepareAlbumMessageContent
} from '../lib/Utils/button-helper-utils.js'
import { botMetadataCertificate } from '../lib/Utils/rich-message-utils.js'

const A = 'a@s.whatsapp.net'
const B = 'b@s.whatsapp.net'

// ── §2.167 ───────────────────────────────────────────────────────────────────

test('§2.167 a settled participant is counted in its own wire offset', () => {
	// 150.00 written on offset 100, against a total written on offset 1000.
	const msg = {
		splitPaymentMessage: {
			splitId: 's',
			totalAmount: { value: 300000, offset: 1000 },
			participants: [
				{ jid: A, amount: { value: 15000, offset: 100 }, status: SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID },
				{ jid: B, amount: { value: 150000, offset: 1000 }, status: SPLIT_PAYMENT_PARTICIPANT_STATUS.PENDING }
			]
		}
	}
	const read = readSplitPaymentMessage(msg)
	// the per-row reader already got this right; the summary did not
	assert.deepStrictEqual(read.participants.map(p => p.amount.amount), [150, 150])
	assert.strictEqual(read.settled, 150, 'settled must be the human amount, not value/total.offset')
	assert.strictEqual(read.outstanding, 150)
})

test('§2.167 the uniform-offset case keeps working, and the two sides add up to the total', () => {
	const msg = {
		splitPaymentMessage: {
			splitId: 's',
			totalAmount: { value: 300000, offset: 1000 },
			participants: [
				{ jid: A, amount: { value: 150000, offset: 1000 }, status: SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID },
				{ jid: B, amount: { value: 150000, offset: 1000 }, status: SPLIT_PAYMENT_PARTICIPANT_STATUS.PAID }
			]
		}
	}
	const read = readSplitPaymentMessage(msg)
	assert.strictEqual(read.settled, 300)
	assert.strictEqual(read.outstanding, 0)
	assert.strictEqual(read.settled + read.outstanding, read.total.amount)
	assert.strictEqual(read.complete, true)
})

// ── §2.168 ───────────────────────────────────────────────────────────────────

test('§2.168 readPaymentMessage reads the bare shape buildSplitPaymentMessage returns', () => {
	const bare = buildSplitPaymentMessage({
		splitId: 'dinner-1',
		total: 300,
		currency: 'IDR',
		participants: [{ jid: A, amount: 150 }, { jid: B, amount: 150 }]
	})
	// the specific reader accepts it...
	assert.ok(readSplitPaymentMessage(bare), 'readSplitPaymentMessage must accept the bare object')
	// ...so the umbrella reader must too
	const read = readPaymentMessage(bare)
	assert.ok(read, 'readPaymentMessage must not drop the bare split form')
	assert.strictEqual(read.type, 'split')
	assert.strictEqual(read.value.splitId, 'dinner-1')
})

test('§2.168 the wrapped form and non-payment input are unchanged', () => {
	const wrapped = { message: { splitPaymentMessage: { splitId: 'x', participants: [] } } }
	assert.strictEqual(readPaymentMessage(wrapped)?.type, 'split')
	assert.strictEqual(readPaymentMessage({ message: { conversation: 'hi' } }), null)
	assert.strictEqual(readPaymentMessage(undefined), null)
})

// ── §2.169 ───────────────────────────────────────────────────────────────────

test('§2.169 a list/buttons payload is recognised inside every view-once wrapper', () => {
	const list = { listMessage: { title: 'menu' } }
	const buttons = { buttonsMessage: { contentText: 'hi' } }
	const wrappers = ['viewOnceMessageV2Extension', 'viewOnceMessageV2', 'viewOnceMessage']

	for (const wrapper of wrappers) {
		assert.strictEqual(getButtonType({ [wrapper]: { message: list } }), 'list', `list under ${wrapper}`)
		assert.strictEqual(getButtonType({ [wrapper]: { message: buttons } }), 'buttons', `buttons under ${wrapper}`)

		const args = getButtonArgs({ [wrapper]: { message: list } })
		assert.deepStrictEqual(
			args.content,
			[{ tag: 'list', attrs: { v: '2', type: 'product_list' } }],
			`a wrapped list must still get its <list/> node under ${wrapper}, not a bare <biz/>`
		)
	}
})

test('§2.169 unwrapped payloads and non-button messages are unaffected', () => {
	assert.strictEqual(getButtonType({ listMessage: {} }), 'list')
	assert.strictEqual(getButtonType({ conversation: 'hi' }), undefined)
	assert.deepStrictEqual(getButtonArgs({ conversation: 'hi' }), { tag: 'biz', attrs: {} })
	// native flow is found through the candidate list, as before
	assert.strictEqual(
		getButtonType({ viewOnceMessageV2: { message: { interactiveMessage: { nativeFlowMessage: {} } } } }),
		'native_flow'
	)
})

// ── §2.170 ───────────────────────────────────────────────────────────────────

test('§2.170 patching for MD keeps both the device-list metadata and the caller’s own context', () => {
	const secret = Buffer.alloc(32, 7)
	const patched = patchMessageForMdIfRequired({
		buttonsMessage: { contentText: 'hi' },
		messageContextInfo: { messageSecret: secret }
	})
	const inner = patched.viewOnceMessageV2Extension.message
	assert.strictEqual(inner.messageContextInfo.messageSecret, secret, 'the caller’s secret must survive')
	assert.strictEqual(
		inner.messageContextInfo.deviceListMetadataVersion,
		2,
		'the device-list metadata this wrapper exists to add must survive too'
	)
	assert.ok(inner.buttonsMessage)
})

test('§2.170 a message with no context of its own, and one that needs no patch', () => {
	const patched = patchMessageForMdIfRequired({ listMessage: {} })
	assert.strictEqual(patched.viewOnceMessageV2Extension.message.messageContextInfo.deviceListMetadataVersion, 2)
	const plain = { conversation: 'hi' }
	assert.strictEqual(patchMessageForMdIfRequired(plain), plain)
})

// ── §2.171 ───────────────────────────────────────────────────────────────────

test('§2.171 a text-only header does not hide top-level media', () => {
	const image = { url: 'https://example.com/a.jpg' }
	assert.deepStrictEqual(extractFromButtonsMessage({ imageMessage: image }), { imageMessage: image })
	assert.deepStrictEqual(
		extractFromButtonsMessage({ imageMessage: image, header: { title: 'hello' } }),
		{ imageMessage: image },
		'a header carrying no media must not shadow the payload’s own media'
	)
})

test('§2.171 a header that does carry media still wins', () => {
	const top = { url: 'top' }
	const inHeader = { url: 'header' }
	assert.deepStrictEqual(
		extractFromButtonsMessage({ imageMessage: top, header: { imageMessage: inHeader } }),
		{ imageMessage: inHeader }
	)
	assert.strictEqual(extractFromButtonsMessage({ header: { title: 'x' } }), null)
	assert.strictEqual(extractFromButtonsMessage(undefined), null)
})

// ── §2.172 ───────────────────────────────────────────────────────────────────

test('§2.172 the album header never announces items the send loop skips', async () => {
	let announced
	const options = {
		userJid: A,
		suki: {
			relayMessage: async (_jid, message) => { announced = message.albumMessage },
			waUploadToServer: async () => ({})
		}
	}
	// every entry here is skipped by the send loop: the key is present but the value is falsy,
	// or there is no media key at all. The old `kind in item` count announced 2 of them.
	const sent = await prepareAlbumMessageContent(B, [
		{ image: undefined },
		{ video: null },
		{ text: 'not media' }
	], options)

	assert.strictEqual(sent.length, 0)
	assert.strictEqual(announced.expectedImageCount, 0, 'an absent image must not be announced')
	assert.strictEqual(announced.expectedVideoCount, 0)
	assert.strictEqual(
		announced.expectedImageCount + announced.expectedVideoCount,
		sent.length,
		'the announced count and the number of items actually relayed must agree'
	)
})

// ── §2.173 ───────────────────────────────────────────────────────────────────

test('§2.173 the placeholder certificate declares a length that matches its body', () => {
	for (const length of [4, 100, 685, 892, 0xffff + 4]) {
		const cert = botMetadataCertificate(length)
		assert.strictEqual(cert.length, length)
		assert.strictEqual(cert[0], 0x30, 'DER SEQUENCE tag')
		assert.strictEqual(cert[1], 0x82, 'long form, two length bytes')
		assert.strictEqual(((cert[2] << 8) | cert[3]), length - 4, `declared body length for ${length}`)
	}
})

test('§2.173 a length the header cannot express is refused instead of silently truncated', () => {
	// writes past the end of a TypedArray are dropped without error, so the old code returned
	// a 2-byte "certificate" whose length bytes never made it in at all.
	for (const bad of [0, 1, 3, -1, 1.5, 0xffff + 5, 70000, NaN, '685']) {
		assert.throws(
			() => botMetadataCertificate(bad),
			err => err instanceof RangeError && /length/.test(err.message),
			`length ${bad} must be rejected`
		)
	}
	// `undefined` is not an error -- it selects the default
	assert.strictEqual(botMetadataCertificate(undefined).length, 685)
	// the default is unchanged and still valid
	assert.strictEqual(botMetadataCertificate().length, 685)
})
