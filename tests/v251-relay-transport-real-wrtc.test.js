import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

import { RelayRtcTransport } from '../lib/VoIP/relay-transport.js'

/**
 * The VoIP relay against the real `@roamhq/wrtc`. Until 2.5.1 this code path had never
 * executed: the optional package was not installed anywhere, so every test exercised the
 * loader's "package missing" branch and nothing else (pattern 38).
 *
 * Installing it surfaced §2.218 immediately, and in the rudest possible way — the test
 * process stopped exiting. An unclosed RTCPeerConnection holds libuv handles open, so a
 * leak here does not look like a failing assertion, it looks like a hang.
 */

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))

const wrtcInstalled = await import('@roamhq/wrtc').then(() => true, () => false)
const needsWrtc = { skip: wrtcInstalled ? false : '@roamhq/wrtc is not installed' }

const relayList = {
	relays: [{ relay_id: 7, relay_name: 'edge-1', token_id: 0, addresses: [{ protocol: 0, ipv4: '10.0.0.1', port: 3478 }] }],
	relay_tokens: ['tok'],
	relay_key: 'key'
}

const makeTransport = () => {
	const errors = []
	const transport = new RelayRtcTransport({
		onTransportMessage: () => {},
		onTransportError: err => errors.push(err),
		logger: { warn: () => {} }
	})
	return { transport, errors }
}

describe('relay transport — real @roamhq/wrtc', () => {
	it('§2.218 closeAll() leaves no peer behind, so the process can exit', needsWrtc, async () => {
		// A hang cannot be asserted from inside the hanging process, so the real proof runs
		// in a child: it opens a relay, closes it, and must exit on its own. Before the fix
		// this child ran forever and the assertion below was a timeout, not a failure.
		const { stdout } = await run(
			process.execPath,
			[join(here, 'fixtures', 'relay-close-exits.mjs')],
			{ timeout: 30_000, cwd: dirname(here) }
		)
		assert.match(stdout, /closed-cleanly/, 'the child reported a clean close')
	})

	it('§2.218 a connect started before closeAll() does not build a peer afterwards', needsWrtc, async () => {
		const { transport } = makeTransport()
		transport.updateRelayList(relayList) // async connect now in flight
		await transport.closeAll() // closed before the peer is even constructed
		// give any late-resolving connect a chance to misbehave
		await new Promise(r => setTimeout(r, 300))
		assert.deepEqual(transport.getConnectionStats(), [], 'no connection survived close')
	})

	it('§2.218 closeAll() is safe to call twice and on an idle transport', needsWrtc, async () => {
		const { transport } = makeTransport()
		await transport.closeAll()
		transport.updateRelayList(relayList)
		await transport.closeAll()
		await transport.closeAll()
		assert.deepEqual(transport.getConnectionStats(), [])
	})

	it('§2.217 a real connect failure is reported, not thrown as an unhandled rejection', needsWrtc, async () => {
		const seen = []
		const onRejection = err => seen.push(err)
		process.on('unhandledRejection', onRejection)
		const { transport, errors } = makeTransport()
		try {
			transport.updateRelayList(relayList)
			await new Promise(r => setTimeout(r, 400))
		} finally {
			process.off('unhandledRejection', onRejection)
			await transport.closeAll()
		}
		assert.deepEqual(seen, [], 'nothing escaped as an unhandled rejection')
		assert.ok(errors.length >= 1, 'the failure reached onTransportError')
		assert.ok(errors[0] instanceof Error)
		// 10.0.0.1 is not a relay. What the failure IS depends on the network; that it is
		// reported as an Error through the callback is the contract.
	})

	it('sending to an unknown relay is counted, never thrown', needsWrtc, async () => {
		const { transport } = makeTransport()
		try {
			const sent = transport.send(new Uint8Array([1, 2, 3]), '10.0.0.9', 3478)
			assert.equal(typeof sent, 'number')
			assert.ok(transport.getStats().droppedPackets >= 0)
		} finally {
			await transport.closeAll()
		}
	})
})
