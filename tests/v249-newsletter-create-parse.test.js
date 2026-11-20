// §2.114 — newsletterCreate() must survive a response without description/viewer_metadata.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/Socket/newsletter.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('const asInt ='), src.indexOf('const parseNewsletterMetadata'))
const parse = new Function(`${body}; return parseNewsletterCreateResponse`)()

test('§2.114 a channel created without a description parses instead of throwing', () => {
	const parsed = parse({
		id: '120363111222333444@newsletter',
		thread_metadata: { name: { text: 'JAP Updates' }, invite: 'AbCdEf', subscribers_count: '1' }
	})
	assert.equal(parsed.id, '120363111222333444@newsletter')
	assert.equal(parsed.name, 'JAP Updates')
	assert.equal(parsed.description, undefined)
	assert.equal(parsed.subscribers, 1)
	assert.equal(parsed.mute_state, undefined)
})

test('§2.114 missing numbers stay undefined instead of becoming NaN', () => {
	const parsed = parse({ id: 'x@newsletter', thread_metadata: {} })
	assert.equal(parsed.creation_time, undefined)
	assert.equal(parsed.subscribers, undefined)
	assert.deepEqual(parsed.picture, { id: undefined, directPath: undefined })
})

test('§2.114 the full response is still parsed exactly as before', () => {
	const parsed = parse({
		id: 'x@newsletter',
		thread_metadata: {
			name: { text: 'Nama' }, description: { text: 'Deskripsi' }, invite: 'inv',
			creation_time: '1700000000', subscribers_count: '42', verification: 'VERIFIED',
			picture: { id: 'pid', direct_path: '/v/pic' }
		},
		viewer_metadata: { mute: 'OFF' }
	})
	assert.deepEqual(parsed, {
		id: 'x@newsletter',
		owner: undefined,
		name: 'Nama',
		creation_time: 1700000000,
		description: 'Deskripsi',
		invite: 'inv',
		subscribers: 42,
		verification: 'VERIFIED',
		picture: { id: 'pid', directPath: '/v/pic' },
		mute_state: 'OFF'
	})
})

test('§2.114 plain-string name/description shapes are accepted too', () => {
	const parsed = parse({ id: 'x@newsletter', thread_metadata: { name: 'Nama', description: 'Desk' } })
	assert.equal(parsed.name, 'Nama')
	assert.equal(parsed.description, 'Desk')
})

test('§2.114 a junk response yields null rather than a crash', () => {
	assert.equal(parse(undefined), null)
	assert.equal(parse('nope'), null)
})
