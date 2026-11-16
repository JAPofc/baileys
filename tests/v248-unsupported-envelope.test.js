// §2.90 — an envelope we cannot decrypt (msmsg) is acknowledged, logged with a real key,
// and surfaced as messages.decrypt-failed instead of vanishing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	buildUnsupportedEnvelopeEvent, UNSUPPORTED_ENVELOPE_ERROR_TEXT, DEFAULT_UNSUPPORTED_ENVELOPE_TYPES
} from '../lib/index.js'
import { decodeMessageNode } from '../lib/Utils/decode-wa-message.js'

const ME = '628111@s.whatsapp.net'
const ME_LID = '111111@lid'
const stanza = (attrs = {}, type = 'msmsg') => ({
	tag: 'message',
	attrs: { id: 'ABC123', from: '120363000@g.us', participant: '628999@s.whatsapp.net', t: '1767225600', ...attrs },
	content: [{ tag: 'enc', attrs: { type, v: '2' }, content: new Uint8Array([1, 2, 3]) }]
})

test('§2.90 the event carries the same key the normal decrypt path would use', () => {
	const node = stanza()
	const evt = buildUnsupportedEnvelopeEvent(node, ME, ME_LID, 'msmsg')
	const { fullMessage } = decodeMessageNode(node, ME, ME_LID)
	assert.equal(evt.key.id, fullMessage.key.id)
	assert.equal(evt.key.remoteJid, fullMessage.key.remoteJid)
	assert.equal(evt.key.participant, fullMessage.key.participant)
	assert.equal(evt.willRetry, false, 'we cannot decrypt it, so a retry receipt would loop')
	assert.equal(evt.error, `${UNSUPPORTED_ENVELOPE_ERROR_TEXT}: msmsg`)
	// the old diagnostic was literally empty
	assert.equal(node.attrs.key, undefined)
})

test('§2.90 a stanza the decoder cannot read still produces a usable key', () => {
	const broken = { tag: 'message', attrs: { id: 'X1', from: 'not-a-jid', participant: '628999@s.whatsapp.net' } }
	const evt = buildUnsupportedEnvelopeEvent(broken, ME, ME_LID, 'msmsg')
	assert.equal(evt.key.id, 'X1')
	assert.equal(evt.key.remoteJid, 'not-a-jid')
	assert.equal(evt.key.participant, '628999@s.whatsapp.net')
	assert.equal(evt.willRetry, false)
	assert.doesNotThrow(() => buildUnsupportedEnvelopeEvent(undefined, ME, ME_LID))
	assert.match(buildUnsupportedEnvelopeEvent(undefined, ME, ME_LID).error, /unknown$/)
})

test('§2.90 a 1:1 stanza keeps its direction', () => {
	const incoming = buildUnsupportedEnvelopeEvent(stanza({ from: '628999@s.whatsapp.net', participant: undefined }), ME, ME_LID)
	assert.equal(incoming.key.fromMe, false)
	const own = buildUnsupportedEnvelopeEvent(stanza({ from: ME, participant: undefined }), ME, ME_LID)
	assert.equal(own.key.fromMe, true, 'a stanza from our own number is fromMe')
})

test('§2.90 handleMessage emits the event, logs a real key, and still acks', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8')
	const branch = src.slice(src.indexOf('const handleMessage = async (node) => {'), src.indexOf('let acked = false;'))
	const code = branch.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.doesNotMatch(code, /key: node\.attrs\.key/, 'the empty diagnostic must be gone')
	assert.match(code, /buildUnsupportedEnvelopeEvent\(node, authState\.creds\.me\.id/)
	assert.match(code, /ev\.emit\('messages\.decrypt-failed', \[unsupportedEvt\]\)/)
	assert.match(code, /sendMessageAck\(node, NACK_REASONS\.MissingMessageSecret\)/, 'the ack must survive')
	assert.match(code, /unsupportedEnvelopeTypes\.includes\(encType\)/)
})

test('§2.90 which envelope types are skipped is configurable and typed', () => {
	assert.deepEqual(DEFAULT_UNSUPPORTED_ENVELOPE_TYPES, ['msmsg'])
	const src = readFileSync(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8')
	assert.match(src, /Array\.isArray\(config\.unsupportedEnvelopeTypes\)/)
	assert.match(src, /: DEFAULT_UNSUPPORTED_ENVELOPE_TYPES;/)
	const socketTypes = readFileSync(new URL('../lib/Types/Socket.d.ts', import.meta.url), 'utf8')
	assert.match(socketTypes, /unsupportedEnvelopeTypes\?: string\[\];/)
	const decodeTypes = readFileSync(new URL('../lib/Utils/decode-wa-message.d.ts', import.meta.url), 'utf8')
	assert.match(decodeTypes, /buildUnsupportedEnvelopeEvent/)
})
