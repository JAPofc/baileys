// §2.110 — a skipped (out-of-order) group message key cannot be replayed from the store.
// sender-key records are persisted with a plain JSON.stringify, so each seed returns as
// { type: 'Buffer', data: [...] }. SenderChainKey wraps its seed in Buffer.from(); the
// per-message key did not, so replaying a skipped key threw and the message was lost.
// Run: node scripts/bn-repro.mjs
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

// what the store actually hands back
const roundTripped = JSON.parse(JSON.stringify({ seed: Buffer.alloc(32, 7) })).seed
console.log('a seed as it comes back out of the auth store:', JSON.stringify(roundTripped).slice(0, 48) + '…')
try {
	new SenderMessageKey(3, roundTripped)
	console.log('  SenderMessageKey accepts it            : yes (fixed)')
} catch (err) {
	console.log('  SenderMessageKey accepts it            : NO →', err.message)
}

const { repo: tx } = makeRepo(SENDER)
const { repo: rx } = makeRepo('628222:0@s.whatsapp.net')
const boot = await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from('boot'), meId: SENDER })
await rx.processSenderKeyDistributionMessage({
	authorJid: SENDER,
	item: { groupId: GROUP, axolotlSenderKeyDistributionMessage: boot.senderKeyDistributionMessage }
})

const wire = []
for (const text of ['one', 'two', 'three']) {
	wire.push([text, (await tx.encryptGroupMessage({ group: GROUP, data: Buffer.from(text), meId: SENDER })).ciphertext])
}

// delivered out of order: "three" first, then the two it jumped over
for (const [text, ciphertext] of [wire[2], wire[0], wire[1]]) {
	try {
		const plain = await rx.decryptGroupMessage({ group: GROUP, authorJid: SENDER, msg: ciphertext })
		console.log(`  decrypt "${text}" (out of order)         : ${Buffer.from(plain).toString('utf8') === text ? 'OK' : 'WRONG PLAINTEXT'}`)
	} catch (err) {
		console.log(`  decrypt "${text}" (out of order)         : FAILED → ${err.message}`)
	}
}
