import test from 'node:test'
import assert from 'node:assert/strict'
import EventEmitter from 'events'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from '../lib/Types/index.js'
import { classifyDisconnect, explainDisconnect } from '../lib/Utils/disconnect-classifier.js'
import { autoReconnect } from '../lib/Utils/auto-reconnect.js'

const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {} }
silent.child = () => silent

/** drives a manager whose every socket closes with `codes` (one per attempt, last repeats) */
const drive = async (codes, opts = {}) => {
	let built = 0
	const fatals = []
	const factory = () => {
		const code = codes[Math.min(built, codes.length - 1)]
		built++
		const ev = new EventEmitter()
		setImmediate(() => ev.emit('connection.update', {
			connection: 'close',
			lastDisconnect: { error: new Boom('closed', { statusCode: code }) }
		}))
		return { ev, end: async () => {} }
	}

	const manager = autoReconnect(factory, {
		logger: silent, baseDelayMs: 1, maxDelayMs: 2, jitter: 0,
		onFatal: v => fatals.push(v),
		...opts
	})
	await manager.start()
	await new Promise(r => setTimeout(r, 120))
	await manager.stop()
	return { built, fatals, status: manager.getStatus() }
}

test('§2.71 classifier marks the fatal codes and spells out a remedy', () => {
	for (const code of [
		DisconnectReason.connectionReplaced,
		DisconnectReason.forbidden,
		DisconnectReason.multideviceMismatch,
		DisconnectReason.badSession,
		DisconnectReason.loggedOut
	]) {
		const v = classifyDisconnect(code)
		assert.equal(v.fatal, true, `${code} must be fatal`)
		assert.ok(v.remedy.length > 20, `${code} needs a real remedy sentence`)
	}

	for (const code of [DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.restartRequired]) {
		assert.equal(classifyDisconnect(code).fatal, false)
	}

	assert.equal(classifyDisconnect(DisconnectReason.badSession).fatalAfterStreak, 3)
	assert.equal(classifyDisconnect(DisconnectReason.forbidden).fatalAfterStreak, null)
	assert.equal(classifyDisconnect(999).fatal, false, 'unknown codes stay retryable')
})

test('§2.71 every case gets its own message, and fatal ones say FATAL', () => {
	const seen = new Set()
	for (const code of [440, 403, 411, 500, 401]) {
		const line = explainDisconnect(code)
		assert.match(line, /FATAL:/)
		seen.add(line)
	}

	assert.equal(seen.size, 5, 'the five fatal cases must not share wording')
	assert.doesNotMatch(explainDisconnect(DisconnectReason.connectionLost), /FATAL/)
	assert.match(explainDisconnect(440), /two bots on one session|shut one of them down/)
	assert.match(explainDisconnect(403), /banned|restricted/)
	assert.match(explainDisconnect(411), /pair again/)
})

test('§2.71 badSession reports streak progress before it cries wolf', () => {
	assert.match(explainDisconnect(500, { streak: 1 }), /1\/3 in a row — retrying/)
	assert.match(explainDisconnect(500, { streak: 2 }), /2\/3 in a row/)
	assert.match(explainDisconnect(500, { streak: 3 }), /FATAL/)
})

test('§2.71 connectionReplaced stops immediately instead of fighting the other session', async () => {
	const { built, fatals } = await drive([DisconnectReason.connectionReplaced])
	assert.equal(built, 1)
	assert.equal(fatals.length, 1)
	assert.equal(fatals[0].verdict.category, 'conflict')
	assert.match(fatals[0].message, /FATAL/)
})

test('§2.71 forbidden stops instead of hammering a banned number', async () => {
	const { built, fatals } = await drive([DisconnectReason.forbidden])
	assert.equal(built, 1)
	assert.equal(fatals[0].verdict.category, 'banned')
})

test('§2.71 multideviceMismatch stops and asks for a re-pair', async () => {
	const { built, fatals } = await drive([DisconnectReason.multideviceMismatch])
	assert.equal(built, 1)
	assert.equal(fatals[0].verdict.action, 're-pair')
})

test('§2.71 badSession retries twice, then goes fatal on the third', async () => {
	const { built, fatals, status } = await drive([DisconnectReason.badSession])
	assert.equal(built, 3, 'two retries then stop')
	assert.equal(fatals.length, 1)
	assert.equal(fatals[0].badSessions, 3)
	assert.equal(status.badSessions, 3)
})

test('§2.71 the badSession streak is configurable', async () => {
	assert.equal((await drive([DisconnectReason.badSession], { badSessionStreak: 1 })).built, 1)
	assert.equal((await drive([DisconnectReason.badSession], { badSessionStreak: 5 })).built, 5)
})

test('§2.71 a non-badSession close in between resets the streak', async () => {
	// bad, bad, transient, bad, bad -> never three in a row inside the window
	const { built, fatals } = await drive([
		DisconnectReason.badSession,
		DisconnectReason.badSession,
		DisconnectReason.connectionLost,
		DisconnectReason.badSession,
		DisconnectReason.badSession,
		DisconnectReason.connectionLost
	])
	assert.equal(fatals.length, 0, 'no fatal verdict')
	assert.ok(built > 5, `kept reconnecting (${built})`)
})

test('§2.71 loggedOut still calls onLoggedOut, and now onFatal too', async () => {
	let loggedOut = 0
	const { built, fatals } = await drive([DisconnectReason.loggedOut], { onLoggedOut: () => loggedOut++ })
	assert.equal(built, 1)
	assert.equal(loggedOut, 1, 'back-compat callback still fires')
	assert.equal(fatals.length, 1)
})

test('§2.71 transient closes are untouched and keep reconnecting', async () => {
	const { built, fatals } = await drive([DisconnectReason.connectionLost])
	assert.equal(fatals.length, 0)
	assert.ok(built > 5, `kept retrying (${built})`)
})

test('§2.71 reconnectOnFatal restores the old behaviour for anyone who needs it', async () => {
	const { built, fatals } = await drive([DisconnectReason.forbidden], { reconnectOnFatal: true })
	assert.equal(fatals.length, 0)
	assert.ok(built > 5, `kept retrying on purpose (${built})`)
})

test('§2.71 a successful open clears the badSession streak', async () => {
	let built = 0
	const factory = () => {
		built++
		const ev = new EventEmitter()
		setImmediate(() => {
			if (built === 3) {
				ev.emit('connection.update', { connection: 'open' })
				setTimeout(() => ev.emit('connection.update', {
					connection: 'close',
					lastDisconnect: { error: new Boom('x', { statusCode: DisconnectReason.badSession }) }
				}), 5)
				return
			}

			ev.emit('connection.update', {
				connection: 'close',
				lastDisconnect: { error: new Boom('x', { statusCode: DisconnectReason.badSession }) }
			})
		})
		return { ev, end: async () => {} }
	}

	const fatals = []
	const manager = autoReconnect(factory, { logger: silent, baseDelayMs: 1, maxDelayMs: 2, jitter: 0, onFatal: v => fatals.push(v) })
	await manager.start()
	await new Promise(r => setTimeout(r, 60))
	await manager.stop()
	// without the reset it would have stopped at socket 3; the open puts the counter
	// back to zero, so it takes three MORE badSessions after it to go fatal
	assert.ok(built >= 5, `the open let it continue past the original streak (${built})`)
	if (fatals.length) {
		assert.equal(fatals[0].badSessions, 3, 'the streak was counted from the open, not from the start')
	}
})
