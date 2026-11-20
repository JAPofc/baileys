/**
 * §2.211 — link preview followed redirects behind a weaker guard than the one it used on
 * the first URL.
 *
 * `getUrlInfo()` validated the first URL with `assertSafeHttpUrl()` (which resolves DNS and
 * refuses hosts pointing at private addresses), then handed the URL to `link-preview-js`,
 * whose redirect hook is synchronous and can therefore only compare hostname strings. Two
 * guards on one path, different strengths. The chain is now resolved up front with the full
 * guard on every hop.
 */
import assert from 'node:assert/strict'
import http from 'http'
import { after, before, describe, test } from 'node:test'

import { resolveSafeRedirectUrl } from '../lib/Utils/messages-media.js'
import { getUrlInfo } from '../lib/Utils/link-preview.js'

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

describe('§2.211 link preview resolves redirects under the full guard', () => {
	let internal, redirector, plain, loop
	let internalPort, redirPort, plainPort, loopPort

	before(async () => {
		internal = http.createServer((_, res) => res.end('<html><title>INTERNAL</title></html>'))
		internalPort = await listen(internal)

		redirector = http.createServer((_, res) => {
			res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/` })
			res.end()
		})
		redirPort = await listen(redirector)

		plain = http.createServer((req, res) => {
			if (req.url === '/start') {
				res.writeHead(302, { location: '/end' })
				res.end()
				return
			}
			res.end('<html><head><title>Halaman Sah</title></head><body>hi</body></html>')
		})
		plainPort = await listen(plain)

		loop = http.createServer((_, res) => {
			res.writeHead(302, { location: '/again' })
			res.end()
		})
		loopPort = await listen(loop)
	})

	after(() => {
		internal.close()
		redirector.close()
		plain.close()
		loop.close()
	})

	test('resolveSafeRedirectUrl refuses a hop into a non-allowed host', async () => {
		await assert.rejects(
			resolveSafeRedirectUrl(`http://localhost:${redirPort}/`, {
				allowHosts: ['localhost'],
				checkDns: false
			}),
			/Refusing to fetch private\/loopback host: 127\.0\.0\.1/
		)
	})

	test('resolveSafeRedirectUrl returns the final url for a legitimate chain', async () => {
		const final = await resolveSafeRedirectUrl(`http://localhost:${plainPort}/start`, {
			allowHosts: ['localhost'],
			checkDns: false
		})
		assert.equal(final.pathname, '/end', 'the caller should be handed the resolved url')
	})

	test('resolveSafeRedirectUrl leaves a non-redirecting url alone', async () => {
		const final = await resolveSafeRedirectUrl(`http://localhost:${plainPort}/end`, {
			allowHosts: ['localhost'],
			checkDns: false
		})
		assert.equal(final.pathname, '/end')
	})

	test('resolveSafeRedirectUrl cuts off a redirect loop', async () => {
		await assert.rejects(
			resolveSafeRedirectUrl(`http://localhost:${loopPort}/`, {
				allowHosts: ['localhost'],
				checkDns: false,
				maxRedirects: 3
			}),
			/Too many redirects/
		)
	})

	test('resolveSafeRedirectUrl still refuses a private first url', async () => {
		await assert.rejects(
			resolveSafeRedirectUrl(`http://127.0.0.1:${plainPort}/end`, { checkDns: false }),
			/Refusing to fetch private\/loopback host/
		)
	})

	test('getUrlInfo refuses a preview that redirects somewhere it must not go', async () => {
		let fetcherSawUrl
		await assert.rejects(
			getUrlInfo(`http://localhost:${redirPort}/`, {
				thumbnailWidth: 32,
				fetchOpts: { allowHosts: ['localhost'], checkDns: false, timeout: 2000 },
				fetcher: async url => {
					// if the guard did its job this never runs; recording it makes a
					// regression loud instead of a silent "preview worked"
					fetcherSawUrl = url
					return { title: 'INTERNAL' }
				}
			}),
			/Refusing to fetch private\/loopback host: 127\.0\.0\.1/
		)
		assert.equal(fetcherSawUrl, undefined, 'the preview fetcher must never see the internal url')
	})

	test('getUrlInfo hands the fetcher the already-resolved url', async () => {
		let seen
		const info = await getUrlInfo(`http://localhost:${plainPort}/start`, {
			thumbnailWidth: 32,
			fetchOpts: { allowHosts: ['localhost'], checkDns: false, timeout: 2000 },
			fetcher: async url => {
				seen = url
				return { title: 'Halaman Sah', mediaType: 'website', contentType: 'text/html' }
			}
		})

		assert.ok(seen?.endsWith('/end'), `fetcher should get the resolved url, got ${seen}`)
		assert.equal(info?.title, 'Halaman Sah')
	})

	test('resolveRedirects: false keeps the old single-check behaviour for custom fetchers', async () => {
		let seen
		await getUrlInfo(`http://localhost:${plainPort}/start`, {
			thumbnailWidth: 32,
			fetchOpts: {
				allowHosts: ['localhost'],
				checkDns: false,
				timeout: 2000,
				resolveRedirects: false
			},
			fetcher: async url => {
				seen = url
				return { title: 'x' }
			}
		})

		assert.ok(seen?.endsWith('/start'), 'opting out must not resolve the chain')
	})
})
