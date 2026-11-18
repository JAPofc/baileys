/**
 * Repro for BUGREPORT 2.73 + 2.74.
 *
 *  2.73 — the whole Japyea handler set is exported but never wired into sendMessage(),
 *         so every content shape it exists to serve either throws "Invalid media type"
 *         or silently degrades to a plain text message with the buttons stripped off.
 *  2.74 — prepareNativeFlowButtons() emits dead buttons instead of rejecting bad input:
 *         a non-string buttonParamsJson reaches the wire as "" and an unrecognised
 *         button shape reaches the wire as {}.
 *
 * Run: node scripts/aj-repro.mjs
 */
import { readFileSync } from 'fs'
import { generateWAMessageContent } from '../lib/Utils/index.js'
import { Japyea, routeJapyeaSend } from '../lib/Socket/japyea.js'
import { proto } from '../WAProto/index.js'

const upload = async () => ({ mediaUrl: 'https://x/u', directPath: '/d' })

// ---------------------------------------------------------------- 2.73
const SHAPES = {
	'{ interactiveButtons }': { text: 'hi', interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Yes","id":".yes"}' }] },
	'{ interactiveMessage }': { interactiveMessage: { body: { text: 'hi' } } },
	'{ interactiveMessage.carousel }': { text: 'hi', interactiveMessage: { carouselMessage: { cards: [] } } },
	'{ requestPaymentMessage }': { requestPaymentMessage: { amount: 1000, currency: 'IDR', note: 'hi' } },
	'{ productMessage }': { productMessage: { title: 'x', productImage: { url: 'https://x/a.jpg' } } },
	'{ groupInviteMessage }': { groupInviteMessage: { groupJid: '1@g.us', inviteCode: 'abc', caption: 'join' } },
	'{ eventMessage }': { eventMessage: { name: 'ev', startTime: 1 } },
	'{ pollResultMessage }': { pollResultMessage: { name: 'p', pollVotes: [] } },
	'{ groupStatusMessage }': { groupStatusMessage: { text: 'hi' } }
}

const sendSource = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
const wired = /new Japyea\(/.test(sendSource)
console.log(`messages-send.js constructs a Japyea instance: ${wired ? 'YES' : 'NO'}`)
console.log('\nBEFORE -- what the core message builder does with each shape on its own:')

for (const [label, content] of Object.entries(SHAPES)) {
	let outcome
	try {
		const m = await generateWAMessageContent(structuredClone(content), { upload })
		const keys = Object.keys(m).filter(k => k !== 'messageContextInfo')
		const intended = label.replace(/[{}\s]/g, '').split('.')[0]
		outcome = keys.includes(intended) || keys.includes('interactiveMessage')
			? `ok -> ${keys.join(',')}`
			: `SILENTLY DEGRADED -> ${keys.join(',') || '(empty)'}`
	} catch (err) {
		outcome = `THROWS -> ${err.message}`
	}

	console.log(`  ${label.padEnd(32)} ${outcome}`)
}

// ---------------------------------------------------------------- 2.74
console.log('\nnative-flow button validation (what actually reaches the wire):')
const onWire = async content => {
	try {
		const m = await generateWAMessageContent(content, { upload })
		const buf = proto.Message.encode(proto.Message.fromObject(m)).finish()
		return JSON.stringify(proto.Message.decode(buf).interactiveMessage.nativeFlowMessage.buttons)
	} catch (err) {
		return `rejected -> ${err.message}`
	}
}

console.log('  object buttonParamsJson   ', await onWire({ text: 'hi', nativeFlow: [{ name: 'quick_reply', buttonParamsJson: { display_text: 'R', id: 'r' } }] }))
console.log('  unrecognised button shape ', await onWire({ text: 'hi', nativeFlow: [{ text: 'oops' }] }))
console.log('  object-form own optionText', JSON.stringify((await generateWAMessageContent({ text: 'hi', nativeFlow: { buttons: [{ text: 'A', id: 'a' }], optionText: 'Menu' } }, { upload })).interactiveMessage.nativeFlowMessage.messageParamsJson))


// ---------------------------------------------------------------- AFTER
const me = '628111@s.whatsapp.net'
const sent = []
const japyea = new Japyea(upload, async (jid, message, opts) => { sent.push({ jid, message, opts }); return opts }, { logger: { error() {} } }, { authState: { creds: { me: { id: me } } } })

console.log('\nAFTER -- the same shapes routed through routeJapyeaSend():')
for (const [label, content] of Object.entries(SHAPES)) {
	sent.length = 0
	try {
		const res = await routeJapyeaSend({ japyea, jid: '628222@s.whatsapp.net', content: structuredClone(content), options: {}, userJid: me, relayMessage: async (jid, message, opts) => { sent.push({ jid, message, opts }); return opts } })
		const top = Object.keys(sent[0]?.message || {}).filter(k => k !== 'messageContextInfo')
		const nf = sent[0]?.message?.interactiveMessage?.nativeFlowMessage?.buttons?.length
		console.log(`  ${label.padEnd(32)} ${res.type} -> relayed ${top.join(',')}${nf ? ` (${nf} native-flow button(s))` : ''}, key.id ${res.message?.key?.id ? 'present' : 'MISSING'}`)
	} catch (err) {
		console.log(`  ${label.padEnd(32)} THROWS -> ${err.message}`)
	}
}
console.log(`\n  { album: [...] } still routes to the core builder: ${japyea.detectSendType({ album: [1, 2] }) === null}`)
