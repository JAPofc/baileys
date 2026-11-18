// §2.120 — w:mex GraphQL errors must survive their own error code.
// §2.121 — a link preview without an image must still be returned.
// §2.122 — getUrlInfo() accepts an injectable metadata fetcher.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executeWMexQuery } from '../lib/Socket/mex.js'
import { getUrlInfo } from '../lib/Utils/link-preview.js'

const resultQuery = body => async () => ({
	tag: 'iq',
	attrs: {},
	content: [{ tag: 'result', attrs: {}, content: Buffer.from(body) }]
})
const tag = () => '1'
const errBody = code => JSON.stringify({ errors: [{ message: 'server says no', extensions: { error_code: code } }] })

test('§2.120 a sub-400 or non-numeric error_code no longer replaces the GraphQL error', async () => {
	for (const code of [0, 200, 'INTERNAL_ERROR', null]) {
		const err = await executeWMexQuery({}, 'q', 'xwa2_thing', resultQuery(errBody(code)), tag).then(
			() => undefined,
			e => e
		)
		assert.ok(err, `expected a throw for ${code}`)
		assert.match(err.message, /GraphQL server error: server says no/)
		assert.equal(err.output.statusCode, 400)
		assert.deepEqual(err.errorCode, code === null ? null : code)
	}
})

test('§2.120 a usable HTTP error code is still honoured', async () => {
	const err = await executeWMexQuery({}, 'q', 'xwa2_thing', resultQuery(errBody(401)), tag).catch(e => e)
	assert.equal(err.output.statusCode, 401)
	assert.equal(err.errorCode, 401)
})

test('§2.120 a non-JSON body becomes a Boom that names the query', async () => {
	const err = await executeWMexQuery({}, 'q7', 'xwa2_thing', resultQuery('<html>502</html>'), tag).catch(e => e)
	assert.equal(err.isBoom, true)
	assert.match(err.message, /Failed to parse w:mex response for query q7/)
	assert.equal(err.data.queryId, 'q7')
	assert.match(err.data.raw, /<html>502<\/html>/)
})

test('§2.120 a well-formed response is returned untouched', async () => {
	const out = await executeWMexQuery({}, 'q', 'xwa2_thing', resultQuery(JSON.stringify({ data: { xwa2_thing: { ok: true } } })), tag)
	assert.deepEqual(out, { ok: true })
})

test('§2.120 an errors array that is empty is not treated as an error', async () => {
	const out = await executeWMexQuery({}, 'q', undefined, resultQuery(JSON.stringify({ errors: [], data: { v: 1 } })), tag)
	assert.deepEqual(out, { v: 1 })
})

const page = extra => async () => ({
	url: 'https://example.com/',
	title: 'A page with no picture',
	description: 'd',
	mediaType: 'website',
	contentType: 'text/html',
	...extra
})

test('§2.121 a page with no images still yields a preview and never uploads', async () => {
	let uploads = 0
	const info = await getUrlInfo('https://example.com/', {
		thumbnailWidth: 192,
		fetchOpts: { timeout: 3000, checkDns: false },
		uploadImage: async () => {
			uploads++
			throw new Error('should not be called')
		},
		fetcher: page()
	})
	assert.equal(uploads, 0)
	assert.equal(info.title, 'A page with no picture')
	assert.equal(info['canonical-url'], 'https://example.com/')
	assert.equal(info['matched-text'], 'https://example.com/')
	assert.equal(info.jpegThumbnail, undefined)
	assert.equal(info.originalThumbnailUrl, undefined)
})

test('§2.121 an images field of the wrong shape does not throw', async () => {
	const info = await getUrlInfo('https://example.com/', {
		fetchOpts: { checkDns: false },
		fetcher: page({ images: null })
	})
	assert.equal(info.title, 'A page with no picture')
})

test('§2.121 a non-Error throw is re-thrown as-is instead of a TypeError', async () => {
	const err = await getUrlInfo('https://example.com/', {
		fetchOpts: { checkDns: false },
		fetcher: async () => {
			throw 'plain string failure'
		}
	}).then(() => undefined, e => e)
	assert.equal(err, 'plain string failure')
})

test('§2.121 the documented "receive a valid" error stays swallowed', async () => {
	const out = await getUrlInfo('https://example.com/', {
		fetchOpts: { checkDns: false },
		fetcher: async () => {
			throw new Error('did not receive a valid a url or text')
		}
	})
	assert.equal(out, undefined)
})

test('§2.122 the injected fetcher receives the normalised url', async () => {
	let seen
	await getUrlInfo('example.com/path', {
		fetchOpts: { checkDns: false },
		fetcher: async url => {
			seen = url
			return { url, title: 't', images: [] }
		}
	})
	assert.equal(seen, 'https://example.com/path')
})
