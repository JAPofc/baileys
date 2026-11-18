// §2.80 — SignalingBridge must patch the shared auth state once, and let go of it again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SignalingBridge } from '../lib/VoIP/signaling.js'

const JID = '628999@s.whatsapp.net'
const TOKEN = { token: new Uint8Array([1, 2, 3]), timestamp: '1' }

const makeSock = () => {
	const store = {}
	const originalSet = async data => { Object.assign(store, data) }
	const authState = {
		creds: { me: { id: '1@s.whatsapp.net' } },
		keys: {
			set: originalSet,
			get: async (type, ids) => Object.fromEntries(ids.map(id => [id, store[type]?.[id]]))
		}
	}
	return {
		store,
		originalSet,
		authState,
		sock: { authState, query: async () => ({}), signalRepository: {}, generateMessageTag: () => 't', ws: { on: () => {} } }
	}
}

test('§2.80 many bridges on one auth state install exactly one wrapper', async () => {
	const { sock, authState, originalSet } = makeSock()
	const bridges = []
	for (let i = 0; i < 25; i++) {
		const b = new SignalingBridge({ sock })
		await b.init()
		bridges.push(b)
	}
	const patched = authState.keys.set
	assert.notEqual(patched, originalSet)
	// re-initialising must not stack another layer
	await bridges[0].init()
	assert.equal(authState.keys.set, patched, 'a second init() re-wrapped keys.set')
	for (const b of bridges) b.dispose()
	assert.equal(authState.keys.set, originalSet, 'the patch was not removed after every bridge disposed')
})

test('§2.80 a live bridge still observes tctoken writes', async () => {
	const { sock, authState } = makeSock()
	const bridge = new SignalingBridge({ sock })
	await bridge.init()
	await authState.keys.set({ tctoken: { [JID]: TOKEN } })
	let gets = 0
	const realGet = authState.keys.get
	authState.keys.get = async (...a) => { gets++; return realGet(...a) }
	const token = await bridge.ensureTcToken(JID)
	assert.deepEqual([...token], [1, 2, 3])
	assert.equal(gets, 0, 'the observed token should have been served from memory')
	bridge.dispose()
})

test('§2.80 the underlying keys.set still runs, and other writes pass through', async () => {
	const { sock, authState, store } = makeSock()
	const bridge = new SignalingBridge({ sock })
	await bridge.init()
	await authState.keys.set({ 'pre-key': { 1: { public: 'x' } } })
	await authState.keys.set({ tctoken: { [JID]: TOKEN } })
	assert.deepEqual(store['pre-key'], { 1: { public: 'x' } })
	assert.ok(store.tctoken[JID])
	bridge.dispose()
})

test('§2.80 a disposed bridge stops observing and reports isDisposed', async () => {
	const { sock, authState } = makeSock()
	const a = new SignalingBridge({ sock })
	const b = new SignalingBridge({ sock })
	await a.init()
	await b.init()
	assert.equal(a.isDisposed, false)
	a.dispose()
	assert.equal(a.isDisposed, true)
	a.dispose() // idempotent
	assert.notEqual(authState.keys.set, undefined)
	await authState.keys.set({ tctoken: { [JID]: TOKEN } })
	let gets = 0
	const realGet = authState.keys.get
	authState.keys.get = async (...args) => { gets++; return realGet(...args) }
	await a.ensureTcToken(JID)
	assert.ok(gets > 0, 'a disposed bridge must not answer from its own cache')
	gets = 0
	const stillLive = await b.ensureTcToken(JID)
	assert.deepEqual([...stillLive], [1, 2, 3])
	assert.equal(gets, 0, 'the remaining bridge should still be observing')
	b.dispose()
})

test('§2.80 dispose clears pending state and resolves token waiters', async () => {
	const { sock } = makeSock()
	const bridge = new SignalingBridge({ sock })
	await bridge.init()
	assert.deepEqual(bridge.listPendingOffers(), [])
	bridge.dispose()
	assert.deepEqual(bridge.listPendingOffers(), [])
	assert.equal(bridge.hasPendingOffer('x'), false)
})

test('§2.80 the VoipClient detaches the old bridge on reconnect and on disconnect', async () => {
	const { VoipClient } = await import('../lib/VoIP/index.js')
	const { sock, authState, originalSet } = makeSock()
	const engine = new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : async () => {}) })
	const relay = { closeAll() {}, send() {}, updateRelayList() {}, getStats: () => ({}) }
	const client = new VoipClient({ engine, relay })
	await client.connectWithSocket(sock)
	assert.notEqual(authState.keys.set, originalSet)
	await client.connectWithSocket(sock) // reconnect
	assert.notEqual(authState.keys.set, originalSet)
	client.disconnect()
	assert.equal(authState.keys.set, originalSet, 'disconnect() left the auth state patched')
})

test('§2.80 the one-shot patch and dispose() are in the source and typed', () => {
	const src = readFileSync(new URL('../lib/VoIP/signaling.js', import.meta.url), 'utf8')
	assert.match(src, /const tcTokenObservers = new WeakMap\(\)/)
	assert.match(src, /observeTcTokenWrites = \(keys, observer\)/)
	assert.match(src, /dispose = \(\) => \{/)
	const code = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
	assert.doesNotMatch(code, /this\.#sock\.authState\.keys\.set = async \(data\)/)
	const dts = readFileSync(new URL('../lib/VoIP/signaling.d.ts', import.meta.url), 'utf8')
	assert.match(dts, /dispose: \(\) => void/)
	assert.match(dts, /readonly isDisposed: boolean/)
	assert.match(readFileSync(new URL('../lib/VoIP/index.js', import.meta.url), 'utf8'), /this\.#signaling\?\.dispose\?\.\(\)/)
})
