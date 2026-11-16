// §2.92 repro -- the group-invite thumbnail cache exists, but nothing ever hands it to the
// message builder, so `//TODO: CACHE` in messages-send.js is still unanswered in practice.
//
// `fetchGroupInviteThumbnail()` takes `options.groupInviteThumbnailCache` and memoises both
// a found icon and a known-iconless group. `sendMessage()` builds its generateWAMessage
// options with `getProfilePicUrl: sock.profilePictureUrl` and a `//TODO: CACHE` right above
// it -- and never passes a cache. So every single invite re-queries the server (and, for a
// group with no icon, pays a failing 404 round-trip every time).
import { readFileSync } from 'node:fs'
import { generateWAMessage, createGroupInviteThumbnailCache } from '../lib/index.js'

const JID = '628@s.whatsapp.net'
const GROUP = '120363000@g.us'

const invite = { groupInvite: { jid: GROUP, inviteCode: 'abc', inviteExpiration: 1_999_999_999, groupName: 'JAP', caption: 'join' } }

const run = async (label, cache) => {
	let queries = 0
	const options = {
		upload: async () => ({}),
		getProfilePicUrl: async () => { queries++; return undefined }, // group with no icon
		...(cache ? { groupInviteThumbnailCache: cache } : {})
	}
	for (let i = 0; i < 5; i++) {
		await generateWAMessage(JID, invite, options)
	}
	console.log(`  ${label.padEnd(44)} ${queries} profile-pic queries for 5 invites`)
}

const socketSrc = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
const wired = /groupInviteThumbnailCache/.test(socketSrc)
console.log(`does sendMessage() pass a cache? ${wired ? 'yes' : '*** NO ***'}\n`)

await run('BEFORE (what the socket actually does)', undefined)
await run('AFTER  (one cache owned by the socket)', createGroupInviteThumbnailCache())
