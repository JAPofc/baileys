// §2.88 — pino is an optional peer: the library works with it, and without it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import defaultLogger, { resolvePino, createFallbackLogger, usingPino } from '../lib/Utils/logger.js'
import { ensureLogger, isUsableLogger } from '../lib/index.js'

test('§2.88 pino is declared as an optional peer, not a hard dependency', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
	assert.equal(pkg.dependencies.pino, undefined, 'pino must not be a runtime dependency')
	assert.match(pkg.peerDependencies.pino, /\^8/, 'pino v8 must be allowed')
	assert.match(pkg.peerDependencies.pino, /\^10/, 'pino v10 must be allowed')
	assert.equal(pkg.peerDependenciesMeta.pino.optional, true)
	assert.ok(pkg.devDependencies.pino, 'the test suite still needs a pino to test against')
})

test('§2.88 the default logger works whichever side of that it lands on', () => {
	assert.equal(typeof usingPino, 'boolean')
	assert.equal(isUsableLogger(defaultLogger), true)
	assert.equal(typeof defaultLogger.child({ class: 'x' }).info, 'function')
	// in this repo pino *is* installed, so the resolver must find it
	const require = createRequire(import.meta.url)
	let installed = true
	try { require.resolve('pino') } catch { installed = false }
	assert.equal(!!resolvePino(), installed)
	assert.equal(usingPino, installed)
})

test('§2.88 the fallback logger is pino-shaped: levels, bindings, filtering', () => {
	const lines = []
	const log = createFallbackLogger({ level: 'info', write: line => lines.push(JSON.parse(line)) })
	assert.equal(isUsableLogger(log), true)

	log.info({ a: 1 }, 'hello')
	assert.deepEqual({ ...lines.at(-1), time: undefined }, { level: 'info', time: undefined, a: 1, msg: 'hello' })

	log.debug('invisible at info level')
	assert.equal(lines.length, 1, 'level filtering must actually filter')
	assert.equal(log.isLevelEnabled('debug'), false)
	assert.equal(log.isLevelEnabled('error'), true)

	const child = log.child({ class: 'ns' })
	child.error('boom')
	assert.equal(lines.at(-1).class, 'ns')
	assert.deepEqual(child.bindings(), { class: 'ns' })
	// grandchildren keep both bindings
	child.child({ stream: 'inner' }).warn('deep')
	assert.deepEqual({ class: lines.at(-1).class, stream: lines.at(-1).stream }, { class: 'ns', stream: 'inner' })

	log.level = 'trace'
	log.trace('now visible')
	assert.equal(lines.at(-1).msg, 'now visible')

	// an unserialisable record must not throw
	const circular = {}
	circular.self = circular
	assert.doesNotThrow(() => log.info(circular, 'circular'))
	assert.equal(lines.at(-1).msg, 'unserialisable log record')

	// and it plugs straight into ensureLogger
	assert.equal(ensureLogger(log), log)
})
