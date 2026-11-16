// §2.96 — deep wrapper unwrapping + the JID/LID, native-flow and read-receipt helpers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	normalizeMessageContent, getContentType, NORMALIZE_MAX_DEPTH,
	normalizeJid, parseJid, encodeJid, phoneToJid, isJidLid, isJidMetaAi, isJidUserLike,
	lidToJid, jidToLid, getSenderJid, getSenderLid, getSenderPn, getBotJid,
	getTextFromMessage, getInteractiveResponse, getStatusMediaType, META_AI_PN_JID,
	NATIVE_FLOW_NAMES, NATIVE_FLOW_BUTTON_LIMIT, isWebSupportedButtonName,
	getNativeFlowNameByButtonName, checkNativeFlowButtons, validateAndNormalizeButtons,
	validateAndNormalizeSections,
	setBlockReadReceipts, getBlockReadReceipts, clearBlockReadReceipts, isReadReceiptBlocked,
	getPhoneNumber, getLidForPhone
} from '../lib/index.js'

const wrap = (depth) => {
	const wrappers = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage',
		'editedMessage', 'groupMentionedMessage', 'botForwardedMessage', 'associatedChildMessage']
	let content = { conversation: 'the actual text' }
	for (let i = depth - 1; i >= 0; i--) content = { [wrappers[i % wrappers.length]]: { message: content } }
	return content
}

test('§2.96 wrappers are unwrapped however deep they stack', () => {
	for (const depth of [1, 3, 5, 6, 8, 12]) {
		assert.deepEqual(Object.keys(normalizeMessageContent(wrap(depth))), ['conversation'], `depth ${depth}`)
	}
	assert.equal(getContentType(normalizeMessageContent(wrap(8))), 'conversation')
	assert.ok(NORMALIZE_MAX_DEPTH >= 16)
})

test('§2.96 a self-referential or truncated message cannot hang the unwrapper', () => {
	const cyclic = {}
	cyclic.ephemeralMessage = { message: cyclic }
	const started = Date.now()
	assert.doesNotThrow(() => normalizeMessageContent(cyclic))
	assert.ok(Date.now() - started < 500)
	// a wrapper with no inner message stays as-is instead of becoming undefined
	assert.deepEqual(normalizeMessageContent({ ephemeralMessage: {} }), { ephemeralMessage: {} })
	assert.equal(normalizeMessageContent(undefined), undefined)
	assert.deepEqual(normalizeMessageContent({ conversation: 'x' }), { conversation: 'x' })
})

test('§2.96 jid helpers normalise, parse and build', () => {
	assert.equal(normalizeJid('628:12@c.us'), '628@s.whatsapp.net')
	assert.equal(normalizeJid('111:3@lid'), '111@lid')
	assert.equal(normalizeJid('not a jid'), '')
	assert.equal(normalizeJid(undefined), '')
	assert.deepEqual(
		{ ...parseJid('628:7@s.whatsapp.net'), domainType: undefined },
		{ user: '628', server: 's.whatsapp.net', device: 7, domainType: undefined }
	)
	assert.equal(parseJid('junk'), null)
	assert.equal(encodeJid('628', 's.whatsapp.net'), '628@s.whatsapp.net')
	assert.equal(encodeJid('628@s.whatsapp.net', 'lid'), '628@lid')
	assert.equal(phoneToJid('+62 812 3456 7890'), '6281234567890@s.whatsapp.net')
	assert.equal(phoneToJid('0812-3456-7890', { defaultCountry: '62' }), '6281234567890@s.whatsapp.net')
	assert.throws(() => phoneToJid('0812-3456-7890'), /pass \{ defaultCountry \}/, 'no silent country guessing')
	assert.throws(() => phoneToJid('abc'), /international number/)
	assert.equal(isJidLid('1@lid'), true)
	assert.equal(isJidLid('1@hosted.lid'), true)
	assert.equal(isJidLid('1@s.whatsapp.net'), false)
	assert.equal(isJidMetaAi(META_AI_PN_JID), true)
	assert.equal(isJidUserLike('1@s.whatsapp.net'), true)
	assert.equal(isJidUserLike('1@g.us'), false)
	assert.equal(isJidUserLike('1@newsletter'), false)
})

