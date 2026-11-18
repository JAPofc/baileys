// §2.89 — plaintext channel posts: real timestamp, correct fromMe, and a newsletter.message event.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { proto } from '../lib/index.js'
import { makeNewsletterHandler } from './helpers/newsletter-notification.mjs'

const ME = '628111@s.whatsapp.net'
const MY_LID = '111111@lid'
const NEWSLETTER = '12345@newsletter'
const T = 1_767_225_600

const notification = ({ t = String(T), participant, childT, serverId = '100', text = 'channel post' } = {}) => ({
	tag: 'notification',
	attrs: { from: NEWSLETTER, type: 'newsletter', ...(t ? { t } : {}), ...(participant ? { participant } : {}) },
	content: [{
		tag: 'message',
		attrs: { message_id: '100', ...(serverId ? { server_id: serverId } : {}), ...(childT ? { t: childT } : {}) },
		content: [{
			tag: 'plaintext',
			attrs: {},
			content: proto.Message.encode(proto.Message.fromObject({ conversation: text })).finish()
		}]
	}]
})

test('§2.89 the post keeps the notification timestamp instead of landing in 1970', async () => {
	const { handle, upserts } = makeNewsletterHandler({ me: ME })
	await handle(notification())
	assert.equal(upserts.length, 1)
	assert.equal(Number(upserts[0].msg.messageTimestamp), T)
	assert.equal(upserts[0].type, 'append')
	assert.equal(upserts[0].msg.message.conversation, 'channel post')
})

test('§2.89 a timestamp on the child still wins, and a missing one falls back to now', async () => {
	const child = makeNewsletterHandler({ me: ME })
	await child.handle(notification({ childT: String(T + 60) }))
	assert.equal(Number(child.upserts[0].msg.messageTimestamp), T + 60)

	const none = makeNewsletterHandler({ me: ME })
	await none.handle(notification({ t: null }))
	const ts = Number(none.upserts[0].msg.messageTimestamp)
	const now = Math.floor(Date.now() / 1000)
	assert.ok(ts > now - 5 && ts <= now + 1, `expected ~now, got ${ts}`)
	assert.notEqual(ts, 0, 'a missing timestamp must never become 1970')
})

test('§2.89 our own channel posts are marked fromMe (PN and LID)', async () => {
	const other = makeNewsletterHandler({ me: ME })
	await other.handle(notification({ participant: '628999@s.whatsapp.net' }))
	assert.equal(other.upserts[0].msg.key.fromMe, false)
	assert.equal(other.upserts[0].msg.key.participant, '628999@s.whatsapp.net')

	const mine = makeNewsletterHandler({ me: ME })
	await mine.handle(notification({ participant: ME }))
	assert.equal(mine.upserts[0].msg.key.fromMe, true)

	const viaLid = makeNewsletterHandler({ me: ME, lid: MY_LID })
	await viaLid.handle(notification({ participant: MY_LID }))
	assert.equal(viaLid.upserts[0].msg.key.fromMe, true)

	// no participant attribute at all → we must not guess
	const anonymous = makeNewsletterHandler({ me: ME })
	await anonymous.handle(notification())
	assert.equal(anonymous.upserts[0].msg.key.fromMe, false)
	assert.equal(anonymous.upserts[0].msg.key.participant, undefined)
})

test('§2.89 a newsletter.message event carries the server id the upsert cannot', async () => {
	const { handle, events, upserts } = makeNewsletterHandler({ me: ME })
	await handle(notification({ participant: ME }))
	const emitted = events.filter(e => e.event === 'newsletter.message')
	assert.equal(emitted.length, 1)
	assert.deepEqual(
		{ ...emitted[0].data, message: undefined, key: undefined },
		{ id: NEWSLETTER, server_id: '100', fromMe: true, author: ME, timestamp: T, message: undefined, key: undefined }
	)
	assert.equal(emitted[0].data.message.conversation, 'channel post')
	assert.equal(emitted[0].data.key.id, upserts[0].msg.key.id)
	// the event is typed
	const events_dts = readFileSync(new URL('../lib/Types/Events.d.ts', import.meta.url), 'utf8')
	assert.match(events_dts, /'newsletter\.message':/)
})

test('§2.89 a malformed plaintext payload is logged, not thrown', async () => {
	const { handle, upserts, logs } = makeNewsletterHandler({ me: ME })
	const bad = notification()
	bad.content[0].content[0].content = Buffer.from([0xff, 0xff, 0xff, 0xff])
	await assert.doesNotReject(() => handle(bad))
	assert.equal(upserts.length, 0)
	assert.ok(logs.some(line => line[0] === 'error'))
})

test('§2.89 the source no longer reads the timestamp off the child alone', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8')
	const block = src.slice(src.indexOf('const handleNewsletterNotification'), src.indexOf('const sendMessageAck'))
	const code = block.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.doesNotMatch(code, /messageTimestamp: \+child\.attrs\.t/)
	assert.doesNotMatch(code, /fromMe: false/)
	assert.match(code, /node\.attrs\.t/)
})
