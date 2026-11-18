// §2.132 — a status code that came off the wire must never make Boom throw.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Boom } from '@hapi/boom'
import { getErrorCodeFromStreamError, toBoomStatusCode } from '../lib/Utils/generics.js'
import { extractGroupMetadata } from '../lib/Socket/groups.js'
import { DisconnectReason } from '../lib/Types/index.js'

const streamError = code => ({
	tag: 'stream:error',
	attrs: code === undefined ? {} : { code },
	content: [{ tag: 'conflict', attrs: {} }]
})
const errorIq = attrs => ({ tag: 'iq', attrs: {}, content: [{ tag: 'error', attrs, content: [] }] })

test('§2.132 toBoomStatusCode keeps a usable code and replaces anything else', () => {
	assert.equal(toBoomStatusCode('401'), 401)
	assert.equal(toBoomStatusCode(515), 515)
	assert.equal(toBoomStatusCode('conflict'), DisconnectReason.badSession)
	assert.equal(toBoomStatusCode('0'), DisconnectReason.badSession)
	assert.equal(toBoomStatusCode(200), DisconnectReason.badSession)
	assert.equal(toBoomStatusCode(600), DisconnectReason.badSession)
	assert.equal(toBoomStatusCode(404.5), DisconnectReason.badSession)
	assert.equal(toBoomStatusCode(undefined, 408), 408)
	assert.equal(toBoomStatusCode('x', 42), 500, 'an unusable fallback is replaced too')
})

test('§2.132 every stream:error code produces a Boom that can be constructed', () => {
	for (const code of ['401', '515', 'conflict', '0', '200', 'not-authorized', '', undefined]) {
		const { reason, statusCode } = getErrorCodeFromStreamError(streamError(code))
		const boom = new Boom(`Stream Errored (${reason})`, { statusCode })
		assert.equal(boom.output.statusCode, statusCode)
		assert.ok(statusCode >= 400 && statusCode <= 599)
	}
})

test('§2.132 a conflict without a numeric code still maps to connectionReplaced', () => {
	const { reason, statusCode } = getErrorCodeFromStreamError(streamError(undefined))
	assert.equal(reason, 'conflict')
	assert.equal(statusCode, DisconnectReason.connectionReplaced)
})

test('§2.132 a numeric code still wins, including restartRequired', () => {
	const { reason, statusCode } = getErrorCodeFromStreamError(streamError('515'))
	assert.equal(statusCode, DisconnectReason.restartRequired)
	assert.equal(reason, 'restart required')
	assert.equal(getErrorCodeFromStreamError(streamError('401')).statusCode, DisconnectReason.loggedOut)
})

test('§2.132 extractGroupMetadata reports the server text, whatever the code is', () => {
	for (const [code, expected] of [['403', 403], ['not-authorized', 500], [undefined, 500]]) {
		const attrs = { text: 'not authorized', ...(code ? { code } : {}) }
		const err = (() => { try { extractGroupMetadata(errorIq(attrs)) } catch (e) { return e } })()
		assert.ok(err, 'must throw')
		assert.equal(err.message, 'not authorized')
		assert.equal(err.output.statusCode, expected)
	}
})

test('§2.132 a valid group response is unaffected', () => {
	const result = {
		tag: 'iq',
		attrs: {},
		content: [{ tag: 'group', attrs: { id: '12345', creation: '1700000000', s_t: '1700000000' }, content: [] }]
	}
	const meta = extractGroupMetadata(result)
	assert.equal(meta.id, '12345@g.us')
})
