// §2.95 — a stale cached group metadata must not invent LID addressing for a PN group.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveGroupAddressingMode, isUsableGroupMetadata, DEFAULT_GROUP_ADDRESSING_MODE } from '../lib/index.js'

test('§2.95 the declared addressingMode always wins', () => {
	assert.deepEqual(resolveGroupAddressingMode({ addressingMode: 'pn', participants: [{ id: '1@lid' }] }), {
		mode: 'pn', source: 'metadata', confident: true
	})
	assert.deepEqual(resolveGroupAddressingMode({ addressingMode: 'lid', participants: [{ id: '1@s.whatsapp.net' }] }), {
		mode: 'lid', source: 'metadata', confident: true
	})
	// a nonsense value is not trusted
	assert.equal(resolveGroupAddressingMode({ addressingMode: 'banana', participants: [{ id: '1@s.whatsapp.net' }] }).source, 'participants')
})

test('§2.95 a cache without the field is read off the participant jids', () => {
	assert.deepEqual(resolveGroupAddressingMode({ participants: [{ id: '628a@s.whatsapp.net' }, { id: '628b@s.whatsapp.net' }] }), {
		mode: 'pn', source: 'participants', confident: true
	})
	assert.deepEqual(resolveGroupAddressingMode({ participants: [{ id: '111a@lid' }] }), {
		mode: 'lid', source: 'participants', confident: true
	})
	// plain strings are accepted too
	assert.equal(resolveGroupAddressingMode({ participants: ['628a@s.whatsapp.net'] }).mode, 'pn')
	// mixed lists lean LID (that is what WhatsApp migrates towards)
	assert.equal(resolveGroupAddressingMode({ participants: [{ id: '111a@lid' }, { id: '628a@s.whatsapp.net' }] }).mode, 'lid')
})

test('§2.95 with nothing to go on it still defaults, but says it guessed', () => {
	for (const meta of [undefined, null, {}, { participants: [] }, { participants: [{ id: 'junk' }] }]) {
		const resolved = resolveGroupAddressingMode(meta)
		assert.equal(resolved.mode, DEFAULT_GROUP_ADDRESSING_MODE)
		assert.equal(resolved.source, 'default')
		assert.equal(resolved.confident, false)
	}
})

test('§2.95 isUsableGroupMetadata names the missing piece', () => {
	assert.deepEqual(isUsableGroupMetadata(undefined), { usable: false, reason: 'no metadata' })
	assert.deepEqual(isUsableGroupMetadata({}), { usable: false, reason: 'no participant list' })
	assert.deepEqual(isUsableGroupMetadata({ participants: [] }), { usable: false, reason: 'empty participant list' })
	assert.deepEqual(isUsableGroupMetadata({ participants: [{ id: '1@lid' }] }), { usable: true, reason: null })
	assert.deepEqual(
		isUsableGroupMetadata({ participants: [{ id: '1@lid' }] }, { requireAddressingMode: true }),
		{ usable: false, reason: 'no addressingMode (cache predates LID)' }
	)
	assert.deepEqual(
		isUsableGroupMetadata({ addressingMode: 'lid', participants: [{ id: '1@lid' }] }, { requireAddressingMode: true }),
		{ usable: true, reason: null }
	)
})

test('§2.95 relayMessage re-fetches an unusable cache and stops defaulting blindly', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	const code = src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.match(code, /isUsableGroupMetadata\(groupData, \{ requireAddressingMode: true \}\)/)
	assert.match(code, /re-fetching group metadata: cache unusable/)
	assert.match(code, /const addressing = resolveAddressingFromMetadata\(groupData\);/)
	assert.match(code, /addressing_mode: addressing\.mode/)
	assert.doesNotMatch(code, /addressing_mode: groupData\?\.addressingMode \|\| 'lid'/)
})
