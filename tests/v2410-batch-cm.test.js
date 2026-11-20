// §2.205 — redactSecrets() returned anything that was not a plain object untouched, so
//           secureLogger printed credentials in clear text whenever they came from a class.
// §2.206 — the rate limiter kept a map entry per key forever, and a documented
//           `[BINARY:<n>B]` form that no code path could produce.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	redactSecrets, secureLogger, encryptJSON, decryptJSON, isEncryptedPayload,
	createRateLimiter, ENC_MAGIC
} from '../lib/Utils/auth-secure.js'

class AuthCreds {
	constructor() {
		this.advSecretKey = 'RAHASIA-SEKALI'
		this.noiseKey = { private: Buffer.from([1, 2, 3]) }
		this.me = { id: '62811@s.whatsapp.net', name: 'Rina' }
	}
}

describe('§2.205 redactSecrets covers more than plain objects', () => {
	test('a class instance is redacted, not waved through', () => {
		const out = redactSecrets(new AuthCreds())
		assert.equal(out.advSecretKey, '[REDACTED]')
		assert.equal(out.noiseKey, '[REDACTED]')
		assert.equal(out.me.id, '62811@s.whatsapp.net', 'non-sensitive fields survive')
	})

	test('a class instance nested inside a plain object is redacted', () => {
		const out = redactSecrets({ creds: new AuthCreds(), other: 1 })
		assert.equal(out.creds.advSecretKey, '[REDACTED]')
		assert.equal(out.other, 1)
	})

	test('secureLogger no longer prints credentials in clear text', () => {
		const lines = []
		const log = secureLogger({ info: obj => lines.push(obj), child: () => log })

		log.info({ creds: new AuthCreds() }, 'state')

		const printed = JSON.stringify(lines[0])
		assert.ok(!printed.includes('RAHASIA-SEKALI'), `the secret leaked into the log: ${printed}`)
		assert.ok(printed.includes('[REDACTED]'))
	})

	test('an Error keeps its name and message but loses its secrets', () => {
		const err = Object.assign(new Error('gagal'), { token: 'ABC', statusCode: 401 })
		const out = redactSecrets({ err })
		assert.equal(out.err.name, 'Error')
		assert.equal(out.err.message, 'gagal')
		assert.equal(out.err.token, '[REDACTED]')
		assert.equal(out.err.statusCode, 401)
	})

	test('Maps and Sets are walked rather than printed as {}', () => {
		const out = redactSecrets({
			m: new Map([['advSecretKey', 'RAHASIA'], ['jid', '1@s.whatsapp.net']]),
			s: new Set([{ token: 'ABC' }, 'biasa'])
		})
		assert.equal(out.m.advSecretKey, '[REDACTED]')
		assert.equal(out.m.jid, '1@s.whatsapp.net')
		assert.equal(out.s[0].token, '[REDACTED]')
		assert.equal(out.s[1], 'biasa')
	})

	test('circular references still terminate', () => {
		const node = { name: 'a', token: 'ABC' }
		node.self = node
		const out = redactSecrets(node)
		assert.equal(out.token, '[REDACTED]')
		assert.equal(out.self, out, 'the cycle is preserved, not expanded')
	})

	test('Dates and binary under a harmless key are left alone', () => {
		const when = new Date('2026-10-01T00:00:00Z')
		const out = redactSecrets({ when, thumbnail: Buffer.from([1, 2, 3]) })
		assert.equal(out.when, when)
		assert.ok(Buffer.isBuffer(out.thumbnail))
	})

	test('extraKeys adds caller-specific fields', () => {
		assert.equal(redactSecrets({ nomorKtp: '123' }, { extraKeys: ['nomorKtp'] }).nomorKtp, '[REDACTED]')
	})
})

