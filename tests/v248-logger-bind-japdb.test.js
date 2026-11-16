// §2.87 — any logger works, MessageBuilder.bind(sock), and the JAPDB auth state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	ensureLogger, isUsableLogger, silentLogger, Curve,
	MessageBuilder, MB, useJAPDBAuth, useNekoDBAuth
} from '../lib/index.js'
import { makeNoiseHandler } from '../lib/Utils/noise-handler.js'
import { makeInMemoryStore } from '../lib/Store/make-in-memory-store.js'

const dirs = []
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })
const makeDir = async () => { const d = await mkdtemp(join(tmpdir(), 'jap-287-')); dirs.push(d); return d }

// ── logger compatibility ───────────────────────────────────────────────────────
test('§2.87 the Noise handshake accepts any logger, not just this build\'s pino', () => {
	const keyPair = Curve.generateKeyPair()
	const NOISE_HEADER = Buffer.from([87, 65, 6, 3])
	const candidates = {
		console,
		'pino v8 style (no child)': { info() {}, warn() {}, error() {}, debug() {}, trace() {}, level: 'info' },
		'empty object': {},
		'false (silence)': false
	}
	for (const [label, logger] of Object.entries(candidates)) {
		assert.doesNotThrow(
			() => makeNoiseHandler({ keyPair, NOISE_HEADER, logger: ensureLogger(logger), routingInfo: undefined }),
			`${label} should be accepted`
		)
	}
})

test('§2.87 ensureLogger adapts, passes pino through, and merges child bindings', () => {
	const lines = []
	const base = { info: (...args) => lines.push(args), level: 'debug' }
	const adapted = ensureLogger(base)
	assert.equal(isUsableLogger(base), false)
	assert.equal(isUsableLogger(adapted), true)

	adapted.info({ a: 1 }, 'hello')
	assert.deepEqual(lines.at(-1), [{ a: 1 }, 'hello'])

	const child = adapted.child({ class: 'ns' })
	child.info({ b: 2 }, 'nested')
	assert.deepEqual(lines.at(-1), [{ class: 'ns', b: 2 }, 'nested'])
	child.info('just a string')
	assert.deepEqual(lines.at(-1), [{ class: 'ns' }, 'just a string'])
	assert.deepEqual(child.bindings(), { class: 'ns' })

	// levels the source does not have fall back sensibly instead of throwing
	assert.doesNotThrow(() => adapted.trace('x'))
	assert.doesNotThrow(() => adapted.error('x'))
	assert.equal(adapted.level, 'debug')
	assert.equal(adapted.isLevelEnabled('info'), true)
	assert.equal(adapted.isLevelEnabled('trace'), false)

	// a real pino-like logger is returned untouched (no wrapper cost)
	const pinoish = { child: () => pinoish, trace() {}, debug() {}, info() {}, warn() {}, error() {}, level: 'info' }
	assert.equal(ensureLogger(pinoish), pinoish)

	// silence
	const silent = ensureLogger(false)
	assert.equal(silent.level, 'silent')
	assert.doesNotThrow(() => silent.child({ x: 1 }).error('nope'))
	assert.equal(isUsableLogger(silentLogger()), true)
	assert.throws(() => ensureLogger('a string'), /expected a logger object/)
})

test('§2.87 the in-memory store takes a plain logger too', () => {
	assert.doesNotThrow(() => makeInMemoryStore({ logger: console }))
	assert.doesNotThrow(() => makeInMemoryStore({}))
})

// ── MessageBuilder.bind ────────────────────────────────────────────────────────
const fakeSock = (extra = {}) => {
	const calls = { relay: 0, send: 0 }
	return {
		calls,
		user: { id: '1@s.whatsapp.net' },
		logger: ensureLogger(false),
		relayMessage: async () => { calls.relay++ },
		sendMessage: async () => { calls.send++; return { key: { id: 'X' } } },
		...extra
	}
}

test('§2.87 MB.bind attaches senders and a builder hub, and unbinds cleanly', async () => {
	const sock = fakeSock()
	const unbind = MB.bind(sock)
	assert.equal(MessageBuilder, MB)
	for (const name of ['sendButtons', 'sendInteractive', 'sendInteractiveV2', 'sendRich', 'sendJapRich', 'sendMini', 'sendA2UI', 'sendBloks', 'mb']) {
		assert.ok(unbind.bound.includes(name), `${name} should be bound`)
		assert.ok(name in sock, `${name} should be on the socket`)
	}
	assert.equal(typeof sock.mb.carousel, 'function')
	assert.equal(typeof sock.mb.button, 'function')

	const result = await sock.sendButtons('628@s.whatsapp.net', { text: 'Hi', buttons: [{ id: 'ya', text: 'Ya' }] })
	assert.equal(sock.calls.relay, 1)
	assert.ok(result.key.id)

	assert.equal(unbind(), true)
	assert.equal('sendButtons' in sock, false)
	assert.equal('mb' in sock, false)
})

test('§2.87 bind never shadows an existing socket property unless asked', () => {
	const sock = fakeSock({ sendButtons: 'MINE', mb: 'MINE TOO' })
	const unbind = MB.bind(sock)
	assert.ok(unbind.skipped.includes('sendButtons'))
	assert.ok(unbind.skipped.includes('mb'))
	assert.equal(sock.sendButtons, 'MINE')
	assert.equal(sock.mb, 'MINE TOO')
	unbind()

	const forced = MB.bind(sock, { overwrite: true })
	assert.equal(typeof sock.sendButtons, 'function')
	forced()
	assert.equal(sock.sendButtons, 'MINE', 'unbind must restore what was there before')
	assert.equal(sock.mb, 'MINE TOO')

	const prefixed = MB.bind(sock, { prefix: 'jap' })
	assert.ok(prefixed.bound.includes('japSendButtons'))
	assert.equal(typeof sock.japSendButtons, 'function')
	prefixed()
	assert.equal('japSendButtons' in sock, false)

	assert.throws(() => MB.bind({}), /requires an active Baileys socket/)
	const hub = new MessageBuilder(fakeSock())
	const viaInstance = hub.bind()
	assert.ok(viaInstance.bound.length > 0)
	viaInstance()
})

// ── JAPDB auth ─────────────────────────────────────────────────────────────────
test('§2.87 useJAPDBAuth is the primary name and useNekoDBAuth stays a working alias', async () => {
	const dir = await makeDir()
	const file = join(dir, 'auth.json')
	const first = await useJAPDBAuth({ file, session: 'shared' })
	await first.saveCreds()
	await first.state.keys.set({ 'pre-key': { 7: { public: Buffer.from([9, 9]) } } })

	// the alias reads exactly what the primary wrote
	const viaAlias = await useNekoDBAuth({ file, session: 'shared' })
	assert.equal(viaAlias.state.creds.registrationId, first.state.creds.registrationId)
	assert.deepEqual([...(await viaAlias.state.keys.get('pre-key', ['7']))['7'].public], [9, 9])
})
