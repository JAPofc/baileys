// §2.111 — username validation follows WhatsApp's real rules.
// §2.112 — the group sender-key memory evicts devices that are no longer in the group.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	validateUsername, displayUsername, isUsernamePin, stripUsernamePrefix,
	USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_PIN_LENGTH, UsernameValidationError
} from '../lib/index.js'

test('§2.111 the published limits are WhatsApp\'s: 3–35, 4-digit key', () => {
	assert.equal(USERNAME_MIN_LENGTH, 3)
	assert.equal(USERNAME_MAX_LENGTH, 35)
	assert.equal(USERNAME_PIN_LENGTH, 4)
	assert.equal(validateUsername('a'.repeat(35)).valid, true, '35 characters is claimable')
	assert.equal(validateUsername('a'.repeat(36)).errorType, UsernameValidationError.INVALID_LENGTH)
	assert.equal(isUsernamePin('1234'), true)
	assert.equal(isUsernamePin('123456'), false)
})

test('§2.111 usernames that WhatsApp accepts are no longer rejected', () => {
	for (const ok of ['9to5.dev', 'name_', '_leading', 'a1b', 'ja.p_official', 'x'.repeat(30)]) {
		assert.equal(validateUsername(ok).valid, true, `${ok} should be valid`)
	}
})

test('§2.111 usernames that WhatsApp refuses are no longer accepted', () => {
	const cases = {
		'ja-p': 'INVALID_CHARACTER',
		'has space': 'INVALID_CHARACTER',
		'www.shop': 'INVALID_WWW_PREFIX',
		'myshop.com': 'INVALID_DOMAIN_SUFFIX',
		'page.html': 'INVALID_DOMAIN_SUFFIX',
		'1234567': 'INVALID_NO_LETTERS',
		'.lead': 'INVALID_PERIODS',
		'trail.': 'INVALID_PERIODS',
		'ja..p': 'INVALID_PERIODS',
		'ab': 'INVALID_LENGTH',
		'whatsapp': 'INVALID_WORD'
	}
	for (const [value, errorType] of Object.entries(cases)) {
		const res = validateUsername(value)
		assert.equal(res.valid, false, `${value} should be invalid`)
		assert.equal(res.errorType, errorType, value)
		assert.equal(typeof res.reason, 'string')
	}
})

test('§2.111 prefixes, jids and casing are normalised', () => {
	assert.equal(stripUsernamePrefix('@japofc'), 'japofc')
	assert.equal(stripUsernamePrefix('628123@s.whatsapp.net'), '628123')
	assert.equal(validateUsername('@JAPofc').username, 'japofc')
	assert.equal(displayUsername('JAPofc'), '@japofc')
	assert.equal(displayUsername('ja-p', { fallback: 'Budi' }), 'Budi')
	assert.equal(displayUsername('1234'), '@1234')
})

test('§2.111 the username key is opt-out, and reports its own code', () => {
	assert.equal(validateUsername('1234').isPin, true)
	const denied = validateUsername('1234', { allowPin: false })
	assert.equal(denied.valid, false)
	assert.equal(denied.errorType, UsernameValidationError.PIN_NOT_ALLOWED)
})

test('§2.112 stale sender-key-memory entries are evicted on the next group send', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	const i = src.indexOf('const liveDeviceJids = new Set()')
	assert.ok(i > 0, 'the live device set is missing')
	const window = src.slice(i, i + 2400)
	assert.match(window, /liveDeviceJids\.add\(deviceJid\)/)
	assert.match(window, /if \(!participant && liveDeviceJids\.size\) \{/)
	assert.match(window, /delete senderKeyMap\[knownJid\]/)
	// the eviction must come before the memory is handed to the pending-commit slot
	assert.ok(src.indexOf('pendingSenderKeyMemory = { jid, senderKeyMap }') > i)
})

test('§2.112 the eviction keeps exactly the devices this send enumerated', () => {
	// the loop body, lifted out so the rule itself is executable
	const evict = (senderKeyMap, devices) => {
		const live = new Set(devices)
		for (const jid of Object.keys(senderKeyMap)) {
			if (!live.has(jid)) delete senderKeyMap[jid]
		}
		return senderKeyMap
	}
	const map = { '628a@s.whatsapp.net:0': true, '628gone@s.whatsapp.net:0': true, '11@lid:0': true }
	assert.deepEqual(evict(map, ['628a@s.whatsapp.net:0', '11@lid:0', '628new@s.whatsapp.net:1']), {
		'628a@s.whatsapp.net:0': true,
		'11@lid:0': true
	})
})

test('§2.112 the resolved upstream TODOs are documented, not just deleted', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	assert.doesNotMatch(src, /todo: revamp all this logic/)
	assert.doesNotMatch(src, /TODO: check out what if the sender key memory/)
	assert.doesNotMatch(src, /TODO: investigate if this is true/)
	assert.match(src, /Upstream TODO \("revamp all this logic"/)
	assert.match(src, /Upstream TODO \("investigate if this is true"\) resolved/)
})
