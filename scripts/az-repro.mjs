// §2.94 repro -- accepting a group/community invite that arrived in a GROUP records (and
// tells the server) the wrong inviter, and writes our whole credential object into the
// message store.
//
//   admin: key.remoteJid                                   // ← the CHAT the invite came from
//   participant: key.remoteJid                             // ← same mistake in the stub
//   messageStubParameters: [JSON.stringify(authState.creds.me)]   // ← not a jid at all
//
// When the invite arrives in a 1:1 chat, `remoteJid` happens to be the inviter, which is why
// nobody noticed. Forwarded into a group, `remoteJid` is the group jid.
import { makeAcceptInvite } from '../tests/helpers/invite-accept.mjs'

const INVITE = { groupJid: '120999@g.us', inviteCode: 'CODE', inviteExpiration: 1_999_999_999 }
const INVITER = '628999@s.whatsapp.net'

const show = async (kind, label, key) => {
	const { accept, queries, upserts } = makeAcceptInvite(kind)
	await accept(key, { ...INVITE })
	const stub = upserts[0].msg
	console.log(`  ${kind.padEnd(10)} ${label.padEnd(26)} admin=${queries[0].content[0].attrs.admin}`)
	console.log(`  ${''.padEnd(10)} ${''.padEnd(26)} participant=${stub.key.participant}`)
	console.log(`  ${''.padEnd(10)} ${''.padEnd(26)} stubParams=${JSON.stringify(stub.messageStubParameters).slice(0, 70)}`)
}

console.log(`the inviter is ${INVITER}\n`)
await show('group', 'invite in a 1:1 chat', { id: 'M1', remoteJid: INVITER })
await show('group', 'invite inside a group', { id: 'M2', remoteJid: '120363@g.us', participant: INVITER })
await show('community', 'invite inside a group', { id: 'M3', remoteJid: '120363@g.us', participant: INVITER })
