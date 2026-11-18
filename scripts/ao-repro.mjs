// §2.79 repro -- lib/VoIP/relay-transport.js
//
// (a) Every call site kicks the connection off with `void this.#ensureConnection(info)`.
//     Nothing ever catches it. The optional `@roamhq/wrtc` dependency is exactly the thing
//     most installs do NOT have, and the loader throws on purpose to say so -- so receiving a
//     relay list turns into an UNHANDLED PROMISE REJECTION, which Node kills the process for.
// (b) `getStats().droppedPackets` is wired to `#totals`, but nothing ever increments
//     `#totals.droppedPackets` -- only the per-connection counter, which is not exposed.
import { RelayRtcTransport } from '../lib/VoIP/relay-transport.js'

process.on('unhandledRejection', err => {
	console.log(`\n  *** unhandledRejection -> ${String(err?.message || err).slice(0, 72)}`)
	console.log('      (on Node >= 15 this terminates the whole bot process)')
	report()
	process.exit(0)
})

const transport = new RelayRtcTransport({ onTransportMessage: () => {} })

const relayList = {
	relays: [{
		relay_id: 7,
		relay_name: 'edge-1',
		token_id: 0,
		addresses: [{ protocol: 0, ipv4: '157.240.24.133', port: 3478 }]
	}],
	relay_tokens: ['tok'],
	relay_key: 'key'
}

console.log('(a) handing the transport a relay list, with @roamhq/wrtc NOT installed...')
transport.updateRelayList(relayList)

// (b) oversized packet -> dropped before it ever reaches a data channel
const huge = new Uint8Array(512 * 1024)
transport.send(huge, '157.240.24.133', 3478)
transport.send(huge, '157.240.24.133', 3478)

function report() {
	const stats = transport.getStats()
	console.log('\n(b) two 512 KB packets were dropped (MAX_BUFFER_SIZE is 256 KB)')
	console.log('    getStats().droppedPackets =', stats.droppedPackets,
		stats.droppedPackets === 2 ? ' ok' : ' *** WRONG -- the only drop counter callers can see never moves ***')
	console.log('    per-connection counters exist internally but are not exposed at all:',
		typeof transport.getConnectionStats === 'function' ? 'getConnectionStats() present' : 'no getConnectionStats()')
}

setTimeout(() => { console.log('\n  no unhandled rejection observed'); report() }, 500)
