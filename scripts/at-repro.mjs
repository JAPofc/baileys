// §2.87 repro -- a logger that is not pino crashes the connection, deep inside the handshake.
//
// The config accepts any `logger`, and most of the library only calls level methods
// (info/warn/error/debug/trace). But `noise-handler.js` calls `logger.child({ class: 'ns' })`
// unconditionally, and the in-memory store does the same. `console`, a bunyan/winston-style
// logger, or a pino v8 logger wrapped by an app helper -> TypeError at connect time, with a
// stack that points at the Noise handshake rather than at the logger the user passed.
import { makeNoiseHandler } from '../lib/Utils/noise-handler.js'
import { Curve } from '../lib/Utils/crypto.js'

const keyPair = Curve.generateKeyPair()

const loggers = {
	'pino (default)': (await import('../lib/Utils/logger.js')).default,
	'console': console,
	'pino v8 style (no child)': { info() {}, warn() {}, error() {}, debug() {}, trace() {}, level: 'info' },
	'silent object': {}
}

for (const [label, logger] of Object.entries(loggers)) {
	let outcome
	try {
		makeNoiseHandler({ keyPair, NOISE_HEADER: Buffer.from([87, 65, 6, 3]), logger, routingInfo: undefined })
		outcome = 'ok — handshake handler created'
	} catch (err) {
		outcome = `*** ${err.constructor.name}: ${err.message} ***`
	}
	console.log(`  ${label.padEnd(26)} ${outcome}`)
}
