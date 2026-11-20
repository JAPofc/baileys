// §2.97 — tc-token clock agreement, plus the JID/label/scheduled-call/media extras.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	proto,
	isTcTokenExpired, shouldSendNewTcToken, toTcTokenSeconds, TC_TOKEN_INDEX_KEY, readTcTokenIndex,
	validateJid, isValidJid, assertJid, assertLid, toJid, jidKind,
	isJidLocationBroadcast, LOCATION_BROADCAST_JID, VALID_JID_SERVERS,
	buildMemberLabelMessage, MEMBER_LABEL_MAX_LENGTH,
	makeScheduledCallCreationMessage, makeScheduledCallEditMessage, readScheduledCall,
	videoToJpeg, convertToOpusBuffer,
	processContactAction, emitSyncActionResults
} from '../lib/index.js'

const roundTrip = content => proto.Message.decode(proto.Message.encode(proto.Message.fromObject(content)).finish()).toJSON()
const now = () => Math.floor(Date.now() / 1000)

test('§2.97 both halves of the tc-token clock agree on an unreadable timestamp', () => {
	const unreadable = [Number.NaN, { low: 1700000000, high: 0, unsigned: false }, 1700000000n, 'yesterday', {}, [], null, undefined]
	for (const value of unreadable) {
		assert.equal(isTcTokenExpired(value), true, `isTcTokenExpired(${String(value)})`)
		assert.equal(shouldSendNewTcToken(value), true, `shouldSendNewTcToken(${String(value)}) must refresh, not skip`)
	}
	// a fresh timestamp is still fresh, in every shape it can arrive in
	for (const fresh of [now(), String(now()), Date.now(), new Date(), BigInt(now())]) {
		assert.equal(isTcTokenExpired(fresh), false, `isTcTokenExpired(${String(fresh)})`)
		assert.equal(shouldSendNewTcToken(fresh), false, `shouldSendNewTcToken(${String(fresh)})`)
	}
	// and an genuinely old one still expires
	const old = now() - 60 * 24 * 3600
	assert.equal(isTcTokenExpired(old), true)
	assert.equal(shouldSendNewTcToken(old), true)
})

test('§2.97 toTcTokenSeconds reads every shape a store can return', () => {
	assert.equal(toTcTokenSeconds(1700000000), 1700000000)
	assert.equal(toTcTokenSeconds(1700000000000), 1700000000, 'milliseconds are scaled down')
	assert.equal(toTcTokenSeconds('1700000000'), 1700000000)
	assert.equal(toTcTokenSeconds(1700000000n), 1700000000)
	assert.equal(toTcTokenSeconds(new Date(1700000000000)), 1700000000)
	assert.equal(toTcTokenSeconds({ low: 1700000000, high: 0, unsigned: false }), 1700000000)
	assert.equal(toTcTokenSeconds({ toNumber: () => 1700000000 }), 1700000000)
	for (const junk of [null, undefined, Number.NaN, 0, -5, 'nope', {}, []]) {
		assert.equal(toTcTokenSeconds(junk), null, String(junk))
	}
})

test('§2.97 the tc-token index is readable through the public API', async () => {
	const keys = { get: async (type, ids) => ({ [ids[0]]: { token: Buffer.from(JSON.stringify(['1@lid', TC_TOKEN_INDEX_KEY])) } }) }
	assert.deepEqual(await readTcTokenIndex(keys), ['1@lid'], 'the sentinel key must never be returned as a jid')
	assert.deepEqual(await readTcTokenIndex({ get: async () => ({}) }), [])
	assert.deepEqual(await readTcTokenIndex({ get: async (t, ids) => ({ [ids[0]]: { token: Buffer.from('not json') } }) }), [])
})

test('§2.97 JID validation is strict and explains itself', () => {
	assert.deepEqual(validateJid('628123456@s.whatsapp.net'), { valid: true, reason: null })
	assert.equal(validateJid('abc@nope.server').reason, 'unknown server "nope.server"')
	assert.equal(validateJid('12@s.whatsapp.net').reason, 'phone JIDs must be 5–16 digits')
	assert.equal(validateJid('@s.whatsapp.net').reason, 'empty user part')
	assert.equal(validateJid('no-at-sign').reason, 'no @server part')
	assert.equal(validateJid(42).reason, 'not a string')
	assert.equal(isValidJid('120363@g.us'), true)
	assert.ok(VALID_JID_SERVERS.includes('newsletter'))
	assert.equal(assertJid('628123456:7@s.whatsapp.net'), '628123456@s.whatsapp.net')
	assert.throws(() => assertJid('bad'), /not a valid JID/)
	assert.equal(assertLid('111:3@lid'), '111@lid')
	assert.throws(() => assertLid('628@s.whatsapp.net'), /not a @lid/)
})