test('§2.96 LID↔PN goes through the mapping store, never by guessing', async () => {
	const sock = {
		lidMapping: {
			getPNForLID: async lid => (lid === '111@lid' ? '628@s.whatsapp.net' : undefined),
			getLIDForPN: async pn => (pn === '628@s.whatsapp.net' ? '111@lid' : undefined)
		}
	}
	assert.equal(await lidToJid('111@lid', sock), '628@s.whatsapp.net')
	assert.equal(await lidToJid('999@lid', sock), null, 'an unknown LID must be null, not an invented number')
	assert.equal(await lidToJid('628@s.whatsapp.net', sock), '628@s.whatsapp.net')
	assert.equal(await jidToLid('628@s.whatsapp.net', sock), '111@lid')
	assert.equal(await jidToLid('111@lid', sock), '111@lid')
	await assert.rejects(lidToJid('111@lid', {}), /mapping store/)
	await assert.rejects(jidToLid('628@s.whatsapp.net', {}), /mapping store/)
	// the older socket-shaped helpers still work
	const full = { signalRepository: sock.lidMapping ? { lidMapping: sock.lidMapping } : undefined }
	assert.equal(await getPhoneNumber(full, '111@lid'), '628')
	assert.equal(await getLidForPhone(full, '628'), '111@lid')
})

test('§2.96 sender helpers read the key, text helpers read any shape', () => {
	const groupMsg = { key: { remoteJid: '120@g.us', participant: '628:3@s.whatsapp.net', participantAlt: '111@lid', fromMe: false } }
	assert.equal(getSenderJid(groupMsg), '628@s.whatsapp.net')
	assert.equal(getSenderPn(groupMsg), '628@s.whatsapp.net')
	assert.equal(getSenderLid(groupMsg), '111@lid')
	assert.equal(getSenderJid({ key: { remoteJid: '628@s.whatsapp.net', fromMe: true } }), '628@s.whatsapp.net')
	assert.equal(getBotJid({ key: { remoteJid: META_AI_PN_JID } }), META_AI_PN_JID)
	assert.equal(getBotJid({ key: { remoteJid: '628@s.whatsapp.net' } }), '')

	assert.equal(getTextFromMessage({ message: { conversation: 'halo' } }), 'halo')
	assert.equal(getTextFromMessage({ message: { ephemeralMessage: { message: { imageMessage: { caption: 'cap' } } } } }), 'cap')
	assert.equal(getTextFromMessage({ message: { listResponseMessage: { title: 'Pilih' } } }), 'Pilih')
	assert.equal(getTextFromMessage({ message: { pollCreationMessageV3: { name: 'Makan apa?' } } }), 'Makan apa?')
	assert.equal(getTextFromMessage({ message: { stickerMessage: {} } }), '')
	assert.equal(getTextFromMessage(null), '')

	assert.deepEqual(getInteractiveResponse({ message: { buttonsResponseMessage: { selectedButtonId: '.ya', selectedDisplayText: 'Ya' } } }),
		{ type: 'button', id: '.ya', text: 'Ya' })
	assert.deepEqual(getInteractiveResponse({ message: { listResponseMessage: { title: 'T', singleSelectReply: { selectedRowId: 'r1' } } } }),
		{ type: 'list', id: 'r1', text: 'T' })
	const flow = getInteractiveResponse({
		message: { interactiveResponseMessage: { body: { text: 'ok' }, nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: '{"id":"x"}' } } }
	})
	assert.deepEqual({ type: flow.type, name: flow.name, id: flow.id }, { type: 'native_flow', name: 'quick_reply', id: 'x' })
	// malformed paramsJson must not throw
	assert.doesNotThrow(() => getInteractiveResponse({
		message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: 'x', paramsJson: '{broken' } } }
	}))
	assert.equal(getInteractiveResponse({ message: { conversation: 'hi' } }), null)

	assert.equal(getStatusMediaType({ message: { videoMessage: {} } }), 'video')
	assert.equal(getStatusMediaType({ message: { conversation: 'x' } }), 'text')
	assert.equal(getStatusMediaType({ message: { stickerMessage: {} } }), null)
})

