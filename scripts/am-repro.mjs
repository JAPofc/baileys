// §2.77 repro -- partial (Range) media download returns ZERO bytes when only `startByte` is given.
//
// `downloadEncryptedContent(url, keys, { startByte })` is the documented way to resume a
// half-finished media download, or to grab "everything after byte N". The HTTP range request
// is issued correctly and the server streams the right bytes back -- but the trimming step
// throws every single one of them away, and the caller just gets an empty, successfully
// "completed" stream.
import http from 'http'
import Crypto from 'crypto'
import { downloadEncryptedContent } from '../lib/index.js'

const PLAIN = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251))
const cipherKey = Crypto.randomBytes(32)
const iv = Crypto.randomBytes(16)
const c = Crypto.createCipheriv('aes-256-cbc', cipherKey, iv)
const FILE = Buffer.concat([c.update(PLAIN), c.final(), Crypto.randomBytes(10) /* mac tail */])

const server = http.createServer((req, res) => {
	const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
	if (!range) {
		res.writeHead(200, { 'content-length': FILE.length })
		return res.end(FILE)
	}
	const start = range[1] ? Number(range[1]) : 0
	const end = range[2] ? Math.min(Number(range[2]), FILE.length - 1) : FILE.length - 1
	const slice = FILE.subarray(start, end + 1)
	res.writeHead(206, { 'content-length': slice.length, 'content-range': `bytes ${start}-${end}/${FILE.length}` })
	res.end(slice)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/media.enc`

const read = async opts => {
	const stream = await downloadEncryptedContent(url, { cipherKey, iv },
		{ ...opts, options: { allowPrivate: true, checkDns: false } })
	const chunks = []
	for await (const ch of stream) chunks.push(ch)
	return Buffer.concat(chunks)
}

const cases = [
	['full download                     ', {}, PLAIN],
	['{ startByte: 512 }  (resume)      ', { startByte: 512 }, PLAIN.subarray(512)],
	['{ startByte: 100, endByte: 300 }  ', { startByte: 100, endByte: 300 }, PLAIN.subarray(100, 300)],
	['{ endByte: 64 }     (header peek) ', { endByte: 64 }, PLAIN.subarray(0, 64)]
]

console.log(`plaintext = ${PLAIN.length} bytes\n`)
console.log('  request                             got      expected  verdict')
for (const [label, opts, expected] of cases) {
	let got, verdict
	try {
		got = await read(opts)
		verdict = got.equals(expected) ? 'ok'
			: got.length === 0 ? '*** EMPTY -- every byte dropped ***'
			: `WRONG BYTES (first mismatch at ${[...expected].findIndex((b, i) => got[i] !== b)})`
	} catch (err) {
		got = Buffer.alloc(0)
		verdict = `threw -> ${err.message.slice(0, 48)}`
	}
	console.log(`  ${label}  ${String(got.length).padStart(5)}    ${String(expected.length).padStart(5)}     ${verdict}`)
}

// and an empty body (CDN 206 with nothing in it) -- what does the caller see?
const empty = http.createServer((_, res) => { res.writeHead(200, { 'content-length': 0 }); res.end() })
await new Promise(r => empty.listen(0, '127.0.0.1', r))
try {
	await read.call(null, {})
} catch {}
try {
	const stream = await downloadEncryptedContent(`http://127.0.0.1:${empty.address().port}/x`,
		{ cipherKey, iv }, { options: { allowPrivate: true, checkDns: false } })
	for await (const _ of stream) { /* drain */ }
	console.log('\n  empty response body                 -> resolved with 0 bytes')
} catch (err) {
	console.log(`\n  empty response body                 -> ${err.constructor.name}: ${err.message.slice(0, 60)}`)
}
server.close(); empty.close()
