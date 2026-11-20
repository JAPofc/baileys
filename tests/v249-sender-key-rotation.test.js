// §2.108 — a group membership change must ROTATE our outgoing sender key, not merely clear
// the "who already got it" bookkeeping. Clearing only the memory re-distributes the *same*
// key, so a member that was just removed keeps decrypting everything that follows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'

const GROUP = '120363000000000000@g.us'
const ME = '628111:0@s.whatsapp.net'

const makeAuth = () => {
	const store = {}
	const keys = {
		get: async (type, ids) => Object.fromEntries(ids.map(id => [id, store[type]?.[id]])),
		set: async data => {
			for (const type of Object.keys(data)) {
				store[type] = store[type] || {}
				for (const [id, value] of Object.entries(data[type])) {
					if (value === null || value === undefined) delete store[type][id]
					else store[type][id] = value
				}
			}
		},
		transaction: async work => work(),
		isInTransaction: () => false
	}
	return { store, auth: { creds: { me: { id: ME } }, keys } }
}

const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return silent } }

const keyIds = store => Object.values(store['sender-key'] || {})
	.flatMap(raw => JSON.parse(Buffer.from(raw).toString('utf8')).map(st => st.senderKeyId))

test('§2.108 rotateSenderKey() drops the record so the next send mints a new key', async () => {
	const { store, auth } = makeAuth()
	const repo = makeLibSignalRepository(auth, silent)

	await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('one'), meId: ME })
	const before = keyIds(store)
	assert.equal(before.length, 1, 'expected exactly one sender-key state after the first send')

	// clearing only the bookkeeping bucket is NOT a rotation
	await auth.keys.set({ 'sender-key-memory': { [GROUP]: null } })
	await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('two'), meId: ME })
	assert.deepEqual(keyIds(store), before, 'sender-key-memory alone must not change the key')

	const res = await repo.rotateSenderKey({ group: GROUP, meId: ME })
	assert.equal(res.rotated, true)
	assert.equal(res.senderKeyId, `${GROUP}::628111::0`)
	assert.equal(Object.keys(store['sender-key']).length, 0, 'the key record should be gone')

	await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('three'), meId: ME })
	const after = keyIds(store)
	assert.equal(after.length, 1)
	assert.notDeepEqual(after, before, 'the next send must use a freshly minted sender key')
})

test('§2.108 rotateSenderKey() is a no-op when there is no key yet', async () => {
	const { auth } = makeAuth()
	const repo = makeLibSignalRepository(auth, silent)
	assert.deepEqual(await repo.rotateSenderKey({ group: GROUP, meId: ME }), {
		rotated: false,
		senderKeyId: `${GROUP}::628111::0`
	})
})

test('§2.108 the membership-change handler rotates the key, not just the memory', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8')
	const i = src.indexOf("'sender-key-memory': { [groupJid]: null }")
	assert.ok(i > 0, 'could not locate the membership-change invalidation')
	const window = src.slice(i, i + 1600)
	assert.match(window, /signalRepository\.rotateSenderKey\(\{ group: groupJid, meId/)
	assert.match(window, /creds\.me\?\.lid \|\| authState\.creds\.me\?\.id/)
})

test('§2.108 rotateGroupSenderKey() is exposed on the socket and refuses non-group jids', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	assert.match(src, /rotateGroupSenderKey: async \(jid\) => \{/)
	assert.match(src, /rotateGroupSenderKey: pass a group jid/)
	for (const file of ['index', 'messages-send']) {
		const dts = readFileSync(new URL(`../lib/Socket/${file}.d.ts`, import.meta.url), 'utf8')
		assert.match(dts, /rotateGroupSenderKey: \(jid: string\) => Promise<\{ rotated: boolean \}>/, file)
	}
})
