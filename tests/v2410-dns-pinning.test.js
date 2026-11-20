import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'

import { createPinnedFetch, resolveSafeRedirectUrl } from '../lib/Utils/messages-media.js'
import { createPinnedLinkPreviewFetcher, getUrlInfo } from '../lib/Utils/link-preview.js'

/**
 * §2.211 left one hole open and said so: we resolve a hostname, judge its addresses
 * public, then hand the *name* to fetch, which resolves it again. A DNS server that
 * answers differently the second time walks past the guard. These tests close it.
 *
 * The servers below bind to loopback, so every call passes `allowHosts` — that is the
 * carve-out for a known host, NOT `allowPrivate`, which would switch the guard off and
 * make the tests prove nothing.
 */

const listen = (handler) => new Promise(resolve => {
	const server = createServer(handler)
	server.listen(0, '127.0.0.1', () => resolve(server))
})
const addr = server => `http://localhost:${server.address().port}`

describe('createPinnedFetch — the address we validated is the address we use', () => {
	let origin
	let hits

	before(async () => {
		hits = []
		origin = await listen((req, res) => {
			hits.push(req.url)
			if (req.url === '/redirect') {
				res.writeHead(302, { location: '/landing' })
				res.end()
				return
			}
			if (req.url === '/json') {
				res.writeHead(200, { 'content-type': 'application/json' })
				res.end('{"ok":true}')
				return
			}
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end('<html><head><title>Landing &amp; co</title><meta property="og:description" content="from og"><meta property="og:image" content="/pic.png"></head></html>')
		})
	})
	after(() => origin?.close())

	it('fetches a page and reports status, headers and body', async () => {
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		const res = await doFetch(`${addr(origin)}/landing`)
		assert.equal(res.status, 200)
		assert.equal(res.ok, true)
		assert.match(res.headers.get('content-type'), /text\/html/)
		assert.match(await res.text(), /Landing/)
	})

	it('parses json and arrayBuffer like a Response', async () => {
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		assert.deepEqual(await (await doFetch(`${addr(origin)}/json`)).json(), { ok: true })
		const buf = await (await doFetch(`${addr(origin)}/json`)).arrayBuffer()
		assert.equal(Buffer.from(buf).toString(), '{"ok":true}')
	})

	it('never follows a redirect by itself — every hop must go back through the guard', async () => {
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		const res = await doFetch(`${addr(origin)}/redirect`)
		assert.equal(res.status, 302)
		assert.equal(res.headers.get('location'), '/landing')
		assert.equal(res.redirected, false)
		await res.body?.cancel?.()
	})

	it('still refuses a private host when it is not allow-listed', async () => {
		const doFetch = createPinnedFetch()
		await assert.rejects(() => doFetch(`${addr(origin)}/landing`), /private\/loopback/)
	})

	it('refuses a non-http protocol', async () => {
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		await assert.rejects(() => doFetch('file:///etc/passwd'), /Unsupported URL protocol/)
	})

	it('survives a Headers instance as well as a plain object', async () => {
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		const a = await doFetch(`${addr(origin)}/landing`, { headers: new Headers({ 'x-test': '1' }) })
		const b = await doFetch(`${addr(origin)}/landing`, { headers: { 'x-test': '1' } })
		assert.equal(a.status, 200)
		assert.equal(b.status, 200)
	})
})

