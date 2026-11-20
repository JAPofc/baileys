import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateHost, unbracketHost, assertSafeHttpUrl } from '../lib/Utils/messages-media.js'

const PRIVATE = [
	['::ffff:169.254.169.254', 'cloud metadata, IPv4-mapped dotted'],
	['::ffff:7f00:1', '127.0.0.1 in hex'],
	['::FFFF:7F00:1', 'hex, uppercase'],
	['0:0:0:0:0:ffff:a9fe:a9fe', 'metadata, fully expanded'],
	['::ffff:127.0.0.1', 'loopback, mapped dotted'],
	['::ffff:10.0.0.5', 'RFC1918 /8, mapped'],
	['::ffff:172.16.0.1', 'RFC1918 /12, mapped'],
	['::ffff:172.31.255.255', 'RFC1918 /12 upper bound'],
	['::ffff:192.168.1.1', 'RFC1918 /16, mapped'],
	['::ffff:100.64.0.1', 'CGNAT, mapped'],
	['::ffff:0.0.0.0', 'unspecified, mapped'],
	['::127.0.0.1', 'deprecated IPv4-compatible'],
	['::1', 'loopback'],
	['::', 'unspecified'],
	['fe80::1', 'link-local'],
	['feb0::1', 'link-local, upper half of fe80::/10'],
	['fc00::1', 'unique-local'],
	['fd12:3456::1', 'unique-local'],
	['127.0.0.1', 'plain IPv4 loopback'],
	['169.254.169.254', 'plain IPv4 metadata'],
	['localhost', 'name'],
	['api.localhost', 'name suffix']
]

const PUBLIC = [
	['::ffff:8.8.8.8', 'public IPv4, mapped'],
	['::ffff:0808:0808', 'public IPv4, mapped hex'],
	['2606:4700:4700::1111', 'public IPv6'],
	['2001:db8::1', 'documentation range, still routable-looking'],
	['fec0::1', 'site-local: deprecated, outside fe80::/10'],
	['8.8.8.8', 'public IPv4'],
	['example.com', 'name']
]

test('§2.70 private and mapped-private hosts are rejected', () => {
	for (const [host, note] of PRIVATE) {
		assert.equal(isPrivateHost(host), true, `${host} (${note}) must count as private`)
	}
})

test('§2.70 public hosts are still allowed', () => {
	for (const [host, note] of PUBLIC) {
		assert.equal(isPrivateHost(host), false, `${host} (${note}) must stay allowed`)
	}
})

test('§2.70 brackets do not change the verdict', () => {
	assert.equal(isPrivateHost('[::ffff:169.254.169.254]'), true)
	assert.equal(isPrivateHost('[2606:4700:4700::1111]'), false)
	assert.equal(unbracketHost('[::1]'), '::1')
	assert.equal(unbracketHost('::1'), '::1')
	assert.equal(unbracketHost(undefined), '')
})

test('§2.70 a public IPv6-literal URL is no longer refused', async () => {
	const parsed = await assertSafeHttpUrl('http://[2606:4700:4700::1111]/x')
	assert.equal(parsed.hostname, '[2606:4700:4700::1111]')
})

test('§2.70 the metadata endpoint is refused for the right reason', async () => {
	await assert.rejects(assertSafeHttpUrl('http://[::ffff:169.254.169.254]/latest/meta-data/'), err => {
		assert.match(err.message, /private\/loopback host/)
		assert.doesNotMatch(err.message, /Failed to resolve/, 'not an accidental DNS failure')
		return true
	})
	await assert.rejects(assertSafeHttpUrl('http://169.254.169.254/latest/meta-data/'), /private\/loopback/)
	await assert.rejects(assertSafeHttpUrl('http://[::1]:6379/'), /private\/loopback/)
})

test('§2.70 protocol and parse guards are unchanged', async () => {
	await assert.rejects(assertSafeHttpUrl('file:///etc/passwd'), /Unsupported URL protocol/)
	await assert.rejects(assertSafeHttpUrl('not a url'), /Invalid URL/)
})

test('allowPrivate still bypasses everything', async () => {
	const parsed = await assertSafeHttpUrl('http://127.0.0.1:3000/x', { allowPrivate: true })
	assert.equal(parsed.hostname, '127.0.0.1')
})

test('allowHosts exempts only the listed hosts', async () => {
	await assertSafeHttpUrl('http://127.0.0.1:3000/x', { allowHosts: ['127.0.0.1'] })
	await assertSafeHttpUrl('http://[::1]/x', { allowHosts: ['::1'] })
	await assertSafeHttpUrl('http://[::1]/x', { allowHosts: ['[::1]'] }, 'brackets optional')
	await assert.rejects(assertSafeHttpUrl('http://169.254.169.254/', { allowHosts: ['127.0.0.1'] }), /private\/loopback/)
	await assert.rejects(assertSafeHttpUrl('http://127.0.0.1/', { allowHosts: [] }), /private\/loopback/)
	await assert.rejects(assertSafeHttpUrl('http://127.0.0.1/', { allowHosts: ['127.0.0.2'] }), /private\/loopback/)
})

test('allowHosts does not weaken the protocol check', async () => {
	await assert.rejects(assertSafeHttpUrl('file://127.0.0.1/etc/passwd', { allowHosts: ['127.0.0.1'] }), /Unsupported URL protocol/)
})

test('§2.70 malformed IPv6-ish strings are not treated as mapped IPv4', () => {
	for (const junk of ['::ffff:999.1.1.1', '::ffff:1.2.3', 'ffff::1.2.3.4', 'not:an:ip']) {
		assert.equal(isPrivateHost(junk), false, `${junk} is not a valid address, treat as a name`)
	}
})
