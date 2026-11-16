import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter, withPairingGuard } from '../lib/Utils/auth-secure.js'

const makeClock = () => {
	const c = { t: 0 }
	c.now = () => c.t
	return c
}

const makeSock = () => {
	const reached = []
	return {
		reached,
		sock: { requestPairingCode: async (phone, code) => { reached.push([phone, code]); return code || 'RANDOM' } }
	}
}

test('§2.69 a rejected request does not consume the global budget', async () => {
	const clock = makeClock()
	const { sock, reached } = makeSock()
	const { global: g } = withPairingGuard(sock, { maxPerHour: 2, globalMaxPerHour: 5, minIntervalMs: 0, now: clock.now })

	for (let i = 0; i < 6; i++) {
		clock.t += 1000
		await sock.requestPairingCode('628111').catch(() => {})
	}

	assert.equal(reached.length, 2, 'the per-phone limit still holds')
	assert.equal(g.stats.allowed, 2, 'only the two real requests spent a global slot')
	assert.equal(g.remaining('global'), 3)
})

test('§2.69 one spamming number no longer locks everyone else out', async () => {
	const clock = makeClock()
	const { sock } = makeSock()
	withPairingGuard(sock, { maxPerHour: 2, globalMaxPerHour: 5, minIntervalMs: 0, now: clock.now })

	for (let i = 0; i < 6; i++) {
		clock.t += 1000
		await sock.requestPairingCode('628111').catch(() => {})
	}

	const verdicts = []
	for (const phone of ['628222', '628333', '628444', '628555']) {
		clock.t += 1000
		verdicts.push(await sock.requestPairingCode(phone).then(() => 'allowed').catch(() => 'blocked'))
	}

	assert.deepEqual(verdicts, ['allowed', 'allowed', 'allowed', 'blocked'], 'exactly the remaining global budget')
})

test('§2.69 a globally-blocked request does not burn the phone\'s own attempts', async () => {
	const clock = makeClock()
	const { sock } = makeSock()
	const { limiter } = withPairingGuard(sock, { maxPerHour: 3, globalMaxPerHour: 1, minIntervalMs: 0, now: clock.now })

	clock.t += 1000
	await sock.requestPairingCode('628999') // uses the only global slot
	clock.t += 1000
	await assert.rejects(sock.requestPairingCode('628111'))

	assert.equal(limiter.remaining('628111'), 3, 'the rejected number kept all of its attempts')
})

test('§2.69 blocked requests are still counted in stats exactly once', async () => {
	const clock = makeClock()
	const { sock } = makeSock()
	const { limiter, global: g } = withPairingGuard(sock, { maxPerHour: 1, globalMaxPerHour: 9, minIntervalMs: 0, now: clock.now })

	clock.t += 1000
	await sock.requestPairingCode('628111')
	clock.t += 1000
	await assert.rejects(sock.requestPairingCode('628111'))

	assert.equal(limiter.stats.blocked, 1)
	assert.equal(g.stats.blocked, 0, 'the global limiter did not refuse anything')
})

test('§2.69 the guard still forwards every argument and restores cleanly', async () => {
	const clock = makeClock()
	const { sock, reached } = makeSock()
	const { restore } = withPairingGuard(sock, { maxPerHour: 1, minIntervalMs: 0, now: clock.now })

	clock.t += 1000
	assert.equal(await sock.requestPairingCode('628111', 'JAPJAP12'), 'JAPJAP12', 'a custom code is forwarded')
	assert.deepEqual(reached[0], ['628111', 'JAPJAP12'])
	clock.t += 1000
	await assert.rejects(sock.requestPairingCode('628111'), 'still guarded')

	// restore() rebinds the original (note: a bound copy, not the same reference)
	restore()
	clock.t += 1000
	await sock.requestPairingCode('628111', 'AFTER')
	assert.deepEqual(reached.at(-1), ['628111', 'AFTER'], 'the limiter is out of the way again')
})

test('peek() reports the verdict without consuming a slot', () => {
	const clock = makeClock()
	const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: clock.now })

	for (let i = 0; i < 5; i++) {
		assert.deepEqual(limiter.peek('a'), { allowed: true, retryAfterMs: 0 })
	}

	assert.deepEqual(limiter.stats, { allowed: 0, blocked: 0 }, 'peek never moves stats')
	limiter.check('a')
	limiter.check('a')
	const blocked = limiter.peek('a')
	assert.equal(blocked.allowed, false)
	assert.ok(blocked.retryAfterMs > 0)
	assert.equal(limiter.stats.blocked, 0, 'still untouched')
})

test('peek() honours minIntervalMs and the window expiring', () => {
	const clock = makeClock()
	const limiter = createRateLimiter({ max: 5, windowMs: 1000, minIntervalMs: 100, now: clock.now })
	clock.t = 500
	limiter.check('a')
	assert.equal(limiter.peek('a').allowed, false, 'too soon')
	clock.t = 650
	assert.equal(limiter.peek('a').allowed, true, 'spacing satisfied')
	clock.t = 2000
	assert.equal(limiter.remaining('a'), 5, 'the window rolled over')
})

test('remaining() counts down and never goes negative', () => {
	const clock = makeClock()
	const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: clock.now })
	assert.equal(limiter.remaining('a'), 2)
	limiter.check('a')
	assert.equal(limiter.remaining('a'), 1)
	limiter.check('a')
	assert.equal(limiter.remaining('a'), 0)
	limiter.check('a')
	assert.equal(limiter.remaining('a'), 0)
	limiter.reset('a')
	assert.equal(limiter.remaining('a'), 2)
})

test('peek()/remaining() default to the global key and keep keys separate', () => {
	const clock = makeClock()
	const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: clock.now })
	limiter.check()
	assert.equal(limiter.peek().allowed, false)
	assert.equal(limiter.remaining(), 0)
	assert.equal(limiter.peek('other').allowed, true)
	assert.equal(limiter.remaining('other'), 1)
})