describe('§2.206 rate limiter book-keeping', () => {
	test('expired keys are dropped instead of accumulating forever', () => {
		let t = 0
		const limiter = createRateLimiter({ max: 5, windowMs: 1000, now: () => t })
		for (let i = 0; i < 100; i++) {
			limiter.check(`6281${i}@s.whatsapp.net`)
		}
		assert.equal(limiter.stats.allowed, 100)
		assert.equal(limiter.trackedKeys, 100, 'tracked while their windows are live')

		t += 10_000 // every window has long expired
		for (let i = 0; i < 100; i++) {
			assert.equal(limiter.remaining(`6281${i}@s.whatsapp.net`), 5, 'the budget is back')
		}

		// the keys are externally supplied -- one per phone number that ever tried to pair --
		// so the map must not keep an entry per key forever.
		assert.equal(limiter.trackedKeys, 0, 'every expired key must be dropped, not just emptied')
	})

	test('limiting still works within the window', () => {
		let t = 0
		const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
		assert.equal(limiter.check('a').allowed, true)
		assert.equal(limiter.check('a').allowed, true)

		const blocked = limiter.check('a')
		assert.equal(blocked.allowed, false)
		assert.ok(blocked.retryAfterMs > 0)
		assert.equal(limiter.remaining('a'), 0)
		assert.equal(limiter.stats.blocked, 1)

		t += 1000
		assert.equal(limiter.check('a').allowed, true, 'the window rolled')
	})

	test('peek consumes nothing', () => {
		const limiter = createRateLimiter({ max: 1, windowMs: 1000 })
		assert.equal(limiter.peek('a').allowed, true)
		assert.equal(limiter.peek('a').allowed, true)
		assert.equal(limiter.remaining('a'), 1)
		assert.equal(limiter.stats.allowed, 0, 'peek must not move the stats either')
	})

	test('minIntervalMs spaces requests out separately from the budget', () => {
		let t = 0
		const limiter = createRateLimiter({ max: 10, windowMs: 10_000, minIntervalMs: 500, now: () => t })
		assert.equal(limiter.check('a').allowed, true)
		assert.equal(limiter.check('a').allowed, false, 'too soon')
		assert.equal(limiter.remaining('a'), 9, 'spacing is not a budget')
		t += 500
		assert.equal(limiter.check('a').allowed, true)
	})
})

describe('auth-secure encryption (characterisation)', () => {
	test('a value round-trips through encrypt/decrypt', () => {
		const value = { creds: { advSecretKey: 'rahasia', noiseKey: Buffer.from([1, 2, 3, 250]) } }
		const payload = encryptJSON(value, 'kata-sandi')

		assert.ok(payload.startsWith(ENC_MAGIC + '.'))
		assert.ok(isEncryptedPayload(payload))
		assert.ok(!payload.includes('rahasia'))

		const back = decryptJSON(payload, 'kata-sandi')
		assert.equal(back.creds.advSecretKey, 'rahasia')
		assert.deepEqual(Buffer.from(back.creds.noiseKey), Buffer.from([1, 2, 3, 250]), 'Buffers survive')
	})

	test('the same value encrypts differently every time', () => {
		const a = encryptJSON({ x: 1 }, 'pw')
		const b = encryptJSON({ x: 1 }, 'pw')
		assert.notEqual(a, b, 'a fresh salt and iv per call')
		assert.equal(decryptJSON(a, 'pw').x, decryptJSON(b, 'pw').x)
	})

	test('a wrong password and a tampered payload both fail loudly', () => {
		const payload = encryptJSON({ x: 1 }, 'benar')
		assert.throws(() => decryptJSON(payload, 'salah'), /decryption failed/)

		const parts = payload.split('.')
		const ct = Buffer.from(parts[4], 'base64url')
		ct[0] ^= 0xff
		parts[4] = ct.toString('base64url')
		assert.throws(() => decryptJSON(parts.join('.'), 'benar'), /decryption failed/,
			'GCM must reject a flipped bit rather than return garbage')
	})

	test('malformed payloads are named, not misreported as a bad password', () => {
		assert.throws(() => decryptJSON('bukan-payload', 'pw'), /not a JAP encrypted payload/)
		assert.throws(() => decryptJSON(ENC_MAGIC + '.a.b', 'pw'), /malformed encrypted payload/)
		assert.throws(() => decryptJSON(ENC_MAGIC + '.a.b.c.d', 'pw'), /malformed encrypted payload fields/)
		assert.throws(() => encryptJSON({}, ''), /password must be a non-empty string/)
	})
})