test('§2.96 native-flow buttons are checked and normalised', () => {
	assert.ok(NATIVE_FLOW_NAMES.includes('quick_reply'))
	assert.equal(NATIVE_FLOW_BUTTON_LIMIT, 3)
	assert.equal(isWebSupportedButtonName('quick_reply'), true)
	assert.equal(isWebSupportedButtonName('galaxy_message'), false)
	assert.equal(getNativeFlowNameByButtonName({ url: 'https://x' }), 'cta_url')
	assert.equal(getNativeFlowNameByButtonName({ copy: 'CODE' }), 'cta_copy')
	assert.equal(getNativeFlowNameByButtonName({ phone: '628' }), 'cta_call')
	assert.equal(getNativeFlowNameByButtonName({ text: 'Hi', id: '1' }), 'quick_reply')
	assert.equal(getNativeFlowNameByButtonName({}), null)

	const normalized = validateAndNormalizeButtons([{ text: 'Ya', id: '.ya' }, { text: 'Situs', url: 'https://x' }])
	assert.deepEqual(normalized.map(b => b.name), ['quick_reply', 'cta_url'])
	assert.deepEqual(JSON.parse(normalized[1].buttonParamsJson), { display_text: 'Situs', url: 'https://x' })

	const report = checkNativeFlowButtons([{ text: 'A', id: '1' }, { name: 'galaxy_message', text: 'G' }])
	assert.equal(report.ok, true)
	assert.match(report.warnings[0], /does not render on WhatsApp Web/)
	assert.equal(checkNativeFlowButtons([{ text: 'A', id: '1' }, { name: 'galaxy_message', text: 'G' }], { requireWebSupport: true }).ok, false)
	assert.equal(checkNativeFlowButtons([{ text: 'a', id: 'x' }, { text: 'b', id: 'x' }]).ok, false, 'duplicate ids')
	assert.equal(checkNativeFlowButtons([1, 2, 3, 4].map(i => ({ text: `b${i}`, id: `${i}` }))).ok, false, 'over the limit')
	assert.throws(() => validateAndNormalizeButtons([{ url: 'https://x' }]), /no display text/)
	assert.throws(() => validateAndNormalizeButtons([{ name: 'cta_url', text: 'x' }]), /needs a url/)
})

test('§2.96 list sections are normalised, flat rows accepted', () => {
	assert.deepEqual(validateAndNormalizeSections([{ title: 'Menu', rows: [{ title: 'Satu' }, { title: 'Dua', id: 'd' }] }]), [
		{ title: 'Menu', rows: [{ title: 'Satu', id: 'row_0_0' }, { title: 'Dua', id: 'd' }] }
	])
	assert.deepEqual(validateAndNormalizeSections([{ text: 'Flat', description: 'x' }])[0].rows[0].title, 'Flat')
	assert.throws(() => validateAndNormalizeSections([{ title: 'Menu', rows: [] }]), /has no rows/)
	assert.throws(() => validateAndNormalizeSections([{ title: 'Menu', rows: [{ description: 'no title' }] }]), /has no title/)
	assert.throws(() => validateAndNormalizeSections([{ title: 'M', rows: [{ title: 'a', id: 'x' }, { title: 'b', id: 'x' }] }]), /duplicate row id/)
	assert.throws(() => validateAndNormalizeSections([{ title: 'M', rows: Array.from({ length: 11 }, (_, i) => ({ title: `r${i}` })) }]), /the limit is 10/)
})

test('§2.96 read receipts can be blocked globally or per chat', () => {
	try {
		assert.deepEqual(getBlockReadReceipts(), { all: false, chats: [] })
		assert.equal(isReadReceiptBlocked('1@s.whatsapp.net'), false)

		setBlockReadReceipts(true, { chats: ['1@s.whatsapp.net'] })
		assert.equal(isReadReceiptBlocked('1@s.whatsapp.net'), true)
		assert.equal(isReadReceiptBlocked('2@s.whatsapp.net'), false)

		setBlockReadReceipts(true)
		assert.equal(isReadReceiptBlocked('2@s.whatsapp.net'), true)
		assert.deepEqual(getBlockReadReceipts(), { all: true, chats: ['1@s.whatsapp.net'] })

		setBlockReadReceipts(false)
		assert.equal(isReadReceiptBlocked('2@s.whatsapp.net'), false)
		assert.equal(isReadReceiptBlocked('1@s.whatsapp.net'), true, 'the per-chat entry survives turning the global switch off')
	} finally {
		clearBlockReadReceipts()
	}
	assert.deepEqual(getBlockReadReceipts(), { all: false, chats: [] })
})
