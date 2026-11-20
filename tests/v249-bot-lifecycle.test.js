// §2.136 — stop()/start() must own the socket lifecycle.
// §2.137 — the offline queue must be bounded.
// §2.138 — concurrent queue snapshots must not share one tmp path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import { mkdtemp, readFile, readdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Bot } from '../lib/Framework/Bot.js'

const quiet = { error() {}, warn() {}, info() {}, debug() {}, trace() {}, child() { return quiet } }

const mkSock = (log = []) => ({
	log,
	ev: new EventEmitter(),
	sendMessage: async jid => { log.push(`send ${jid}`); return { key: { id: 'x' } } },
	groupMetadata: async () => ({ participants: [] }),
	end: async () => { log.push('end') }
})

const tick = () => new Promise(r => setImmediate(r))

test('§2.136 stop() closes the socket and detaches its listeners', async () => {
	const bot = new Bot({ logger: quiet })
	const sock = mkSock()
	bot.socket = sock
	bot.isConnected = true
	bot.store = { close() { sock.log.push('store closed') } }
	let dispatched = 0
	sock.ev.on('messages.upsert', () => { dispatched++ })

	await bot.stop()

	assert.ok(sock.log.includes('end'), 'socket must be closed')
	assert.equal(sock.ev.listenerCount('messages.upsert'), 0, 'listeners must be detached')
	assert.equal(bot.socket, null)
	assert.equal(bot.isConnected, false)
	sock.ev.emit('messages.upsert', { messages: [], type: 'notify' })
	assert.equal(dispatched, 0, 'a stopped bot must not dispatch messages')
})

test('§2.136 listeners come off before the socket is closed', async () => {
	// the real socket.end() emits a final connection.update BEFORE dropping its own
	// listeners, so detaching afterwards would still let that close reach our handler
	const bot = new Bot({ logger: quiet })
	const order = []
	const sock = mkSock()
	sock.ev.removeAllListeners = event => order.push(`detach:${event}`)
	sock.end = async () => { order.push('end') }
	bot.socket = sock
	await bot.stop()
	assert.deepEqual(order, ['detach:messages.upsert', 'detach:connection.update', 'end'])
})

test('§2.136 a send after stop() rejects instead of queueing forever', async () => {
	const bot = new Bot({ logger: quiet })
	await bot.stop()
	await assert.rejects(() => bot.sendMessage('1@s.whatsapp.net', { text: 'hi' }), err => {
		assert.equal(err.output.statusCode, 503)
		return true
	})
	assert.equal(bot.messageQueue.length, 0)
})

test('§2.136 start() tears the previous socket down instead of orphaning it', async () => {
	const bot = new Bot({ logger: quiet })
	const first = mkSock()
	let dispatched = 0
	bot.socket = first
	first.ev.on('messages.upsert', () => { dispatched++ })
	// exercise the teardown half of start() without opening a real connection
	await bot._teardownSocket()
	assert.ok(first.log.includes('end'), 'the previous socket must be closed')
	first.ev.emit('messages.upsert', { messages: [], type: 'notify' })
	assert.equal(dispatched, 0, 'an orphaned socket must not keep running the middleware chain')
})

test('§2.136 teardown survives a socket whose end() throws', async () => {
	const bot = new Bot({ logger: quiet })
	bot.socket = { ev: new EventEmitter(), end: async () => { throw new Error('already closed') } }
	await bot._teardownSocket()
	assert.equal(bot.socket, null, 'the socket must be released even if closing failed')
})

test('§2.137 the offline queue is capped and refuses further sends', async () => {
	const bot = new Bot({ logger: quiet, maxQueueSize: 3 })
	const outcomes = []
	for (let i = 0; i < 6; i++) {
		let state = 'queued'
		bot.sendMessage('1@s.whatsapp.net', { text: `m${i}` }).then(
			() => { state = 'sent' },
			err => { state = `rejected ${err.output.statusCode}` }
		)
		await tick()
		outcomes.push(state)
	}
	assert.deepEqual(outcomes, ['queued', 'queued', 'queued', 'rejected 503', 'rejected 503', 'rejected 503'])
	assert.equal(bot.messageQueue.length, 3)
	bot.rejectQueue('cleanup')
})

test('§2.137 maxQueueSize 0 restores the unbounded behaviour', async () => {
	const bot = new Bot({ logger: quiet, maxQueueSize: 0 })
	for (let i = 0; i < 10; i++) bot.sendMessage('1@s.whatsapp.net', { text: 'x' }).catch(() => {})
	await tick()
	assert.equal(bot.messageQueue.length, 10)
	bot.rejectQueue('cleanup')
})

test('§2.137 the default cap is 1000', () => {
	assert.equal(new Bot({ logger: quiet }).maxQueueSize, 1000)
})

test('§2.138 overlapping snapshots leave one complete file and no tmp litter', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'jap-bot-queue-'))
	const queueFile = path.join(dir, 'queue.json')
	const bot = new Bot({ logger: quiet, queueFile, maxQueueSize: 0 })

	await Promise.all(
		Array.from({ length: 25 }, (_, i) => {
			bot.sendMessage(`${i}@s.whatsapp.net`, { text: 'x' }).catch(() => {})
			return bot._persistQueue()
		})
	)

	const parsed = JSON.parse(await readFile(queueFile, 'utf-8'))
	assert.ok(Array.isArray(parsed))
	assert.equal(parsed.length, 25, 'the last snapshot must be the complete one')
	assert.equal(parsed[0].jid, '0@s.whatsapp.net')
	const leftovers = (await readdir(dir)).filter(f => f.includes('.tmp-'))
	assert.equal(leftovers.length, 0, 'no temp file may be left behind')
	bot.rejectQueue('cleanup')
})

test('§2.138 a restored queue round-trips through the persisted file', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'jap-bot-queue-'))
	const queueFile = path.join(dir, 'queue.json')
	await writeFile(queueFile, JSON.stringify([{ jid: '7@s.whatsapp.net', content: { text: 'hello' }, options: {} }]))
	const bot = new Bot({ logger: quiet, queueFile })
	await bot._loadPersistedQueue()
	assert.equal(bot.messageQueue.length, 1)
	assert.equal(bot.messageQueue[0].jid, '7@s.whatsapp.net')

	const sock = mkSock()
	bot.socket = sock
	bot.isConnected = true
	bot.drainQueue()
	await tick()
	assert.deepEqual(sock.log, ['send 7@s.whatsapp.net'])
	assert.equal(bot.messageQueue.length, 0)
})
