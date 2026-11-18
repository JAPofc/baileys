// §2.83 repro -- album messages: an unsupported entry is only caught HALFWAY THROUGH sending.
//
// generateWAMessage() counts images and videos to fill albumMessage.expectedImageCount /
// expectedVideoCount, and silently ignores every other entry: a document, an audio note, a
// typo'd key. The per-item check (hasValidAlbumMedia) only runs inside the send loop, after
// the album header and the earlier items have already been relayed -- so the chat is left
// with a half-built album and the caller gets a 400 for a message that was partly delivered.
import { generateWAMessage, hasValidAlbumMedia, normalizeMessageContent } from '../lib/index.js'

const OPTS = { upload: async () => ({ mediaUrl: 'https://x/u', directPath: '/u' }), logger: undefined }
const JID = '628@s.whatsapp.net'
const img = { image: Buffer.alloc(16), mimetype: 'image/jpeg' }
const vid = { video: Buffer.alloc(16), mimetype: 'video/mp4' }
const doc = { document: Buffer.alloc(16), mimetype: 'application/pdf', fileName: 'a.pdf' }

const build = async album => {
	try {
		const msg = await generateWAMessage(JID, { album }, OPTS)
		return { header: msg.message.albumMessage }
	} catch (err) {
		return { error: err.message }
	}
}

// the send loop, as it exists in lib/Socket/messages-send.js
const replaySend = async (album, { delayMs = 1500, skipLastDelay = false } = {}) => {
	const relayed = []
	let waited = 0
	let error = null
	for (const media of album) {
		const m = await generateWAMessage(JID, media, OPTS).catch(e => ({ error: e }))
		if (m.error) { error = m.error.message; break }
		if (!hasValidAlbumMedia(normalizeMessageContent(m.message))) {
			error = 'Invalid message type for album'
			break
		}
		relayed.push(Object.keys(m.message)[0])
		if (!(skipLastDelay && relayed.length === album.length)) {
			waited += delayMs
		}
	}
	return { relayed, waited, error }
}

console.log('album built from 3 entries, the last one a PDF:\n')
const header = await build([img, img, doc])
console.log('  header says        :', JSON.stringify(header.header ?? header.error))
const sent = await replaySend([img, img, doc])
console.log('  BEFORE             : header built fine, then relayed', sent.relayed.join(', '),
	'and failed with', JSON.stringify(sent.error))
console.log('                       -> header + 2 items already in the chat, nothing rolls back')
console.log('  AFTER              :', header.error ? 'rejected before anything is sent' : '???', '\n')

console.log('and a perfectly valid 3-item album:')
const before = await replaySend([img, vid, img])
const after = await replaySend([img, vid, img], { skipLastDelay: true })
console.log(`  BEFORE: ${before.waited} ms of pacing for ${before.relayed.length} items ` +
	'(*** a full delay after the LAST item, for nothing ***)')
console.log(`  AFTER : ${after.waited} ms — pacing only BETWEEN items`)