test('§2.97 toJid and jidKind cover every chat type', () => {
	assert.equal(toJid('+62 812 3456 7890'), '6281234567890@s.whatsapp.net')
	assert.equal(toJid('628@s.whatsapp.net'), '628@s.whatsapp.net')
	assert.equal(toJid('111', 'lid'), '111@lid')
	assert.equal(toJid({ user: '628', server: 'lid' }), '628@lid')
	assert.throws(() => toJid(''), /nothing to build/)
	assert.throws(() => toJid('abc'), /has no digits/)
	assert.deepEqual(
		['120@g.us', '1@newsletter', LOCATION_BROADCAST_JID, 'status@broadcast', '123@broadcast', '1@lid', '628@s.whatsapp.net', 'what@ever'].map(jidKind),
		['group', 'newsletter', 'location', 'status', 'broadcast', 'lid', 'user', 'unknown']
	)
	assert.equal(isJidLocationBroadcast(LOCATION_BROADCAST_JID), true)
	assert.equal(isJidLocationBroadcast('status@broadcast'), false)
})

test('§2.97 member labels and scheduled calls encode as real proto messages', () => {
	const label = buildMemberLabelMessage('Admin')
	assert.equal(roundTrip(label).protocolMessage.type, 'GROUP_MEMBER_LABEL_CHANGE')
	assert.equal(roundTrip(label).protocolMessage.memberLabel.label, 'Admin')
	assert.equal(roundTrip(buildMemberLabelMessage('')).protocolMessage.memberLabel?.label ?? '', '')
	// JAP@Note (Batch CL): this pinned the literal "25" while three other code paths cut the
	// same field at 30 (§2.203). Assert against the exported constant so the test tracks the
	// library's own number instead of freezing one module's disagreement with its siblings.
	assert.throws(
		() => buildMemberLabelMessage('x'.repeat(MEMBER_LABEL_MAX_LENGTH + 1)),
		new RegExp(`at most ${MEMBER_LABEL_MAX_LENGTH} characters`)
	)
	assert.doesNotThrow(() => buildMemberLabelMessage('x'.repeat(MEMBER_LABEL_MAX_LENGTH)))

	const at = Date.now() + 3_600_000
	const call = makeScheduledCallCreationMessage({ title: 'Standup', at, callType: 'video' })
	assert.equal(roundTrip(call).scheduledCallCreationMessage.callType, 'VIDEO')
	assert.deepEqual(readScheduledCall({ message: call }), { title: 'Standup', at, callType: 'video' })
	assert.equal(readScheduledCall({ message: { conversation: 'x' } }), null)
	assert.throws(() => makeScheduledCallCreationMessage({ title: '', at }), /"title" is required/)
	assert.throws(() => makeScheduledCallCreationMessage({ title: 'x', at: Date.now() - 1000 }), /in the past/)
	assert.throws(() => makeScheduledCallCreationMessage({ title: 'x', at, callType: 'hologram' }), /unknown callType/)

	const cancel = makeScheduledCallEditMessage({ id: 'CALL1' })
	assert.equal(roundTrip(cancel).scheduledCallEditMessage.editType, 'CANCEL')
	assert.throws(() => makeScheduledCallEditMessage({}), /message key \(with an id\) is required/)
	assert.throws(() => makeScheduledCallEditMessage({ id: 'x' }, { editType: 'reschedule' }), /unknown editType/)
})

test('§2.97 the ffmpeg helpers validate input and fail with a readable reason', async () => {
	await assert.rejects(videoToJpeg(undefined), /pass a file path/)
	await assert.rejects(convertToOpusBuffer(undefined), /Buffer or a file path/)
	// with ffmpeg absent the error must name ffmpeg, not explode somewhere obscure
	await assert.rejects(
		convertToOpusBuffer(Buffer.from([0, 1, 2])),
		err => /ffmpeg/i.test(String(err?.message)),
		'the failure must mention ffmpeg'
	)
})

test('§2.97 the sync-action helpers are reachable from the package root', () => {
	assert.equal(typeof processContactAction, 'function')
	assert.equal(typeof emitSyncActionResults, 'function')
	const results = processContactAction({ fullName: 'Budi', lidJid: '111@lid' }, '628@s.whatsapp.net')
	assert.equal(results[0].event, 'contacts.upsert')
	assert.equal(results[0].data[0].name, 'Budi')
	assert.equal(results[1].event, 'lid-mapping.update')
	const emitted = []
	emitSyncActionResults({ emit: (event, data) => emitted.push({ event, data }) }, results)
	assert.deepEqual(emitted.map(e => e.event), ['contacts.upsert', 'lid-mapping.update'])
	assert.deepEqual(processContactAction({ fullName: 'x' }, undefined), [], 'no id → nothing to emit')
})
