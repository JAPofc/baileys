// §2.186 — animated stickers lost their animation in conversion.
// §2.187 — an already-WebP input skipped the 512 box entirely.
// §2.188 — group cache: destructured bind() threw; rebinding leaked the old socket.
// §2.189 — group cache advertised LRU, evicted FIFO.
// §2.190 — group cache: a burst of sends to one cold group issued one query each.
// §2.191 — anti-delete: a revoke key without remoteJid recovered nothing.
// §2.192 — anti-delete: clearChat() left the deleted-message records behind.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { convertToWebP, _toStickerWebP, isAnimatedWebP, isWebPBuffer } from '../lib/Utils/stickerpack.js'
import { createGroupMetadataCache } from '../lib/Utils/group-cache.js'
import { MessageStore, createAntiDeleteUpsertHandler, createMessageStoreHandler } from '../lib/Utils/anti-delete.js'
import { proto } from '../WAProto/index.js'

const REVOKE = proto.Message.ProtocolMessage.Type.REVOKE

const solid = (w, h, background = '#f00') =>
	sharp({ create: { width: w, height: h, channels: 3, background } })

/** A real 3-frame animated GIF, built through sharp so it is genuinely decodable. */
const animatedGif = async () => {
	const frames = Buffer.concat(
		await Promise.all(['#f00', '#0f0', '#00f'].map(c => solid(64, 64, c).raw().toBuffer()))
	)
	return sharp(frames, { raw: { width: 64, height: 192, channels: 3, pageHeight: 64 } })
		.gif({ delay: [100, 100, 100] })
		.toBuffer()
}

describe('§2.186/§2.187 sticker conversion', () => {
	test('an animated GIF stays animated', async () => {
		const gif = await animatedGif()
		assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 3, 'fixture must really be animated')

		const out = await convertToWebP(gif)

		assert.equal((await sharp(out.buffer, { animated: true }).metadata()).pages, 3,
			'every frame must survive the conversion')
		assert.ok(isAnimatedWebP(out.buffer), 'the WebP must carry an ANIM chunk')
		assert.equal(out.isAnimated, true, 'and must be reported as animated')
	})

	test('a still image is converted and fitted into the 512 box', async () => {
		const out = await convertToWebP(await solid(300, 100).png().toBuffer())
		const meta = await sharp(out.buffer).metadata()
		assert.equal(meta.format, 'webp')
		assert.deepEqual([meta.width, meta.height], [512, 171], 'scaled to fit, aspect kept')
		assert.equal(out.isAnimated, false)
	})

	test('an oversized WebP is no longer passed through at the wrong size', async () => {
		const big = await solid(600, 600, '#00f').webp().toBuffer()
		assert.ok(isWebPBuffer(big))

		const out = await convertToWebP(big)

		assert.equal((await sharp(out.buffer).metadata()).width, 512,
			'a 600x600 "sticker" used to go out untouched at 600x600')
	})

	test('a WebP already inside the box is passed through untouched', async () => {
		const small = await solid(200, 200, '#0f0').webp().toBuffer()
		const out = await convertToWebP(small)
		// not reference-equal -- getStream/toBuffer copy on the way in -- but byte-identical,
		// which is what "passed through" has to mean here.
		assert.ok(out.buffer.equals(small), 'no pointless re-encode')
		assert.equal(out.isAnimated, false)
	})

	test('the tray icon never carries animation', async () => {
		const lib = { sharp: { default: sharp } }
		const out = await _toStickerWebP(await animatedGif(), lib, { allowAnimated: false })
		assert.equal(out.isAnimated, false)
		assert.ok(!isAnimatedWebP(out.buffer), 'WhatsApp shows the pack cover as a still')
		assert.equal((await sharp(out.buffer, { animated: true }).metadata()).pages ?? 1, 1)
	})

	test('no image library at all is still an error, not a silent pass', async () => {
		await assert.rejects(_toStickerWebP(Buffer.alloc(4), {}), /No image processing library/)
	})
})

