// §2.207 — the SSRF guard validated the first URL and then followed redirects blindly.
// Plus characterisation of the host-level guard, which turns out to be solid.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import {
	assertSafeHttpUrl, isPrivateHost, unbracketHost, fetchBuffer, getHttpStream
} from '../lib/Utils/messages-media.js'

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

describe('§2.207 redirects are re-checked', () => {
	let internal, redirector, internalPort, redirPort, openRedirect, openPort

	before(async () => {
		internal = http.createServer((_, res) => res.end('RAHASIA-INTERNAL'))
		internalPort = await listen(internal)

		redirector = http.createServer((_, res) => {
			res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/` })
			res.end()
		})
		redirPort = await listen(redirector)

		// a server that redirects to a relative path on itself — a legitimate redirect
		openRedirect = http.createServer((req, res) => {
			if (req.url === '/mulai') {
				res.writeHead(302, { location: '/akhir' })
				res.end()
				return
			}
			res.end('ISI-SAH')
		})
		openPort = await listen(openRedirect)
	})

	after(() => {
		internal.close()
		redirector.close()
		openRedirect.close()
	})

	test('a redirect into a loopback address is refused', async () => {
		// the first hop is allow-listed, standing in for a public host the guard is happy
		// with; the redirect target is NOT allow-listed, so following it means it was never
		// re-checked. Before the fix this returned the internal service's body.
		await assert.rejects(
			fetchBuffer(`http://localhost:${redirPort}/foto.jpg`, { allowHosts: ['localhost'], checkDns: false }),
			/Refusing to fetch private\/loopback host: 127\.0\.0\.1/
		)
	})

	test('a legitimate redirect is still followed', async () => {
		const buf = await fetchBuffer(`http://localhost:${openPort}/mulai`, {
			allowHosts: ['localhost'], checkDns: false
		})
		assert.equal(buf.toString(), 'ISI-SAH', 'relative redirects on an allowed host must keep working')
	})

	test('a redirect loop is cut off rather than spun forever', async () => {
		const looper = http.createServer((_, res) => {
			res.writeHead(302, { location: '/lagi' })
			res.end()
		})
		const port = await listen(looper)
		try {
			await assert.rejects(
				getHttpStream(`http://localhost:${port}/mulai`, {
					allowHosts: ['localhost'], checkDns: false, maxRedirects: 3
				}),
				/Too many redirects/
			)
		} finally {
			looper.close()
		}
	})

	test('a direct fetch with no redirect is unaffected', async () => {
		const plain = http.createServer((_, res) => res.end('LANGSUNG'))
		const port = await listen(plain)
		try {
			const buf = await fetchBuffer(`http://localhost:${port}/x`, { allowHosts: ['localhost'], checkDns: false })
			assert.equal(buf.toString(), 'LANGSUNG')
		} finally {
			plain.close()
		}
	})
})

describe('the host-level SSRF guard (characterisation)', () => {
	test('loopback, private, link-local and CGNAT ranges are private', () => {
		for (const host of [
			'127.0.0.1', 'localhost', 'app.localhost', '10.0.0.1', '192.168.1.1', '172.16.0.1',
			'169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '[::1]', 'fd00::1', 'fe80::1',
			'::ffff:127.0.0.1', '[::ffff:7f00:1]'
		]) {
			assert.equal(isPrivateHost(host), true, `${host} must be treated as private`)
		}
	})

	test('public addresses are not', () => {
		for (const host of ['8.8.8.8', 'example.com', '2606:4700:4700::1111', '[2606:4700:4700::1111]']) {
			assert.equal(isPrivateHost(host), false, `${host} must be allowed`)
		}
	})

	test('obfuscated IPv4 forms are normalised by the URL parser before the check', async () => {
		// 0177.0.0.1 (octal) and 2130706433 (decimal) are both 127.0.0.1
		for (const url of ['http://0177.0.0.1/', 'http://2130706433/', 'http://[::ffff:127.0.0.1]/']) {
			await assert.rejects(assertSafeHttpUrl(url, { checkDns: false }), /private\/loopback/, `${url} must be refused`)
		}
	})

	test('non-http protocols and junk are refused by name', async () => {
		await assert.rejects(assertSafeHttpUrl('file:///etc/passwd', { checkDns: false }), /Unsupported URL protocol/)
		await assert.rejects(assertSafeHttpUrl('bukan-url', { checkDns: false }), /Invalid URL/)
	})

	test('allowHosts opens one host without disabling the guard', async () => {
		await assert.doesNotReject(assertSafeHttpUrl('http://127.0.0.1:3000/x', { allowHosts: ['127.0.0.1'], checkDns: false }))
		await assert.rejects(
			assertSafeHttpUrl('http://10.0.0.5/x', { allowHosts: ['127.0.0.1'], checkDns: false }),
			/private\/loopback/,
			'allow-listing one host must not open the rest'
		)
	})

	test('unbracketHost strips the brackets a URL keeps around IPv6', () => {
		assert.equal(unbracketHost('[::1]'), '::1')
		assert.equal(unbracketHost('EXAMPLE.com'), 'example.com')
		assert.equal(unbracketHost(undefined), '')
	})
})
