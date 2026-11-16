// §2.90 repro -- an `msmsg` envelope is dropped invisibly, and the one log line it produces
// is empty.
//
// handleMessage() short-circuits on `<enc type="msmsg">`:
//
//   logger.debug({ key: node.attrs.key }, 'ignored msmsg')
//   await sendMessageAck(node, NACK_REASONS.MissingMessageSecret)
//   return
//
// `key` is NOT an attribute of a message stanza (the stanza has id/from/participant/t), so
// the debug line is literally `{}` -- and unlike EVERY other undecryptable message, no
// CIPHERTEXT stub and no `messages.decrypt-failed` event is produced, so the app cannot even
// count how many messages it is losing.
import { buildUnsupportedEnvelopeEvent, decodeMessageNode } from '../lib/Utils/decode-wa-message.js'

const ME = '628111@s.whatsapp.net'
const ME_LID = '111111@lid'

const stanza = {
	tag: 'message',
	attrs: { id: 'ABC123', from: '120363000@g.us', participant: '628999@s.whatsapp.net', t: '1767225600' },
	content: [{ tag: 'enc', attrs: { type: 'msmsg', v: '2' }, content: new Uint8Array([1, 2, 3]) }]
}

console.log('a group message arrives with <enc type="msmsg">\n')

console.log('  BEFORE')
console.log('    debug log payload :', JSON.stringify({ key: stanza.attrs.key }), ' ← always empty')
console.log('    events emitted    : 0 (silently dropped)')

const event = buildUnsupportedEnvelopeEvent(stanza, ME, ME_LID, 'msmsg')
const { fullMessage } = decodeMessageNode(stanza, ME, ME_LID)
console.log('\n  AFTER')
console.log('    log/event key     :', JSON.stringify(event.key))
console.log('    event             :', JSON.stringify({ error: event.error, willRetry: event.willRetry }))
console.log('    matches the key the normal decrypt path would use?',
	event.key.id === fullMessage.key.id && event.key.remoteJid === fullMessage.key.remoteJid)
