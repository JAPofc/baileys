/**
 * Repro for BUGREPORT 2.71 -- autoReconnect() ignored the disconnect classifier and
 * reconnected forever on fatal closes. Only `loggedOut` ever stopped the chain.
 *
 * BEFORE is the real module with the classifier branch removed.
 *
 * Run: node scripts/ah-repro.mjs
 */
import EventEmitter from 'events'
import { readFile, writeFile, unlink } from 'fs/promises'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from '../lib/Types/index.js'

const SRC = new URL('../lib/Utils/auto-reconnect.js', import.meta.url)
const TMP = new URL('../lib/Utils/auto-reconnect.__before__.mjs', import.meta.url)

const silent = { debug() {}, info() {}, warn() {}, error() {}, trace() {} }
silent.child = () => silent

const WINDOW_MS = 150

const drive = async (autoReconnect, code) => {
	let built = 0
	let fatal = null
	const factory = () => {
		built++
		const ev = new EventEmitter()
		setImmediate(() => ev.emit('connection.update', {
			connection: 'close',
			lastDisconnect: { error: new Boom('closed', { statusCode: code }) }
		}))
		return { ev, end: async () => {} }
	}

	const manager = autoReconnect(factory, {
		logger: silent,
		baseDelayMs: 1,
		maxDelayMs: 2,
		jitter: 0,
		onFatal: v => { fatal = v }
	})
	await manager.start()
	await new Promise(r => setTimeout(r, WINDOW_MS))
	await manager.stop()
	return { built, fatal }
}

const CASES = [
	[DisconnectReason.connectionReplaced, 'connectionReplaced', 'another process owns this session'],
	[DisconnectReason.forbidden, 'forbidden', 'the number is banned/restricted'],
	[DisconnectReason.multideviceMismatch, 'multideviceMismatch', 're-pair required'],
	[DisconnectReason.badSession, 'badSession', 'corrupt only after a streak'],
	[DisconnectReason.loggedOut, 'loggedOut', 'already handled before the fix'],
	[DisconnectReason.connectionLost, 'connectionLost', 'transient — MUST keep retrying']
]

const original = await readFile(SRC, 'utf8')
const cut = original.indexOf('            const verdict = classifyDisconnect(lastDisconnect);')
const end = original.indexOf('            attempts += 1;', cut)
if (cut < 0 || end < 0) {
	throw new Error('fixed classifier branch not found -- repro is out of date')
}

const before = original.slice(0, cut) + `            if (statusCode === DisconnectReason.loggedOut) {
                try { onLoggedOut?.(lastDisconnect?.error); } catch {}
                return;
            }
` + original.slice(end)
await writeFile(TMP, before)

let beforeMod
try {
	beforeMod = (await import(TMP.href)).autoReconnect
	console.log(`each case runs for ${WINDOW_MS}ms; "sockets" = how many connections were opened\n`)
	console.log('case                  before   after   what the classifier always said')
	for (const [code, label, note] of CASES) {
		const b = await drive(beforeMod, code)
		const a = await drive((await import(SRC.href)).autoReconnect, code)
		console.log(
			`${label.padEnd(20)} ${String(b.built).padStart(5)}   ${String(a.built).padStart(5)}   ${note}` +
			(a.fatal ? `\n${' '.repeat(22)}onFatal → ${a.fatal.message.split('\n')[0]}` : '')
		)
	}
} finally {
	await unlink(TMP)
}
