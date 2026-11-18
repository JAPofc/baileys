// §2.110 — skipped group message keys survive the auth store round-trip.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SenderMessageKey } from '../lib/Signal/Group/sender-message-key.js'
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'

const GROUP = '120363000000000000@g.us'
const SENDER = '628111:0@s.whatsapp.net'
const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return silent } }

const makeRepo = me => {
	const store = {}
	const keys = {
		get: async (t, ids) => Object.fromEntries(ids.map(i => [i, store[t]?.[i]])),
		set: async data => {
			for (const t of Object.keys(data)) {
				store[t] = store[t] || {}
				for (const [k, v] of Object.entries(data[t])) {
					if (v === null || v === undefined) delete store[t][k]
					else store[t][k] = v
				}
			}
		},
		transaction: async f => f(),
		isInTransaction: () => false
	}
	return { store, repo: makeLibSignalRepository({ creds: { me: { id: me } }, keys }, silent) }
}

test('§2.110 a seed in its JSON form is accepted, and derives the same key as the Buffer', () => {
	const seed = Buffer.alloc(32, 7)
	const asStored = JSON.parse(JSON.stringify({ seed })).seed
	assert.equal(Buffer.isBuffer(asStored), false, 'the store really does hand back a plain object')
	const fromBuffer = new SenderMessageKey(3, seed)
	const fromStore = new SenderMessageKey(3, asStored)
	assert.deepEqual(fromStore.getCipherKey(), fromBuffer.getCipherKey())
	assert.deepEqual(fromStore.getIv(), fromBuffer.getIv())
})

test('§2.110 Uint8Array seeds work too', () => {
	const seed = Buffer.alloc(32, 9)
	assert.deepEqual(new SenderMessageKey(1, new Uint8Array(seed)).getCipherKey(), new SenderMessageKey(1, seed).getCipherKey())
})

test('§2.110 out-of-order group messages decrypt instead of being lost', async () => {
	const { repo: tx } = makeRepo(SENDER)
	const { repo: rx } = makeRepo('628222:0@s.whatsapp.net')
	const boot = await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from('boot'), meId: SENDER })
	await rx.processSenderKeyDistributionMessage({
		authorJid: SENDER,
		item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: boot.senderKeyDistributionMessage }
	})
	const wire = []
	for (const text of ['one', 'two', 'three', 'four']) {
		wire.push([text, (await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from(text), meId: SENDER })).ciphertext])
	}
	for (const [text, ciphertext] of [wire[3], wire[1], wire[0], wire[2]]) {
		const plain = await rx.decryptGroupMessage({ group: GROUP, authorJid: SENDER, msg: ciphertext })
		assert.equal(Buffer.from(plain).toString('utf8'), text, `out-of-order "${text}" failed`)
	}
})

test('§2.110 a replayed message key is consumed exactly once', async () => {
	const { repo: tx } = makeRepo(SENDER)
	const { repo: rx } = makeRepo('628222:0@s.whatsapp.net')
	const boot = await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from('boot'), meId: SENDER })
	await rx.processSenderKeyDistributionMessage({
		authorJid: SENDER,
		item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: boot.senderKeyDistributionMessage }
	})
	const first = (await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from('skipped'), meId: SENDER })).ciphertext
	const second = (await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from('arrived'), meId: SENDER })).ciphertext
	await rx.decryptGroupMessage({ group: GROUP, authorJid: SENDER, msg: second })
	assert.equal(Buffer.from(await rx.decryptGroupMessage({ group: GROUP, authorJid: SENDER, msg: first })).toString('utf8'), 'skipped')
	await assert.rejects(() => rx.decryptGroupMessage({ group: GROUP, authorJid: SENDER, msg: first }))
})

test('§2.110 the coercion is in the source, not just in behaviour', () => {
	const src = readFileSync(new URL('../lib/Signal/Group/sender-message-key.js', import.meta.url), 'utf8')
	assert.match(src, /Buffer\.isBuffer\(seed\) \? seed : Buffer\.from\(seed\)/)
})
