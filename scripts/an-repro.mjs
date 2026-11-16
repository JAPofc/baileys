// §2.78 repro -- two app-state defects in lib/Utils/chat-utils.js
//
// (a) chatModificationToAppPatch() reads the "last message" of a chat as
//     `lastMessages[lastMessages.length - 1]`, i.e. it assumes the caller sorted the array
//     oldest-first. Stores hand you the newest message first (that is how a chat is rendered),
//     and nothing in the signature or the docs says otherwise. Get it "wrong" and the
//     clear/delete/archive range is stamped with the OLDEST timestamp in the list.
//
// (b) extractSyncdPatches() gives every version-less patch in a batch the SAME version
//     (collection version + 1), so applying N patches advances our bookkeeping by one.
import { chatModificationToAppPatch, extractSyncdPatches } from '../lib/index.js'
import { proto } from '../lib/index.js'

const jid = '628111@s.whatsapp.net'
const mk = (id, ts) => ({ key: { id, remoteJid: jid, fromMe: true }, messageTimestamp: ts })
const OLDEST = 1_700_000_000
const msgs = [mk('A', OLDEST), mk('B', OLDEST + 60), mk('C', OLDEST + 120)]

console.log('(a) chat has 3 messages, newest is C @', OLDEST + 120, '\n')
console.log('  order handed in            lastMessageTimestamp   verdict')
for (const [label, list] of [['oldest-first (A,B,C)', msgs], ['newest-first (C,B,A)', [...msgs].reverse()]]) {
	const patch = chatModificationToAppPatch({ clear: true, lastMessages: list }, jid)
	const ts = patch.syncAction.clearChatAction.messageRange.lastMessageTimestamp
	const verdict = ts === OLDEST + 120 ? 'ok' : `*** WRONG -- stamped the oldest message (${ts}) ***`
	console.log(`  ${label}       ${String(ts).padEnd(22)} ${verdict}`)
}

// (b) ------------------------------------------------------------------
const mkPatch = () => proto.SyncdPatch.encode(proto.SyncdPatch.fromObject({
	snapshotMac: Buffer.alloc(32), patchMac: Buffer.alloc(32), mutations: []
})).finish()

const node = {
	tag: 'iq',
	attrs: {},
	content: [{
		tag: 'sync',
		attrs: {},
		content: [{
			tag: 'collection',
			attrs: { name: 'regular_high', version: '41', has_more_patches: 'false' },
			content: [{
				tag: 'patches',
				attrs: {},
				content: [1, 2, 3].map(() => ({ tag: 'patch', attrs: {}, content: mkPatch() }))
			}]
		}]
	}]
}
const out = await extractSyncdPatches(node, {})
const versions = out.regular_high.patches.map(p => Number(p.version.version))
console.log('\n(b) collection is at version 41, server sent 3 version-less patches')
console.log('    versions assigned ->', versions.join(', '),
	versions.join() === '42,43,44' ? ' ok' : ' *** WRONG -- expected 42, 43, 44 ***')
console.log('    after applying all 3 we would record version', versions[versions.length - 1],
	'and re-request everything above it on the next resync')

// and when the server omits the collection version attribute entirely:
const noVersion = structuredClone(node)
delete noVersion.content[0].content[0].attrs.version
const out2 = await extractSyncdPatches(noVersion, {})
const raw = out2.regular_high.patches.map(p => (p.version == null ? 'unset' : String(p.version.version)))
console.log('\n(c) collection node with no `version` attr -> patch versions:', raw.join(', '))
console.log('    BEFORE: NaN, NaN, NaN -- written straight into the patch, then into the stored state version')
console.log('    AFTER : left unset + a logger warning, so the sync layer can fall back to a snapshot')