describe('§2.188/§2.189/§2.190 group metadata cache', () => {
	const mkSock = () => {
		const listeners = {}
		return {
			listeners,
			ev: {
				on: (e, f) => (listeners[e] ||= []).push(f),
				off: (e, f) => { listeners[e] = (listeners[e] || []).filter(x => x !== f) },
				emit: (e, d) => (listeners[e] || []).forEach(f => f(d))
			},
			groupMetadata: async jid => ({ id: jid, subject: 'g' })
		}
	}
	const count = sock => (sock.listeners['groups.update'] || []).length

	test('bind() works destructured off the object', () => {
		const cache = createGroupMetadataCache()
		const { bind } = cache // exactly as the module docstring shows it
		const sock = mkSock()
		const off = bind(sock)
		assert.equal(count(sock), 1)
		off() // used to throw: Cannot read properties of undefined (reading 'unbind')
		assert.equal(count(sock), 0)
	})

	test('rebinding detaches the previous socket', () => {
		const cache = createGroupMetadataCache()
		const first = mkSock()
		const second = mkSock()
		cache.bind(first)
		cache.bind(second)
		assert.equal(count(first), 0, 'the superseded socket must be released')
		assert.equal(count(second), 1)
		cache.unbind()
		assert.equal(count(second), 0)
	})

	test('a stale off() does not detach the current binding', () => {
		const cache = createGroupMetadataCache()
		const first = mkSock()
		const second = mkSock()
		const staleOff = cache.bind(first)
		cache.bind(second)
		staleOff()
		assert.equal(count(second), 1, 'the newer binding must survive a stale handle')
	})

	test('an update through the bound socket invalidates that group', async () => {
		const cache = createGroupMetadataCache()
		const sock = mkSock()
		cache.bind(sock)
		await cache.cachedGroupMetadata('1@g.us')
		assert.ok(cache.get('1@g.us'))
		sock.ev.emit('groups.update', [{ id: '1@g.us' }])
		assert.equal(cache.get('1@g.us'), null)
		assert.equal(cache.stats.invalidations, 1)
	})

	test('eviction is LRU, not insertion order', () => {
		const cache = createGroupMetadataCache({ maxSize: 2 })
		cache.set('g1', { id: 'g1' })
		cache.set('g2', { id: 'g2' })
		cache.get('g1') // a read is a use
		cache.set('g3', { id: 'g3' })

		assert.ok(cache.get('g1'), 'the recently used entry must be kept')
		assert.equal(cache.get('g2'), null, 'the least recently used one goes')
		assert.equal(cache.stats.size, 2)
	})

	test('a burst on one cold group makes a single query', async () => {
		let queries = 0
		const cache = createGroupMetadataCache()
		cache.bind({
			ev: { on() {}, off() {} },
			groupMetadata: async jid => {
				queries++
				await new Promise(r => setTimeout(r, 10))
				return { id: jid }
			}
		})

		const results = await Promise.all(Array.from({ length: 8 }, () => cache.cachedGroupMetadata('g@g.us')))

		assert.equal(queries, 1, 'eight parallel sends used to mean eight queries')
		assert.ok(results.every(r => r?.id === 'g@g.us'), 'every caller still gets the metadata')

		// and the shared promise must not linger and pin a stale result
		queries = 0
		cache.invalidate('g@g.us')
		await cache.cachedGroupMetadata('g@g.us')
		assert.equal(queries, 1, 'a later miss must fetch again')
	})

	test('a failed fetch serves the stale entry rather than throwing', async () => {
		const cache = createGroupMetadataCache({ ttlMs: 0 })
		cache.set('g@g.us', { id: 'g@g.us', subject: 'lama' })
		cache.bind({ ev: { on() {}, off() {} }, groupMetadata: async () => { throw new Error('offline') } })
		assert.equal((await cache.cachedGroupMetadata('g@g.us'))?.subject, 'lama')
	})
})

describe('§2.191/§2.192 anti-delete store', () => {
	const chat = '120@g.us'
	const sender = '62811@s.whatsapp.net'
	const seed = store => createMessageStoreHandler(store)({
		messages: [{ key: { remoteJid: chat, id: 'M1', participant: sender }, message: { conversation: 'rahasia' } }]
	})

	test('a revoke whose key carries only an id still recovers the message', () => {
		const store = new MessageStore()
		seed(store)
		const seen = []
		createAntiDeleteUpsertHandler(store, i => seen.push(i))({
			messages: [{
				key: { remoteJid: chat, id: 'R1', participant: sender },
				message: { protocolMessage: { type: REVOKE, key: { id: 'M1' } } }
			}]
		})

		assert.equal(seen.length, 1, 'the chat is implied by the envelope, not repeated in the key')
		assert.equal(seen[0].originalMessage.message.conversation, 'rahasia')
		assert.equal(seen[0].isRevokedBySender, true)
	})

	test('a fully-specified key keeps working', () => {
		const store = new MessageStore()
		seed(store)
		const seen = []
		createAntiDeleteUpsertHandler(store, i => seen.push(i))({
			messages: [{
				key: { remoteJid: chat, id: 'R2', participant: sender },
				message: { protocolMessage: { type: REVOKE, key: { id: 'M1', remoteJid: chat } } }
			}]
		})
		assert.equal(seen.length, 1)
	})

	test('an unknown message is not invented', () => {
		const store = new MessageStore()
		const seen = []
		createAntiDeleteUpsertHandler(store, i => seen.push(i))({
			messages: [{
				key: { remoteJid: chat, id: 'R3' },
				message: { protocolMessage: { type: REVOKE, key: { id: 'never-seen' } } }
			}]
		})
		assert.deepEqual(seen, [])
	})

	test('clearChat() forgets the deleted-message records too', () => {
		const store = new MessageStore()
		seed(store)
		createAntiDeleteUpsertHandler(store, () => {})({
			messages: [{
				key: { remoteJid: chat, id: 'R1', participant: sender },
				message: { protocolMessage: { type: REVOKE, key: { id: 'M1' } } }
			}]
		})
		assert.equal(store.getDeletedMessagesByChat(chat).length, 1)

		store.clearChat(chat)

		assert.equal(store.getDeletedMessagesByChat(chat).length, 0, 'recovered content must go with the chat')
		assert.equal(store.getStats().totalDeleted, 0)
		assert.equal(store.getStats().totalMessages, 0)
	})

	test('clearChat() leaves other chats alone', () => {
		const store = new MessageStore()
		seed(store)
		createMessageStoreHandler(store)({
			messages: [{ key: { remoteJid: 'other@g.us', id: 'M2', participant: sender }, message: { conversation: 'b' } }]
		})
		createAntiDeleteUpsertHandler(store, () => {})({
			messages: [{
				key: { remoteJid: 'other@g.us', id: 'R9', participant: sender },
				message: { protocolMessage: { type: REVOKE, key: { id: 'M2' } } }
			}]
		})
		store.clearChat(chat)
		assert.equal(store.getDeletedMessagesByChat('other@g.us').length, 1)
		store.stopCleanup()
	})
})
