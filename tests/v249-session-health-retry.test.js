// §2.129 — queries must follow the same key resolution as recording.
// §2.130 — bind() works destructured; the tracking cap holds during a burst.
// §2.131 — the retry manager keeps its own defaults and never crashes the process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSessionHealthMonitor, canonicalizeJid } from '../lib/Utils/session-health.js'
import { MessageRetryManager, DEFAULT_MAX_MSG_RETRY_COUNT } from '../lib/Utils/message-retry-manager.js'
import { WAMessageStubType } from '../lib/Types/index.js'

const mkEv = () => {
	const ls = new Set()
	return { on: (_, f) => ls.add(f), off: (_, f) => ls.delete(f), emit: u => ls.forEach(f => f(u)) }
}
const lidKeyBy = () => jid => (jid.endsWith('@lid') ? '62811@s.whatsapp.net' : jid)
const ciphertext = jid => ({ messages: [{ key: { remoteJid: jid }, messageStubType: WAMessageStubType.CIPHERTEXT }] })
const quietLog = { debug() {}, warn() {}, info() {}, error() {} }

test('§2.129 isHealthy follows a keyBy-resolved contact', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 1, keyBy: lidKeyBy })
	const ev = mkEv()
	m.bind({ ev })
	ev.emit(ciphertext('99999@lid'))
	assert.equal(m.isHealthy('99999@lid'), false)
	assert.equal(m.isHealthy('62811@s.whatsapp.net'), false)
	assert.deepEqual(m.getUnhealthy().map(u => u.jid), ['62811@s.whatsapp.net'])
	m.unbind()
})

test('§2.129 record() and the listener agree on one key per contact', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 5, keyBy: lidKeyBy })
	const ev = mkEv()
	m.bind({ ev })
	ev.emit(ciphertext('99999@lid'))
	m.record('99999@lid')
	assert.equal(m.getStats().tracked, 1)
	assert.equal(m.getStatus('99999@lid').failures, 2)
	m.unbind()
})

test('§2.129 reset() clears the resolved entry when given the raw jid', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 1, keyBy: lidKeyBy })
	m.bind({ ev: mkEv() })
	m.record('99999@lid')
	m.reset('99999@lid')
	assert.equal(m.getStats().tracked, 0)
	assert.equal(m.isHealthy('99999@lid'), true)
	m.unbind()
})

test('§2.129 without keyBy nothing changes', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 2 })
	m.record('123@s.whatsapp.net')
	assert.equal(m.isHealthy('123@s.whatsapp.net'), true)
	m.record('123:4@s.whatsapp.net')
	assert.equal(m.isHealthy('123@s.whatsapp.net'), false, 'device suffix must still collapse')
	assert.equal(canonicalizeJid('123:4@s.whatsapp.net'), '123@s.whatsapp.net')
})

test('§2.130 bind() can be destructured and rebound', () => {
	const m = createSessionHealthMonitor()
	const { bind, unbind } = m
	const off = bind({ ev: mkEv() })
	bind({ ev: mkEv() })
	off()
	unbind()
})

test('§2.130 the unbind function returned by bind() detaches the listener', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 1 })
	const ev = mkEv()
	const off = m.bind({ ev })
	off()
	ev.emit(ciphertext('1@s.whatsapp.net'))
	assert.equal(m.getStats().tracked, 0)
})

test('§2.130 maxTracked holds even when every contact is unhealthy', () => {
	const m = createSessionHealthMonitor({ badMacThreshold: 1, maxTracked: 10 })
	for (let i = 0; i < 500; i++) m.record(`${i}@s.whatsapp.net`)
	assert.ok(m.getStats().tracked <= 10, `tracked ${m.getStats().tracked}`)
	assert.ok(m.getUnhealthy().length <= 10)
})

test('§2.131 the manager keeps its default when constructed without a count', () => {
	const r = new MessageRetryManager(quietLog)
	assert.equal(r.maxMsgRetryCount, DEFAULT_MAX_MSG_RETRY_COUNT)
	for (let i = 0; i < DEFAULT_MAX_MSG_RETRY_COUNT; i++) r.incrementRetryCount('m')
	assert.equal(r.hasExceededMaxRetries('m'), true)
})

test('§2.131 an explicit count is still honoured, including 0', () => {
	assert.equal(new MessageRetryManager(quietLog, 2).maxMsgRetryCount, 2)
	assert.equal(new MessageRetryManager(quietLog, 0).maxMsgRetryCount, 0)
	assert.equal(new MessageRetryManager(quietLog, -1).maxMsgRetryCount, DEFAULT_MAX_MSG_RETRY_COUNT)
	assert.equal(new MessageRetryManager(quietLog, 'three').maxMsgRetryCount, DEFAULT_MAX_MSG_RETRY_COUNT)
})

test('§2.131 a malformed retry error code is rejected instead of half-parsed', () => {
	const r = new MessageRetryManager(quietLog, 3)
	assert.equal(r.parseRetryErrorCode('4abc'), undefined)
	assert.equal(r.parseRetryErrorCode('abc'), undefined)
	assert.equal(r.parseRetryErrorCode(''), undefined)
	assert.equal(r.parseRetryErrorCode('7'), 7)
	assert.equal(r.parseRetryErrorCode(' 4 '), 4)
	assert.equal(r.parseRetryErrorCode('99'), 0) // unknown but numeric -> UnknownError
	assert.equal(r.isMacError(r.parseRetryErrorCode('4abc')), false)
})

test('§2.131 a throwing phone-request callback is contained', async () => {
	const r = new MessageRetryManager(quietLog, 3)
	r.schedulePhoneRequest('m', () => { throw new Error('exploded') }, 1)
	await new Promise(res => setTimeout(res, 30))
	assert.equal(r.statistics.phoneRequests, 1)
})

test('§2.131 a rejecting async phone-request callback is contained too', async () => {
	const r = new MessageRetryManager(quietLog, 3)
	r.schedulePhoneRequest('m', async () => { throw new Error('rejected') }, 1)
	await new Promise(res => setTimeout(res, 30))
	assert.equal(r.statistics.phoneRequests, 1)
})

test('§2.131 cancelling a scheduled phone request still works', async () => {
	const r = new MessageRetryManager(quietLog, 3)
	let ran = 0
	r.schedulePhoneRequest('m', () => { ran++ }, 5)
	r.cancelPendingPhoneRequest('m')
	await new Promise(res => setTimeout(res, 30))
	assert.equal(ran, 0)
	assert.equal(r.statistics.phoneRequests, 0)
})
