// §2.108 repro -- removing someone from a group does NOT rotate our group sender key.
//
// On a membership change we clear the `sender-key-memory` bucket, which only records *who has
// already been given the key*. The key itself lives in the `sender-key` bucket and is left
// untouched, so the next send re-distributes the SAME key — the member we just removed can keep
// decrypting everything the group sends afterwards. Our own code comment claims the opposite.
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'

const GROUP = '120363000000000000@g.us'
const ME = '628111:0@s.whatsapp.net'

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
	transaction: async fn => fn(),
	isInTransaction: () => false
}
const logger = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return logger } }
const repo = makeLibSignalRepository({ creds: { me: { id: ME } }, keys }, logger)

const senderKeyIds = () => Object.keys(store['sender-key'] || {})
// identify the key itself: its keyId + signing key, not the ratcheting chain state
const keyIdentity = () => {
	const raw = Object.values(store['sender-key'] || {})[0]
	if (!raw) return '(none)'
	const states = JSON.parse(Buffer.from(raw).toString('utf8'))
	return states.map(st => `keyId=${st.senderKeyId}`).join(' | ')
}

await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('hello'), meId: ME })
console.log('after first group send')
console.log('  sender-key records :', senderKeyIds().length, senderKeyIds()[0])
const before = keyIdentity()
console.log('  key identity       :', before)

// === what messages-recv.js does today when a participant is removed ===
await keys.set({ 'sender-key-memory': { [GROUP]: null } })

await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('after removal'), meId: ME })
const after = keyIdentity()

console.log('\nafter "someone was removed" + the next send')
console.log('  sender-key records :', senderKeyIds().length)
console.log('  key identity       :', after)
console.log('  same key as before?:', before === after, before === after ? '← *** NOT rotated: the removed member can still decrypt everything that follows ***' : '(rotated)')

// === what the fix does ===
const res = await repo.rotateSenderKey({ group: GROUP, meId: ME })
console.log('\nrepo.rotateSenderKey():', JSON.stringify(res))
await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('rotated'), meId: ME })
console.log('  key identity now   :', keyIdentity(), '(record dropped → next send mints a new key)')
repo.close()
