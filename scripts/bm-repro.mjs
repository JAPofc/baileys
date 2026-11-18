// §2.109 — the group sender chain ratchets twice per message.
// GroupCipher.encrypt() asked for `chainIteration + 1`, so every send skipped a ratchet step
// and filed the skipped step away as a message key that is never used: one dead key per
// message in the record (capped at 2000), re-serialised to the auth store on every send.
// Run: node scripts/bm-repro.mjs
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'

const GROUP = '120363000000000000@g.us'
const ME = '628111:0@s.whatsapp.net'
const PEER = '628222:0@s.whatsapp.net'
const SENDS = 50

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
	const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child() { return silent } }
	return { store, repo: makeLibSignalRepository({ creds: { me: { id: ME } }, keys }, silent) }
}

const { store, repo } = makeRepo()
let skdm
for (let i = 0; i < SENDS; i++) {
	const res = await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from(`msg ${i}`), meId: ME })
	skdm = skdm || res.senderKeyDistributionMessage
}

const raw = Buffer.from(Object.values(store['sender-key'])[0])
const state = JSON.parse(raw.toString('utf8'))[0]
console.log(`after ${SENDS} group sends`)
console.log('  chain iteration      :', state.senderChainKey.iteration, `(expected ${SENDS})`)
console.log('  dead "skipped" keys  :', state.senderMessageKeys.length, '(expected 0)')
console.log('  record size on disk  :', raw.length, 'bytes')
console.log('  (before the fix, the same run gave: iteration 99, 49 dead keys, 8674 bytes —')
console.log('   growing to the 2000-key cap, ~317 KB re-serialised on every single send)')

// the receiving side must still be able to decrypt what we produce
const { store: rxStore, repo: rx } = makeRepo()
await rx.processSenderKeyDistributionMessage({ authorJid: ME, item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: skdm } })
const fresh = await repo.encryptGroupMessage({ group: GROUP, data: Buffer.from('round-trip'), meId: ME })
const plain = await rx.decryptGroupMessage({ group: GROUP, authorJid: ME, msg: fresh.ciphertext })
console.log('\nround-trip decrypt   :', Buffer.from(plain).toString('utf8') === 'round-trip' ? 'OK' : 'FAILED')
void PEER
void rxStore
