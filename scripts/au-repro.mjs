// §2.89 repro -- a plaintext newsletter (channel) message is stored with the wrong timestamp
// and never as "from me".
//
// handleNewsletterNotification() loops over the children of a <notification> and, for the
// `message` child, builds the WebMessageInfo with `+child.attrs.t`. The timestamp lives on
// the OUTER notification node -- every other handler in the same file reads `node.attrs.t`.
// `+undefined` is NaN, and protobuf clamps that to 0, so every channel post lands in the
// store dated 1 Jan 1970 and sorts to the very top/bottom of the chat.
//
// The same branch hardcodes `fromMe: false`, even when the notification says the author is
// us (`node.attrs.participant`) -- so a bot's own channel posts come back looking incoming.
import { makeNewsletterHandler } from '../tests/helpers/newsletter-notification.mjs'
import { proto } from '../lib/index.js'

const ME = '628111@s.whatsapp.net'
const NOW = 1_767_225_600 // 2026-01-01, in seconds

const node = (participant) => ({
	tag: 'notification',
	attrs: { from: '12345@newsletter', type: 'newsletter', t: String(NOW), ...(participant ? { participant } : {}) },
	content: [{
		tag: 'message',
		attrs: { message_id: '100', server_id: '100' },
		content: [{
			tag: 'plaintext',
			attrs: {},
			content: proto.Message.encode(proto.Message.fromObject({ conversation: 'channel post' })).finish()
		}]
	}]
})

const show = async (label, participant) => {
	const { handle, upserts } = makeNewsletterHandler({ me: ME })
	await handle(node(participant))
	const stored = upserts[0]?.msg
	const ts = Number(stored?.messageTimestamp ?? 0)
	console.log(`  ${label.padEnd(34)} timestamp=${ts} (${new Date(ts * 1000).toISOString().slice(0, 10)})  fromMe=${stored?.key?.fromMe}`)
}

console.log(`notification carries t=${NOW} (${new Date(NOW * 1000).toISOString().slice(0, 10)}), me=${ME}\n`)
await show('post by someone else', undefined)
await show('post by US (participant = me)', ME)
