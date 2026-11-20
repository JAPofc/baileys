// §2.77 — partial/Range media downloads: the startByte-only regression, the empty-body
// diagnostic, and the downloadMediaRange()/downloadMediaHeader() helpers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import Crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { downloadEncryptedContent, downloadMediaRange, downloadMediaHeader } from '../lib/index.js'

const PLAIN = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251))
const cipherKey = Crypto.randomBytes(32)
const iv = Crypto.randomBytes(16)
const cipher = Crypto.createCipheriv('aes-256-cbc', cipherKey, iv)
const FILE = Buffer.concat([cipher.update(PLAIN), cipher.final(), Crypto.randomBytes(10)])

const startServer = handler => new Promise(resolve => {
	const server = http.createServer(handler)
	server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/m.enc` }))
})

const rangeHandler = (req, res) => {
	const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
	if (!m) {
		res.writeHead(200, { 'content-length': FILE.length })
		return res.end(FILE)
	}
	const start = m[1] ? Number(m[1]) : 0
	const end = m[2] ? Math.min(Number(m[2]), FILE.length - 1) : FILE.length - 1
	const slice = FILE.subarray(start, end + 1)
	res.writeHead(206, { 'content-length': slice.length, 'content-range': `bytes ${start}-${end}/${FILE.length}` })
	res.end(slice)
}

const drain = async stream => {
	const chunks = []
	for await (const chunk of stream) chunks.push(chunk)
	return Buffer.concat(chunks)
}

const read = async (url, opts) => drain(await downloadEncryptedContent(url, { cipherKey, iv },
	{ ...opts, options: { allowPrivate: true, checkDns: false } }))

test('§2.77 full download round-trips', async () => {
	const { server, url } = await startServer(rangeHandler)
	try {
		assert.ok((await read(url, {})).equals(PLAIN))
	} finally { server.close() }
})

test('§2.77 startByte on its own returns the rest of the file, not zero bytes', async () => {
	const { server, url } = await startServer(rangeHandler)
	try {
		const got = await read(url, { startByte: 512 })
		assert.notEqual(got.length, 0, 'the resumed range came back empty')
		assert.ok(got.equals(PLAIN.subarray(512)))
	} finally { server.close() }
})

test('§2.77 startByte+endByte and endByte-only still slice exactly', async () => {
	const { server, url } = await startServer(rangeHandler)
	try {
		assert.ok((await read(url, { startByte: 100, endByte: 300 })).equals(PLAIN.subarray(100, 300)))
		assert.ok((await read(url, { endByte: 64 })).equals(PLAIN.subarray(0, 64)))
		assert.ok((await read(url, { startByte: 1, endByte: 999 })).equals(PLAIN.subarray(1, 999)))
	} finally { server.close() }
})

test('§2.77 a start byte past the end yields an empty range rather than garbage', async () => {
	const { server, url } = await startServer(rangeHandler)
	try {
		const got = await read(url, { startByte: PLAIN.length })
		assert.equal(got.length, 0)
	} finally { server.close() }
})

test('§2.77 an empty response body reports why instead of TypeError on undefined', async () => {
	const { server, url } = await startServer((_, res) => { res.writeHead(200, { 'content-length': 0 }); res.end() })
	try {
		await assert.rejects(read(url, {}), err => {
			assert.match(err.message, /empty body/i)
			assert.doesNotMatch(err.message, /undefined/)
			assert.equal(err.output?.statusCode ?? err.statusCode, 502)
			return true
		})
	} finally { server.close() }
})

test('§2.77 downloadMediaRange validates its arguments', async () => {
	const msg = { message: { imageMessage: { url: 'https://example.com/x', mediaKey: Buffer.alloc(32) } } }
	await assert.rejects(downloadMediaRange(msg, { start: -1 }), /non-negative/)
	await assert.rejects(downloadMediaRange(msg, { start: 1.5 }), /non-negative/)
	await assert.rejects(downloadMediaRange(msg, { end: 10, length: 10 }), /not both/)
	await assert.rejects(downloadMediaRange(msg, { start: 10, end: 10 }), /empty/)
	await assert.rejects(downloadMediaRange(msg, { start: 10, end: 5 }), /empty/)
	await assert.rejects(downloadMediaRange(msg, { length: 0 }), /positive integer/)
	await assert.rejects(downloadMediaHeader(msg, 0), /positive integer/)
})

test('§2.77 downloadMediaRange turns {start,length} into the right byte window', async () => {
	const seen = []
	const fake = {
		message: { documentMessage: { url: 'https://mmg.whatsapp.net/doc', mediaKey: Buffer.alloc(32) } }
	}
	const options = {
		options: {
			allowPrivate: true,
			checkDns: false,
			fetchImpl: async (_url, init) => {
				seen.push(init.headers?.Range)
				return { ok: true, headers: { get: () => null }, body: null }
			}
		}
	}
	// we only care about the Range header that gets built, so let the body blow up afterwards
	await downloadMediaRange(fake, { start: 100, length: 50 }, options).catch(() => {})
	await downloadMediaHeader(fake, 32, options).catch(() => {})
	assert.ok(seen.length >= 2, `no Range header was issued (${seen.length})`)
	// start 100 / length 50 -> window [100, 150); the fetch is chunk-aligned around it
	const parsed = seen.map(r => /bytes=(\d+)-(\d+)/.exec(r)).map(m => m && [Number(m[1]), Number(m[2])])
	const first = parsed[0]
	const second = parsed[parsed.length - 1]
	assert.ok(first && first[0] <= 100 && first[1] >= 150, `bad range for {start:100,length:50}: ${seen[0]}`)
	assert.ok(second && second[0] === 0 && second[1] >= 32, `bad range for header peek: ${seen[1]}`)
})

test('§2.77 the socket exposes downloadMediaRange/downloadMediaHeader with retry wiring', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	assert.match(src, /downloadMediaRange: \(message, range = \{\}, options = \{\}\) => \{/)
	assert.match(src, /downloadMediaHeader: \(message, bytes = 64, options = \{\}\) => \{/)
	const body = src.slice(src.indexOf('downloadMediaRange: (message'), src.indexOf('downloadMediaHeader: (message'))
	assert.match(body, /reuploadRequest: messagesSocket\.updateMediaMessage/)
	assert.match(body, /disableRetry/)
})

test('§2.77 the new helpers are declared for TypeScript consumers', () => {
	const messages = readFileSync(new URL('../lib/Utils/messages.d.ts', import.meta.url), 'utf8')
	assert.match(messages, /export type MediaRange/)
	assert.match(messages, /export function downloadMediaRange/)
	assert.match(messages, /export function downloadMediaHeader/)
	for (const file of ['../lib/Socket/messages-send.d.ts', '../lib/Socket/index.d.ts']) {
		const dts = readFileSync(new URL(file, import.meta.url), 'utf8')
		assert.match(dts, /downloadMediaRange:/, file)
		assert.match(dts, /downloadMediaHeader:/, file)
	}
})

test('§2.77 the range trimming never depends on an undefined bound', () => {
	const src = readFileSync(new URL('../lib/Utils/messages-media.js', import.meta.url), 'utf8')
	const fn = src.slice(src.indexOf('const pushBytes ='), src.indexOf('const output = new Transform'))
	assert.match(fn, /startByte !== undefined/)
	assert.match(fn, /endByte !== undefined/)
	assert.doesNotMatch(fn, /bytesFetched >= startByte \? undefined/)
})
