// §2.109 — one ratchet step per group message, no dead "skipped" keys in our own record.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'

const GROUP = '120363000000000000@g.us'
const ME = '628111:0@s.whatsapp.net'
const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return silent } }

const makeRepo = () => {
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
	return { store, repo: makeLibSignalRepository({ creds: { me: { id: ME } }, keys }, silent) }
}

const readState = store => JSON.parse(Buffer.from(Object.values(store['sender-key'])[0]).toString('utf8'))[0]

test('§2.109 the sender chain advances exactly once per message', async () => {
	const { store, repo } = makeRepo()
	for (let i = 0; i < 20; i++) {
		await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from(`m${i}`), meId: ME })
	}
	const state = readState(store)
	assert.equal(state.senderChainKey.iteration, 20, 'the chain must ratchet once per send, not twice')
	assert.equal(state.senderMessageKeys.length, 0, 'sending must not file away skipped message keys')
})

test('§2.109 the record stays small instead of growing with every send', async () => {
	const { store, repo } = makeRepo()
	await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('one'), meId: ME })
	const first = Buffer.from(Object.values(store['sender-key'])[0]).length
	for (let i = 0; i < 50; i++) {
		await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from(`m${i}`), meId: ME })
	}
	const later = Buffer.from(Object.values(store['sender-key'])[0]).length
	assert.ok(later - first < 64, `record grew by ${later - first} bytes over 50 sends`)
})

test('§2.109 a recipient can still decrypt what we produce', async () => {
	const { repo } = makeRepo()
	const { repo: rx } = makeRepo()
	const { senderKeyDistributionMessage } = await repo.encryptGroupMessage({
		group: GROUP, data: Buffer.from('bootstrap'), meId: ME
	})
	await rx.processSenderKeyDistributionMessage({
		authorJid: ME,
		item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage }
	})
	for (const text of ['one', 'two', 'three']) {
		const { ciphertext } = await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from(text), meId: ME })
		const plain = await rx.decryptGroupMessage({ group: GROUP, authorJid: ME, msg: ciphertext })
		assert.equal(Buffer.from(plain).toString('utf8'), text)
	}
})

test('§2.109 messages that arrive out of order still decrypt', async () => {
	const { repo } = makeRepo()
	const { repo: rx } = makeRepo()
	const boot = await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('b'), meId: ME })
	await rx.processSenderKeyDistributionMessage({
		authorJid: ME,
		item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: boot.senderKeyDistributionMessage }
	})
	const sent = []
	for (const text of ['a', 'b', 'c', 'd']) {
		sent.push([text, (await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from(text), meId: ME })).ciphertext])
	}
	for (const [text, ciphertext] of [sent[3], sent[0], sent[2], sent[1]]) {
		const plain = await rx.decryptGroupMessage({ group: GROUP, authorJid: ME, msg: ciphertext })
		assert.equal(Buffer.from(plain).toString('utf8'), text)
	}
})

test('§2.109 the off-by-one is gone from the source', () => {
	const src = readFileSync(new URL('../lib/Signal/Group/group_cipher.js', import.meta.url), 'utf8')
	const code = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
	assert.doesNotMatch(code, /iteration === 0 \? 0 : iteration \+ 1/)
	assert.match(code, /this\.getSenderKey\(senderKeyState, iteration\)/)
})