describe('pinning beats a DNS answer that changes between the check and the request', () => {
	let origin
	let hits

	before(async () => {
		hits = []
		origin = await listen((req, res) => {
			hits.push(req.headers.host)
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end('<html><head><title>pinned</title></head></html>')
		})
	})
	after(() => origin?.close())

	it('passes the pinned address to the socket while keeping the real Host header', async () => {
		// this is the behaviour the whole fix rests on: connect by IP, address by name
		const doFetch = createPinnedFetch({ allowHosts: ['localhost'] })
		const res = await doFetch(`${addr(origin)}/`)
		assert.equal(res.status, 200)
		await res.text()
		assert.ok(hits.at(-1)?.startsWith('localhost:'), `Host header was ${hits.at(-1)}`)
	})

	it('resolveSafeRedirectUrl with pinDns resolves a chain and returns the final url', async () => {
		const chain = await listen((req, res) => {
			if (req.url === '/start') {
				res.writeHead(302, { location: '/end' })
				res.end()
				return
			}
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end('ok')
		})
		try {
			const final = await resolveSafeRedirectUrl(`${addr(chain)}/start`, {
				allowHosts: ['localhost'],
				pinDns: true
			})
			assert.equal(final.pathname, '/end')
		} finally {
			chain.close()
		}
	})

	it('pinDns actually swaps the client: the request is ours, not global fetch', async () => {
		// without this the plumbing could be dead code and every other test here would
		// still pass, because plain fetch reaches the same loopback server. The two
		// clients are distinguishable at the server: undici's fetch always sends
		// `accept` and `sec-fetch-mode`; our node:http client sends neither.
		const seen = []
		const spy = await listen((req, res) => {
			seen.push(req.headers)
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end('ok')
		})
		try {
			await resolveSafeRedirectUrl(`${addr(spy)}/x`, { allowHosts: ['localhost'], pinDns: true })
			const pinned = seen.at(-1)
			await resolveSafeRedirectUrl(`${addr(spy)}/x`, { allowHosts: ['localhost'] })
			const plain = seen.at(-1)

			assert.equal(pinned['sec-fetch-mode'], undefined, 'pinned client should not be undici fetch')
			assert.equal(pinned['accept'], undefined)
			assert.ok(plain['sec-fetch-mode'] || plain['accept'], 'default path should still be global fetch')
		} finally {
			spy.close()
		}
	})

	it('pinDns still refuses a redirect that lands somewhere private', async () => {
		const trap = await listen((req, res) => {
			res.writeHead(302, { location: 'http://127.0.0.1:1/secret' })
			res.end()
		})
		try {
			await assert.rejects(
				() => resolveSafeRedirectUrl(`${addr(trap)}/start`, { allowHosts: ['localhost'], pinDns: true }),
				/private\/loopback/
			)
		} finally {
			trap.close()
		}
	})
})

describe('createPinnedLinkPreviewFetcher — previews without handing the url to someone else', () => {
	let site

	before(async () => {
		site = await listen((req, res) => {
			if (req.url === '/moved') {
				res.writeHead(301, { location: '/page' })
				res.end()
				return
			}
			if (req.url === '/binary') {
				res.writeHead(200, { 'content-type': 'image/png' })
				res.end(Buffer.from([0x89, 0x50]))
				return
			}
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
			res.end(`<html><head>
				<title>Fallback &amp; title</title>
				<meta property="og:title" content="Og title">
				<meta name="description" content="plain description">
				<meta property="og:description" content="og description">
				<meta property="og:image" content="/img/hero.png">
			</head><body>hi</body></html>`)
		})
	})
	after(() => site?.close())

	it('reads OpenGraph title, description and absolute image url', async () => {
		const fetcher = createPinnedLinkPreviewFetcher({ allowHosts: ['localhost'] })
		const info = await fetcher(`${addr(site)}/page`)
		assert.equal(info.title, 'Og title')
		assert.equal(info.description, 'og description')
		assert.deepEqual(info.images, [`${addr(site)}/img/hero.png`])
	})

	it('falls back to <title> and decodes entities when there is no og:title', async () => {
		const bare = await listen((req, res) => {
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end('<html><head><title>Tom &amp; Jerry</title></head></html>')
		})
		try {
			const fetcher = createPinnedLinkPreviewFetcher({ allowHosts: ['localhost'] })
			const info = await fetcher(`${addr(bare)}/`)
			assert.equal(info.title, 'Tom & Jerry')
		} finally {
			bare.close()
		}
	})

	it('follows redirects itself, with the guard on each hop', async () => {
		const fetcher = createPinnedLinkPreviewFetcher({ allowHosts: ['localhost'] })
		const info = await fetcher(`${addr(site)}/moved`)
		assert.equal(info.title, 'Og title')
	})

	it('does not try to parse a non-html body', async () => {
		const fetcher = createPinnedLinkPreviewFetcher({ allowHosts: ['localhost'] })
		const info = await fetcher(`${addr(site)}/binary`)
		assert.equal(info.mediaType, 'image/png')
		assert.equal(info.title, undefined)
	})

	it('getUrlInfo({ fetchOpts: { pinDns: true } }) uses it end to end', async () => {
		const info = await getUrlInfo(`${addr(site)}/page`, {
			fetchOpts: { allowHosts: ['localhost'], pinDns: true },
			thumbnailWidth: 10,
			uploadImage: undefined,
			logger: undefined
		})
		assert.equal(info?.title, 'Og title')
		assert.equal(info?.description, 'og description')
	})

	it('pinDns does not weaken the guard: a private target is still refused', async () => {
		await assert.rejects(
			() => getUrlInfo('http://127.0.0.1:1/page', { fetchOpts: { pinDns: true } }),
			/private\/loopback/
		)
	})
})
