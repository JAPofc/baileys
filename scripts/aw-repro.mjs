// §2.91 repro -- read receipts are built from keys that were never validated.
//
// aggregateMessageKeysNotFromMe() groups keys by chat+participant and pushes `id` straight
// into the list. It never checks that the id exists, and never de-duplicates. A key without
// an id (a stub, a partially-restored store row, a hand-built key) therefore ends up on the
// wire as `<item id=null/>`, and the same message read twice is acknowledged twice.
import { aggregateMessageKeysNotFromMe, encodeBinaryNode, decodeBinaryNode } from '../lib/index.js'

const keys = [
	{ remoteJid: '1@s.whatsapp.net', id: 'AAA', fromMe: false },
	{ remoteJid: '1@s.whatsapp.net', id: 'AAA', fromMe: false },   // same message twice
	{ remoteJid: '1@s.whatsapp.net', id: 'BBB', fromMe: false },
	{ remoteJid: '1@s.whatsapp.net', id: undefined, fromMe: false }, // no id
	{ remoteJid: '1@s.whatsapp.net', fromMe: false },                // no id at all
	{ remoteJid: '1@s.whatsapp.net', id: '', fromMe: false },        // empty id
	{ remoteJid: '2@s.whatsapp.net', id: 'CCC', fromMe: true }       // ours — must be skipped
]

const batches = aggregateMessageKeysNotFromMe(keys)
console.log('  aggregated →', JSON.stringify(batches))

for (const batch of batches) {
	const node = {
		tag: 'receipt',
		attrs: { id: String(batch.messageIds[0] ?? ''), to: batch.jid, type: 'read' },
		content: [{
			tag: 'list',
			attrs: {},
			content: batch.messageIds.slice(1).map(id => ({ tag: 'item', attrs: { id } }))
		}]
	}
	const wire = await decodeBinaryNode(encodeBinaryNode(node))
	const items = (wire.content?.[0]?.content ?? []).map(item => item.attrs.id)
	console.log('  on the wire →', JSON.stringify({ first: wire.attrs.id, items }))
	console.log(`  ${items.filter(id => id === null || id === undefined || id === '').length} null/empty item id(s) sent to WhatsApp, ` +
		`${items.filter((id, i) => items.indexOf(id) !== i).length} duplicate(s)`)
}
