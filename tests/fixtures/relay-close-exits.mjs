// §2.218 fixture: open a relay connection, close it, and exit on our own.
// A leaked RTCPeerConnection keeps libuv handles alive, so "this script terminates" IS the
// assertion. The watchdog below exists only to make the failure loud instead of silent.
import { RelayRtcTransport } from '../../lib/VoIP/relay-transport.js'

const transport = new RelayRtcTransport({
	onTransportMessage: () => {},
	onTransportError: () => {},
	logger: { warn: () => {} }
})

transport.updateRelayList({
	relays: [{ relay_id: 7, relay_name: 'edge-1', token_id: 0, addresses: [{ protocol: 0, ipv4: '10.0.0.1', port: 3478 }] }],
	relay_tokens: ['tok'],
	relay_key: 'key'
})

// Close IMMEDIATELY. That is the race: #connect() awaits the wrtc import before it
// constructs anything, so the peer is born after closeAll() has already walked the map.
// An earlier version of this fixture waited 250ms first -- by then the connect had
// finished and landed in the map, plain closeAll() handled it, and three separate
// mutations of the fix still passed. A test that cannot fail proves nothing.
await transport.closeAll()
console.log('closed-cleanly')

setTimeout(() => {
	console.error('still alive: a peer connection leaked')
	process.exit(9)
}, 5000).unref()
