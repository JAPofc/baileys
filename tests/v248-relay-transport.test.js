// §2.79 — relay transport: connect failures must not become unhandled rejections,
// drops must be visible, and per-connection stats must be reachable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RelayRtcTransport } from '../lib/VoIP/relay-transport.js'

const relayList = {
	relays: [{ relay_id: 7, relay_name: 'edge-1', token_id: 0, addresses: [{ protocol: 0, ipv4: '10.0.0.1', port: 3478 }] }],
	relay_tokens: ['tok'],
	relay_key: 'key'
}

const withRejectionWatch = async fn => {
	const seen = []
	const onRejection = err => seen.push(err)
	process.on('unhandledRejection', onRejection)
	try {
		await fn()
		await new Promise(r => setTimeout(r, 120))
	} finally {
		process.off('unhandledRejection', onRejection)
	}
	return seen
}

test('§2.79 a relay list with @roamhq/wrtc missing reports an error instead of crashing', async () => {
	const errors = []
	const warned = []
	const transport = new RelayRtcTransport({
		onTransportMessage: () => {},
		onTransportError: (err, relay) => errors.push([err, relay]),
		logger: { warn: (obj, msg) => warned.push(msg) }
	})
	const rejections = await withRejectionWatch(async () => transport.updateRelayList(relayList))
	assert.deepEqual(rejections, [], 'connect failure escaped as an unhandled rejection')
	assert.equal(errors.length, 1)
	assert.ok(errors[0][0] instanceof Error)
	assert.match(errors[0][0].message, /@roamhq\/wrtc/)
	assert.equal(errors[0][1].ip, '10.0.0.1')
	assert.deepEqual(warned, ['relay transport connection failed'])
	await transport.closeAll()
})

test('§2.79 sending before a relay exists also fails softly', async () => {
	const errors = []
	const transport = new RelayRtcTransport({ onTransportMessage: () => {}, onTransportError: e => errors.push(e) })
	const rejections = await withRejectionWatch(async () => {
		transport.updateRelayList(relayList)
		transport.send(new Uint8Array(16), '10.0.0.1', 3478)
	})
	assert.deepEqual(rejections, [])
	assert.ok(errors.length >= 1)
	await transport.closeAll()
})

test('§2.79 a transport with no error handler at all still does not reject', async () => {
	const transport = new RelayRtcTransport({ onTransportMessage: () => {} })
	const rejections = await withRejectionWatch(async () => transport.updateRelayList(relayList))
	assert.deepEqual(rejections, [])
	await transport.closeAll()
})

test('§2.79 getStats().droppedPackets counts every dropped packet', async () => {
	const transport = new RelayRtcTransport({ onTransportMessage: () => {}, onTransportError: () => {} })
	await withRejectionWatch(async () => transport.updateRelayList(relayList))
	assert.equal(transport.getStats().droppedPackets, 0)
	// oversized packets can never be buffered
	transport.send(new Uint8Array(512 * 1024), '10.0.0.1', 3478)
	transport.send(new Uint8Array(512 * 1024), '10.0.0.1', 3478)
	assert.equal(transport.getStats().droppedPackets, 2)
	// filling the 256 KB buffer evicts the oldest packets, and those count too
	for (let i = 0; i < 6; i++) transport.send(new Uint8Array(64 * 1024), '10.0.0.1', 3478)
	assert.ok(transport.getStats().droppedPackets > 2, 'buffer evictions were not counted')
	await transport.closeAll()
})

test('§2.79 getConnectionStats exposes the per-connection view', async () => {
	const transport = new RelayRtcTransport({ onTransportMessage: () => {}, onTransportError: () => {} })
	await withRejectionWatch(async () => transport.updateRelayList(relayList))
	transport.send(new Uint8Array(1024), '10.0.0.1', 3478)
	const [conn, ...rest] = transport.getConnectionStats()
	assert.equal(rest.length, 0)
	assert.equal(conn.ip, '10.0.0.1')
	assert.equal(conn.relayName, 'edge-1')
	assert.equal(conn.state, 'failed')
	assert.equal(conn.bufferedPackets, 1)
	assert.equal(conn.bufferedBytes, 1024)
	assert.equal(conn.lastIceRttMs, null)
	assert.equal(conn.droppedPackets, 0)
	const totals = transport.getStats()
	assert.equal(totals.openConnections, 0)
	await transport.closeAll()
	assert.deepEqual(transport.getConnectionStats(), [])
})

test('§2.79 drop accounting and error routing are wired in the source, and typed', () => {
	const raw = readFileSync(new URL('../lib/VoIP/relay-transport.js', import.meta.url), 'utf8')
	// strip comments so the JAP@Fix note describing the old code does not count as code
	const src = raw.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.doesNotMatch(src, /void this\.#ensureConnection/)
	assert.doesNotMatch(src, /void this\.#restartIce/)
	assert.match(src, /#startConnection = \(info\) => \{/)
	assert.match(src, /#onConnectionError = \(info, err\) => \{/)
	// no drop site may bump the per-connection counter on its own any more
	assert.doesNotMatch(src, /connection\.stats\.droppedPackets \+= 1;\n(?!\s*if \(totals\))/)
	const dts = readFileSync(new URL('../lib/VoIP/relay-transport.d.ts', import.meta.url), 'utf8')
	assert.match(dts, /onTransportError\?:/)
	assert.match(dts, /getConnectionStats: \(\) => RelayConnectionStats\[\]/)
	assert.match(readFileSync(new URL('../lib/VoIP/index.js', import.meta.url), 'utf8'), /onTransportError: \(err, relay\)/)
})
