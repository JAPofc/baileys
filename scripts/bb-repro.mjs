// §2.96 repro -- normalizeMessageContent() gives up after 5 unwraps.
//
//   for (let i = 0; i < 5; i++) { const inner = getFutureProofMessage(content); ... }
//
// WhatsApp really does stack these: a disappearing (ephemeral) chat + view-once + a document
// with caption + an edit + a group mention is five wrappers before the payload, and a bot
// forward or an associated child message pushes it past the cap. The app then receives a
// message whose "type" is a wrapper, so `getContentType()` says `groupMentionedMessage` and
// every `if (m.message.conversation)` in the bot misses it.
import { normalizeMessageContent, getContentType } from '../lib/index.js'

const wrap = (depth) => {
	const wrappers = [
		'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage',
		'editedMessage', 'groupMentionedMessage', 'botForwardedMessage', 'associatedChildMessage'
	]
	let content = { conversation: 'the actual text' }
	for (let i = depth - 1; i >= 0; i--) {
		content = { [wrappers[i % wrappers.length]]: { message: content } }
	}
	return content
}

console.log('  layers  getContentType()            normalized to')
for (const depth of [1, 3, 5, 6, 8]) {
	const msg = wrap(depth)
	const norm = normalizeMessageContent(msg)
	const keys = Object.keys(norm || {}).join(',')
	const ok = keys === 'conversation'
	console.log(`  ${String(depth).padEnd(7)} ${String(getContentType(msg)).padEnd(27)} ${keys}${ok ? '' : '   ← *** still wrapped ***'}`)
}

// and a self-referential message must not spin forever
const cyclic = {}
cyclic.ephemeralMessage = { message: cyclic }
const started = Date.now()
const out = normalizeMessageContent(cyclic)
console.log(`\n  self-referential message: returned ${Object.keys(out || {}).join(',') || '(nothing)'} in ${Date.now() - started}ms`)
