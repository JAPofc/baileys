// §2.91 — receipts: no id-less items on the wire, no duplicates, no oversized stanzas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aggregateMessageKeysNotFromMe, RECEIPT_BATCH_MAX, encodeBinaryNode, decodeBinaryNode } from '../lib/index.js'

const key = (over = {}) => ({ remoteJid: '1@s.whatsapp.net', id: 'AAA', fromMe: false, ...over })

test('§2.91 keys without a usable id are skipped instead of sent as null', async () => {
	const batches = aggregateMessageKeysNotFromMe([
		key({ id: 'AAA' }), key({ id: undefined }), key({ id: null }), key({ id: '' }), key({ id: '   ' }),
		{ remoteJid: '1@s.whatsapp.net', fromMe: false }, key({ id: 'BBB' })
	])
	assert.equal(batches.length, 1)
	assert.deepEqual(batches[0].messageIds, ['AAA', 'BBB'])

	// prove nothing null reaches the wire
	const node = {
		tag: 'receipt',
		attrs: { id: batches[0].messageIds[0], to: batches[0].jid, type: 'read' },
		content: [{ tag: 'list', attrs: {}, content: batches[0].messageIds.slice(1).map(id => ({ tag: 'item', attrs: { id } })) }]
	}
	const wire = await decodeBinaryNode(encodeBinaryNode(node))
	const items = (wire.content?.[0]?.content ?? []).map(item => item.attrs.id)
	assert.deepEqual(items, ['BBB'])
	assert.equal(items.some(id => id === null || id === undefined || id === ''), false)
})

test('§2.91 the same message is acknowledged once, per chat and participant', () => {
	const batches = aggregateMessageKeysNotFromMe([
		key({ id: 'AAA' }), key({ id: 'AAA' }), key({ id: 'AAA' }), key({ id: 'BBB' }),
		key({ remoteJid: '120363@g.us', participant: '628@s.whatsapp.net', id: 'AAA' }),
		key({ remoteJid: '120363@g.us', participant: '629@s.whatsapp.net', id: 'AAA' })
	])
	const byChat = Object.fromEntries(batches.map(b => [`${b.jid}:${b.participant || ''}`, b.messageIds]))
	assert.deepEqual(byChat['1@s.whatsapp.net:'], ['AAA', 'BBB'])
	// the same id from two different participants is two different messages
	assert.deepEqual(byChat['120363@g.us:628@s.whatsapp.net'], ['AAA'])
	assert.deepEqual(byChat['120363@g.us:629@s.whatsapp.net'], ['AAA'])
})

test('§2.91 our own messages are still skipped, and junk input does not throw', () => {
	assert.deepEqual(aggregateMessageKeysNotFromMe([key({ fromMe: true })]), [])
	assert.deepEqual(aggregateMessageKeysNotFromMe([{ id: 'A', fromMe: false }]), [], 'no remoteJid → nothing to ack')
	assert.deepEqual(aggregateMessageKeysNotFromMe([]), [])
	assert.deepEqual(aggregateMessageKeysNotFromMe(undefined), [])
	assert.doesNotThrow(() => aggregateMessageKeysNotFromMe([null, undefined, key()]))
	assert.equal(aggregateMessageKeysNotFromMe([null, undefined, key()]).length, 1)
	// a numeric id is coerced, not dropped
	assert.deepEqual(aggregateMessageKeysNotFromMe([key({ id: 12345 })])[0].messageIds, ['12345'])
})

test('§2.91 a huge read is split into stanzas instead of one oversized one', () => {
	const many = Array.from({ length: 250 }, (_, i) => key({ id: `ID${i}` }))
	const batches = aggregateMessageKeysNotFromMe(many)
	assert.equal(RECEIPT_BATCH_MAX, 100)
	assert.equal(batches.length, 3)
	assert.deepEqual(batches.map(b => b.messageIds.length), [100, 100, 50])
	assert.equal(new Set(batches.flatMap(b => b.messageIds)).size, 250, 'every id must still be acknowledged exactly once')
	assert.equal(aggregateMessageKeysNotFromMe(many, { batchSize: 25 }).length, 10)
	// a nonsense batchSize falls back to the default instead of producing empty batches
	assert.equal(aggregateMessageKeysNotFromMe(many, { batchSize: 0 }).length, 3)
	assert.equal(aggregateMessageKeysNotFromMe(many, { batchSize: -5 }).length, 3)
})

test('§2.91 sendReceipts/readMessages pass the batch size through, and are typed', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	assert.match(src, /const sendReceipts = async \(keys, type, \{ batchSize \} = \{\}\)/)
	assert.match(src, /aggregateMessageKeysNotFromMe\(keys, batchSize \? \{ batchSize \} : undefined\)/)
	assert.match(src, /const readMessages = async \(keys, options = \{\}\)/)
	assert.match(src, /isReadReceiptBlocked\(key\?\.remoteJid\)/, 'the block switch must be consulted')
	assert.match(src, /await sendReceipts\(allowed, readType, options\)/)
	for (const file of ['../lib/Socket/messages-send.d.ts', '../lib/Socket/index.d.ts']) {
		const dts = readFileSync(new URL(file, import.meta.url), 'utf8')
		assert.match(dts, /sendReceipts: \(keys: any, type: any, opts\?: \{ batchSize\?: number \}\)/)
		assert.match(dts, /readMessages: \(keys: any, opts\?: \{ batchSize\?: number \}\)/)
	}
	assert.match(readFileSync(new URL('../lib/Utils/messages.d.ts', import.meta.url), 'utf8'), /RECEIPT_BATCH_MAX/)
})
