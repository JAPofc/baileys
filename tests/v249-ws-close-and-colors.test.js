// §2.118 — WebSocketClient.close() must settle even when the server closed us first.
// §2.119 — numeric colours must survive assertColor().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocketServer } from 'ws'
import { WebSocketClient } from '../lib/Socket/Client/websocket.js'
import { generateWAMessageContent } from '../lib/Utils/messages.js'

const withServer = async (port, onConnection, body) => {
	const wss = new WebSocketServer({ port })
	wss.on('connection', onConnection)
	try {
		await body(new URL(`ws://127.0.0.1:${port}`))
	}
	finally {
		await new Promise(resolve => wss.close(resolve))
	}
}
const config = { connectTimeoutMs: 2000, options: {} }
const once = (emitter, event) => new Promise(resolve => emitter.once(event, resolve))

test('§2.118 close() resolves after the server dropped the socket', async () => {
	await withServer(18110, ws => setTimeout(() => ws.close(), 50), async url => {
		const client = new WebSocketClient(url, config)
		client.connect()
		await once(client, 'open')
		await once(client, 'close')
		assert.equal(client.isClosed, true)
		const outcome = await Promise.race([
			client.close().then(() => 'resolved'),
			new Promise(resolve => setTimeout(() => resolve('hung'), 1000))
		])
		assert.equal(outcome, 'resolved')
	})
})

test('§2.118 close() still resolves on a live socket, and is idempotent', async () => {
	await withServer(18111, () => {}, async url => {
		const client = new WebSocketClient(url, config)
		client.connect()
		await once(client, 'open')
		await client.close()
		assert.equal(client.isClosed, true)
		await client.close()   // must not throw or hang
	})
})

test('§2.118 a client whose socket died can connect again', async () => {
	let connections = 0
	await withServer(18112, ws => { connections += 1; if (connections === 1) ws.close() }, async url => {
		const client = new WebSocketClient(url, config)
		client.connect()
		await once(client, 'close')
		client.connect()
		await once(client, 'open')
		assert.equal(client.isOpen, true)
		await client.close()
	})
})

test('§2.118 the grace period is configurable and unref-ed', () => {
	assert.equal(typeof WebSocketClient.CLOSE_GRACE_MS, 'number')
	assert.ok(WebSocketClient.CLOSE_GRACE_MS > 0)
})

const argb = async color => (await generateWAMessageContent({ text: 'hai' }, {
	upload: async () => ({}), backgroundColor: color, font: 2
})).extendedTextMessage?.backgroundArgb

test('§2.119 numeric colours are kept, not dropped', async () => {
	assert.equal(await argb(0xff112233), 0xff112233)
	assert.equal(await argb(-1), 0xffffffff)
	assert.equal(await argb(0x7f00ff00), 0x7f00ff00)
})

test('§2.119 string colours keep working and junk is rejected', async () => {
	assert.equal(await argb('#112233'), 0xff112233)
	assert.equal(await argb('112233'), 0xff112233)
	assert.equal(await argb('FF112233'), 0xff112233)
	assert.equal(await argb('zzz'), undefined)
	assert.equal(await argb('#GG0000'), undefined)
	assert.equal(await argb(''), undefined)
})
