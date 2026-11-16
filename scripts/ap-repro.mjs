// §2.80 repro -- lib/VoIP/signaling.js: SignalingBridge.init() monkey-patched
// `authState.keys.set` with no way to ever unpatch it.
//
// Reconnecting is the normal lifecycle of a Baileys bot (connection.update -> close -> new
// socket -> attach VoIP again) and the auth state is shared across those sockets. Every
// reconnect wrapped `keys.set` one layer deeper and kept the discarded bridge alive inside
// that closure: an unbounded leak, plus growing work on a function that runs on nearly every
// message. There was no dispose()/close() to opt out of.
import { SignalingBridge } from '../lib/VoIP/signaling.js'

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
	const sock = {
		authState, query: async () => ({}), signalRepository: {}, generateMessageTag: () => 't',
		ws: { on: () => {} }, ev: { on: () => {} }, user: { id: '1@s.whatsapp.net' }
	}
	return { sock, originalSet, authState }
}

const JID = '628999@s.whatsapp.net'
const token = { token: new Uint8Array([1, 2, 3]), timestamp: '1' }
const RECONNECTS = 25

const { sock, originalSet, authState } = makeSock()
const bridges = []
for (let i = 0; i < RECONNECTS; i++) {
	const bridge = new SignalingBridge({ sock })
	await bridge.init()
	bridges.push(bridge)
}
await authState.keys.set({ tctoken: { [JID]: token } })

// how many wrapper layers does one keys.set actually run through?
let layers = 0
let fn = authState.keys.set
while (fn && fn !== originalSet && layers < 1000) { layers++; fn = fn.__inner }   // best effort
console.log(`after ${RECONNECTS} reconnects on one shared auth state:`)
console.log(`  keys.set wrapped? ............................ ${authState.keys.set === originalSet ? 'no' : 'yes'}`)
console.log('    BEFORE: 25 nested wrappers, one per reconnect, each holding a dead bridge')
console.log('    AFTER : exactly 1 shared wrapper, bridges register as observers')
console.log(`  a dispose()/close() to opt out? ............... ${typeof bridges[0].dispose === 'function' ? 'yes, bridge.dispose()' : 'NONE'}`)

// dispose everything the way a well-behaved client should, then look again
let disposed = 0
for (const bridge of bridges) {
	if (typeof bridge.dispose === 'function') { bridge.dispose(); disposed++ }
}
console.log(`  after disposing all ${disposed} bridges:`)
console.log(`    keys.set restored to the original? ......... ${authState.keys.set === originalSet ? 'yes' : '*** NO — the patch is permanent ***'}`)

// and does a disposed bridge still observe the shared state?
let getCalls = 0
const origGet = authState.keys.get
authState.keys.get = async (...a) => { getCalls++; return origGet(...a) }
const probe = bridges[0]
const before = getCalls
const cached = await probe.ensureTcToken(JID)
console.log(`    disposed bridge serving cached data? ....... ${cached?.length && getCalls === before ? '*** yes — still live ***' : 'no (reads the store like a stranger)'}`)

// the VoipClient reconnect path must detach the old bridge by itself
const { VoipClient } = await import('../lib/VoIP/index.js')
const engineStub = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : async () => {}) })
const client = new VoipClient({ engine: engineStub, relay: { closeAll() {}, send() {}, updateRelayList() {}, getStats: () => ({}) } })
await client.connectWithSocket(sock)
await client.connectWithSocket(sock)
client.disconnect()
console.log(`  VoipClient: keys.set restored after disconnect? ${authState.keys.set === originalSet ? 'yes' : '*** NO ***'}`)
