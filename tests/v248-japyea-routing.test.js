import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { Japyea, routeJapyeaSend, JAPYEA_SEND_TYPES } from '../lib/Socket/japyea.js'
import { generateWAMessageContent } from '../lib/Utils/index.js'
import { proto } from '../WAProto/index.js'

const ME = '628111@s.whatsapp.net'
const TO = '628222@s.whatsapp.net'
const upload = async () => ({ mediaUrl: 'https://x/u', directPath: '/d', fileLength: 1, fileSha256: Buffer.alloc(32), fileEncSha256: Buffer.alloc(32), mediaKey: Buffer.alloc(32) })

const harness = () => {
	const relayed = []
	const relayMessage = async (jid, message, opts) => {
		relayed.push({ jid, message, opts })
		return opts
	}

	const japyea = new Japyea(upload, relayMessage, { logger: { error() {}, warn() {}, debug() {} } }, { authState: { creds: { me: { id: ME } } } })
	return { relayed, relayMessage, japyea }
}

const route = async (content, options = {}) => {
	const { relayed, relayMessage, japyea } = harness()
	const res = await routeJapyeaSend({ japyea, jid: TO, content, options, userJid: ME, relayMessage, ...options.extra })
	return { ...res, relayed }
}

const SHAPES = {
	INTERACTIVE_BUTTONS: { text: 'hi', interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Yes","id":".yes"}' }] },
	INTERACTIVE: { interactiveMessage: { body: { text: 'hi' } } },
	CAROUSEL: { text: 'hi', interactiveMessage: { carouselMessage: { cards: [] } } },
	PAYMENT: { requestPaymentMessage: { amount: 1000, currency: 'IDR', note: 'hi' } },
	PRODUCT: { productMessage: { title: 'x', productImage: { url: 'https://x/a.jpg' } } },
	GROUP_INVITE: { groupInviteMessage: { groupJid: '1@g.us', inviteCode: 'abc', caption: 'join' } },
	EVENT: { eventMessage: { name: 'ev', startTime: 1 } },
	POLL_RESULT: { pollResultMessage: { name: 'p', pollVotes: [{ optionName: 'a', optionVoteCount: 2 }] } },
	GROUP_STORY: { groupStatusMessage: { text: 'hi' } }
}

test('§2.73 every Japyea shape is detected, relayed, and returns a real WAMessage', async () => {
	for (const [type, content] of Object.entries(SHAPES)) {
		const res = await route(structuredClone(content))
		assert.equal(res.handled, true, `${type} was not handled`)
		assert.equal(res.type, type)
		assert.ok(res.relayed.length >= 1, `${type} relayed nothing`)
		assert.equal(res.relayed[0].jid, TO)
		assert.ok(res.message?.key?.id, `${type} returned no key.id`)
		assert.equal(res.message.key.fromMe, true)
	}
})

test('§2.73 JAPYEA_SEND_TYPES covers exactly the routed shapes', () => {
	assert.deepEqual([...JAPYEA_SEND_TYPES].sort(), [...Object.keys(SHAPES), 'ALBUM'].sort())
})

test('§2.73 interactiveButtons actually reach the wire as native-flow buttons', async () => {
	const res = await route(structuredClone(SHAPES.INTERACTIVE_BUTTONS))
	const inner = res.relayed[0].message.viewOnceMessage?.message || res.relayed[0].message
	const buttons = inner.interactiveMessage.nativeFlowMessage.buttons
	assert.equal(buttons.length, 1)
	assert.equal(buttons[0].name, 'quick_reply')
	assert.equal(typeof buttons[0].buttonParamsJson, 'string')
	assert.equal(JSON.parse(buttons[0].buttonParamsJson).id, '.yes')
})

test('§2.73 a non-string buttonParamsJson is stringified instead of relayed as an object', async () => {
	const res = await route({ text: 'hi', interactiveButtons: [{ name: 'cta_url', buttonParamsJson: { display_text: 'Go', url: 'https://x.com' } }] })
	const inner = res.relayed[0].message.viewOnceMessage?.message || res.relayed[0].message
	const [btn] = inner.interactiveMessage.nativeFlowMessage.buttons
	assert.equal(typeof btn.buttonParamsJson, 'string')
	assert.equal(JSON.parse(btn.buttonParamsJson).url, 'https://x.com')
})

test('§2.73 detectSendType declines { album } so the core builder keeps it', () => {
	const { japyea } = harness()
	assert.equal(japyea.detectType({ album: [1, 2] }), 'ALBUM')
	assert.equal(japyea.detectSendType({ album: [1, 2] }), null)
	assert.equal(japyea.detectSendType({ albumMessage: [1, 2] }), 'ALBUM')
	assert.equal(japyea.detectSendType({ text: 'plain' }), null)
})

test('§2.73 unrelated content is not handled at all', async () => {
	const res = await route({ text: 'just text' })
	assert.equal(res.handled, false)
	assert.equal(res.relayed.length, 0)
})

test('§2.73 onSent receives the sent message, for every shape', async () => {
	for (const [type, content] of Object.entries(SHAPES)) {
		const seen = []
		const { relayMessage, japyea } = harness()
		await routeJapyeaSend({ japyea, jid: TO, content: structuredClone(content), options: {}, userJid: ME, relayMessage, onSent: async msg => seen.push(msg) })
		assert.equal(seen.length, 1, `${type} did not report to onSent`)
		assert.ok(seen[0].key.id)
	}
})

test('§2.73 a caller-supplied messageId is honoured', async () => {
	const { relayMessage, japyea } = harness()
	const res = await routeJapyeaSend({ japyea, jid: TO, content: structuredClone(SHAPES.INTERACTIVE_BUTTONS), options: { messageId: 'FIXEDID123' }, userJid: ME, relayMessage })
	assert.equal(res.message.key.id, 'FIXEDID123')
})

test('§2.73 sendMessage is wired to the router and can be opted out of', () => {
	const src = readFileSync('lib/Socket/messages-send.js', 'utf8')
	assert.match(src, /new Japyea\(waUploadToServer, relayMessage, config, sock\)/)
	assert.match(src, /routeJapyeaSend\(\{/)
	assert.match(src, /!options\.disableJapyea/)
	assert.match(src, /japyea\.detectSendType\(content\)/)
	// routed sends must still reach the app's own event stream
	assert.match(src, /onSent: async \(msg\) => \{[\s\S]*?emitOwnEvents[\s\S]*?upsertMessage\(msg, 'append'\)/)
})

test('§2.74 an unrecognised native-flow button is rejected instead of silently emptied', async () => {
	await assert.rejects(
		() => generateWAMessageContent({ text: 'hi', nativeFlow: [{ text: 'typo-shorthand' }] }, { upload }),
		/Unrecognized native-flow button/
	)
})

test('§2.74 a pre-built button survives protobuf encoding with its params intact', async () => {
	const m = await generateWAMessageContent({ text: 'hi', nativeFlow: [{ name: 'quick_reply', buttonParamsJson: { display_text: 'R', id: 'r' } }] }, { upload })
	const decoded = proto.Message.decode(proto.Message.encode(proto.Message.fromObject(m)).finish())
	const [btn] = decoded.interactiveMessage.nativeFlowMessage.buttons
	assert.equal(JSON.parse(btn.buttonParamsJson).display_text, 'R')
})

test('§2.74 the object form of nativeFlow honours its own offer/option fields', async () => {
	const m = await generateWAMessageContent({
		text: 'hi',
		nativeFlow: { buttons: [{ text: 'A', id: 'a' }], optionText: 'Menu', optionTitle: 'Pick one', offerText: 'Sale' }
	}, { upload })
	const params = JSON.parse(m.interactiveMessage.nativeFlowMessage.messageParamsJson)
	assert.equal(params.bottom_sheet.button_title, 'Menu')
	assert.equal(params.bottom_sheet.list_title, 'Pick one')
	assert.equal(params.limited_time_offer.text, 'Sale')
})

test('§2.74 the array form and top-level options still behave as before', async () => {
	const m = await generateWAMessageContent({ text: 'hi', optionText: 'Menu', nativeFlow: [{ text: 'A', id: 'a' }, { text: 'Go', url: 'https://x.com' }] }, { upload })
	const nf = m.interactiveMessage.nativeFlowMessage
	assert.deepEqual(nf.buttons.map(b => b.name), ['quick_reply', 'cta_url'])
	assert.equal(JSON.parse(nf.messageParamsJson).bottom_sheet.button_title, 'Menu')
})
