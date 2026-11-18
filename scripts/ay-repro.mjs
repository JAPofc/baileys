// §2.93 repro -- the group sender-key memory is persisted BEFORE the stanza is sent, so a
// send that fails leaves the session permanently believing every device already has the key.
//
// In relayMessage()'s group branch:
//
//   senderKeyMap[deviceJid] = true                                  // mark as distributed
//   ...
//   await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } })   // PERSISTED
//   ...                                                              // (100 lines later)
//   await sendNode(stanza)                                           // ← can still throw
//
// If the socket drops between those two points, the SKDM never reached anybody, but the next
// send sees `hasKey` for every device and distributes nothing -- so the group cannot decrypt
// our messages until the sender key happens to rotate.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
const lines = src.split('\n')
const markAt = lines.findIndex(l => /senderKeyMap\[deviceJid\] = true/.test(l))
const persistAt = lines.findIndex(l => /'sender-key-memory': \{/.test(l))
const sendAt = lines.findIndex(l => l.includes('await sendNode(stanza);') && lines.indexOf(l) > markAt)
console.log(`  mark devices as "has key" : line ${markAt + 1}`)
console.log(`  await sendNode(stanza)    : line ${sendAt + 1}`)
console.log(`  persist sender-key-memory : line ${persistAt + 1}  ` +
	`${persistAt < sendAt ? '← *** BEFORE the send ***' : '✔ after the send'}\n`)

// what that ordering costs, played out against a fake key store
const simulate = async (persistBeforeSend) => {
	const store = { 'sender-key-memory': {} }
	const keys = {
		get: async (type, ids) => ({ [ids[0]]: store[type][ids[0]] }),
		set: async data => { Object.assign(store['sender-key-memory'], data['sender-key-memory']) }
	}
	const GROUP = '120363000@g.us'
	const devices = ['628a@s.whatsapp.net:0', '628b@s.whatsapp.net:0']
	let distributed = 0

	const attempt = async ({ failSend }) => {
		const memory = (await keys.get('sender-key-memory', [GROUP]))[GROUP] || {}
		const recipients = devices.filter(d => !memory[d])
		for (const d of recipients) memory[d] = true
		if (recipients.length) distributed++
		if (persistBeforeSend) await keys.set({ 'sender-key-memory': { [GROUP]: memory } })
		if (failSend) throw new Error('connection closed mid-send')
		if (!persistBeforeSend) await keys.set({ 'sender-key-memory': { [GROUP]: memory } })
		return recipients
	}

	await attempt({ failSend: true }).catch(() => {})       // first send dies on the wire
	const second = await attempt({ failSend: false })        // user retries
	return { distributed, secondAttemptRecipients: second.length }
}

for (const [label, before] of [['BEFORE (persist, then send)', true], ['AFTER  (send, then persist)', false]]) {
	const r = await simulate(before)
	console.log(`  ${label}  retry distributes the sender key to ${r.secondAttemptRecipients} device(s) ` +
		`${r.secondAttemptRecipients === 0 ? '← *** group can never decrypt ***' : '✔'}`)
}
