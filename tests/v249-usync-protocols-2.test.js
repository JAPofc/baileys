// §2.139 — the three usync protocols still missing after Batch BU.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	USyncQuery, USyncUser, USYNC_FEATURES,
	USyncFeatureProtocol, USyncTextStatusProtocol, USyncSidelistProtocol
} from '../lib/index.js'

test('§2.139 feature flags: the wire sends strings, callers get booleans', () => {
	const p = new USyncFeatureProtocol(['voip', 'encrypt_v2', 'bot_eligible'])
	assert.deepEqual(p.getQueryElement(), {
		tag: 'feature',
		attrs: {},
		content: [
			{ tag: 'voip', attrs: {} },
			{ tag: 'encrypt_v2', attrs: {} },
			{ tag: 'bot_eligible', attrs: {} }
		]
	})
	const out = p.parser({
		tag: 'feature',
		attrs: {},
		content: [
			{ tag: 'voip', attrs: { value: 'true' } },
			{ tag: 'encrypt_v2', attrs: { value: 'false' } },
			{ tag: 'bot_eligible', attrs: { value: '2' } },
			{ tag: 'document', attrs: {} }
		]
	})
	assert.equal(out.voip, true)
	assert.equal(out.encryptV2, false)
	assert.equal(out.botEligible, '2', 'an unexpected value is passed through, not coerced')
	assert.ok(!('document' in out), 'a flag with no value attribute is not reported')
})

test('§2.139 the feature protocol defaults to every known flag', () => {
	const p = new USyncFeatureProtocol()
	assert.deepEqual(p.features, USYNC_FEATURES)
	assert.ok(USYNC_FEATURES.includes('voip') && USYNC_FEATURES.includes('bot_eligible'))
	p.features.push('mutated')
	assert.ok(!USYNC_FEATURES.includes('mutated'), 'the shared constant must not be aliased')
	assert.equal(new USyncFeatureProtocol([]).features.length, USYNC_FEATURES.length)
})

test('§2.139 text status does not invent a 1970 timestamp', () => {
	const p = new USyncTextStatusProtocol()
	const node = attrs => ({ tag: 'text_status', attrs })
	assert.equal(p.parser(node({ text: 'Busy' })).setAt, undefined)
	assert.equal(p.parser(node({ text: 'Busy', last_update_time: 'xx' })).setAt, undefined)
	const ok = p.parser(node({ text: 'Busy', last_update_time: '1700000000' }))
	assert.equal(ok.setAt.toISOString(), '2023-11-14T22:13:20.000Z')
	assert.equal(ok.text, 'Busy')
	assert.equal(ok.expiresAt, null)
})

test('§2.139 an expiry needs a timestamp to be anchored to', () => {
	const p = new USyncTextStatusProtocol()
	const withDuration = p.parser({
		tag: 'text_status',
		attrs: { text: 'brb', last_update_time: '1700000000', ephemeral_duration_sec: '86400' }
	})
	assert.equal(withDuration.expiresAt.toISOString(), '2023-11-15T22:13:20.000Z')
	// a duration with no last_update_time cannot produce a real expiry
	const orphanDuration = p.parser({ tag: 'text_status', attrs: { text: 'brb', ephemeral_duration_sec: '86400' } })
	assert.equal(orphanDuration.expiresAt, null)
})

test('§2.139 the status emoji is read from content or attribute', () => {
	const p = new USyncTextStatusProtocol()
	const asContent = p.parser({
		tag: 'text_status', attrs: { text: 'hi' },
		content: [{ tag: 'emoji', attrs: {}, content: Buffer.from('🔥') }]
	})
	assert.equal(asContent.emoji, '🔥')
	const asAttr = p.parser({
		tag: 'text_status', attrs: { text: 'hi' },
		content: [{ tag: 'emoji', attrs: { content: '🎉' } }]
	})
	assert.equal(asAttr.emoji, '🎉')
	assert.equal(p.parser({ tag: 'text_status', attrs: { text: 'hi' } }).emoji, null)
})

test('§2.139 sidelist addressing mode and delete element', () => {
	const p = new USyncSidelistProtocol()
	assert.deepEqual(p.getQueryElement(), { tag: 'sidelist', attrs: { addressing_mode: 'lid' } })
	assert.deepEqual(new USyncSidelistProtocol(false).getQueryElement(), { tag: 'sidelist', attrs: {} })
	assert.equal(p.getUserElement({}), null)
	assert.deepEqual(p.getUserElement({ sidelistDelete: true }), { tag: 'sidelist', attrs: { type: 'delete' } })
	// the server uses either spelling depending on build
	assert.deepEqual(p.parser({ tag: 'side_list', attrs: { type: 'add' } }), { type: 'add' })
	assert.deepEqual(p.parser({ tag: 'sidelist', attrs: {} }), { type: null })
	assert.equal(p.parser({ tag: 'picture', attrs: {} }), null)
})

test('§2.139 all three ride in one query with the §2.134 pair', () => {
	const q = new USyncQuery()
		.withTextStatusProtocol()
		.withFeatureProtocol(['voip'])
		.withSidelistProtocol()
		.withPictureProtocol()
		.withUser(new USyncUser().withId('62811@s.whatsapp.net'))
	assert.deepEqual(q.protocols.map(p => p.name), ['text_status', 'feature', 'sidelist', 'picture'])

	const result = {
		tag: 'iq', attrs: { type: 'result' },
		content: [{ tag: 'usync', attrs: {}, content: [{
			tag: 'list', attrs: {}, content: [{
				tag: 'user', attrs: { jid: '62811@s.whatsapp.net' },
				content: [
					{ tag: 'text_status', attrs: { text: 'At work', last_update_time: '1700000000' } },
					{ tag: 'feature', attrs: {}, content: [{ tag: 'voip', attrs: { value: 'true' } }] }
				]
			}]
		}] }]
	}
	const [user] = q.parseUSyncQueryResult(result).list
	assert.equal(user.text_status.text, 'At work')
	assert.equal(user.feature.voip, true)
	assert.equal(user.id, '62811@s.whatsapp.net')
})

test('§2.139 a refused protocol is reported, not thrown', () => {
	const q = new USyncQuery().withTextStatusProtocol().withUser(new USyncUser().withId('1@s.whatsapp.net'))
	const result = {
		tag: 'iq', attrs: { type: 'result' },
		content: [{ tag: 'usync', attrs: {}, content: [{
			tag: 'list', attrs: {}, content: [{
				tag: 'user', attrs: { jid: '1@s.whatsapp.net' },
				content: [{ tag: 'text_status', attrs: {}, content: [{ tag: 'error', attrs: { code: '401' } }] }]
			}]
		}] }]
	}
	const out = q.parseUSyncQueryResult(result)
	assert.equal(out.list.length, 1)
	assert.equal(out.list[0].text_status, undefined)
})
