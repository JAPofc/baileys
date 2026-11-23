// §2.83 — album validation + the Newsletter Status, Status interaction, Scheduled message
// and A2UI/AI-rich modules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	generateWAMessage, proto,
	makeStatusAudienceMetadata, makeStatusMentionMessage, makeStatusQuestionAnswerMessage,
	makeStatusStickerInteractionMessage, STATUS_AUDIENCE_DEFAULT_LIMIT, STATUS_AUDIENCE_TYPE,
	withNewsletterStatusAttribution, buildNewsletterStatusNode, makeNewsletterAdminInviteMessage,
	makeNewsletterStatusSender, makeNewsletterStatusFetcher, NEWSLETTER_STATUS_CONTENT_TYPE,
	encodeScheduledMessage, decodeScheduledMessage, buildUnscheduleProtocolMessage,
	SCHEDULED_MSG_STATUS, SCHEDULED_MSG_MAX_DELAY_MS,
	a2uiText, a2uiCard, a2uiColumn, a2uiRow, a2uiSurface, a2uiButton, bloksWidget, embeddedScreen,
	chainOfThoughtSection, decodeAIRich, AI_RICH_RESPONSE_TYPE_STANDARD, MessageBuilder, MB, jap
} from '../lib/index.js'

const JID = '628@s.whatsapp.net'
const OPTS = { upload: async () => ({ mediaUrl: 'https://x/u', directPath: '/u' }) }
const img = () => ({ image: Buffer.alloc(16), mimetype: 'image/jpeg' })
const vid = () => ({ video: Buffer.alloc(16), mimetype: 'video/mp4' })

// ── album ──────────────────────────────────────────────────────────────────────
test('§2.83 an album rejects unsupported entries up front, naming them', async () => {
	await assert.rejects(
		generateWAMessage(JID, { album: [img(), img(), { document: Buffer.alloc(4), mimetype: 'application/pdf' }] }, OPTS),
		err => {
			assert.match(err.message, /unsupported: #2/)
			assert.match(err.message, /document/)
			assert.equal(err.output.statusCode, 400)
			return true
		}
	)
	await assert.rejects(generateWAMessage(JID, { album: [img(), {}] }, OPTS), /#1 \(empty\)/)
	await assert.rejects(generateWAMessage(JID, { album: [img()] }, OPTS), /Minimum provide 2 media/)
	await assert.rejects(generateWAMessage(JID, { album: 'nope' }, OPTS), /Expected an array/)
})

test('§2.83 a valid album still counts images and videos correctly', async () => {
	const msg = await generateWAMessage(JID, { album: [img(), vid(), img()] }, OPTS)
	assert.deepEqual(
		{ ...msg.message.albumMessage },
		{ expectedImageCount: 2, expectedVideoCount: 1 }
	)
})

test('§2.83 the album send loop paces only BETWEEN items', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	const albumAt = src.indexOf("if ('album' in content)")
	const loop = src.slice(albumAt, src.indexOf('return fullMsg;', albumAt))
	assert.match(loop, /albumIndex\+\+ < lastAlbumIndex/)
	assert.match(src, /sendAlbumMessage: async \(jid, medias, options = \{\}\)/)
	assert.match(src, /sendAlbum: async \(jid, medias, options = \{\}\)/)
})

// ── status audience + interactions ─────────────────────────────────────────────
test('§2.83 makeStatusAudienceMetadata resolves contacts / allowlist / denylist', () => {
	const contacts = ['1@s.whatsapp.net', '2@s.whatsapp.net', '1@s.whatsapp.net']
	assert.deepEqual(makeStatusAudienceMetadata({ contacts }), {
		type: STATUS_AUDIENCE_TYPE.CONTACTS,
		statusJidList: ['1@s.whatsapp.net', '2@s.whatsapp.net'],
		excluded: [],
		truncated: 0,
		limit: STATUS_AUDIENCE_DEFAULT_LIMIT
	})
	assert.equal(makeStatusAudienceMetadata({ contacts, except: '2@s.whatsapp.net' }).type, 'denylist')
	assert.deepEqual(makeStatusAudienceMetadata({ only: ['9@lid'] }).statusJidList, ['9@lid'])
	assert.equal(makeStatusAudienceMetadata({ contacts, limit: 1 }).truncated, 1)
	assert.throws(() => makeStatusAudienceMetadata({ contacts, only: ['1@s.whatsapp.net'] }), /not both/)
	assert.throws(() => makeStatusAudienceMetadata({ contacts: ['123@g.us'] }), /user JIDs/)
	assert.throws(() => makeStatusAudienceMetadata({}), /audience is empty/)
	assert.throws(() => makeStatusAudienceMetadata({ contacts, limit: 0 }), /positive integer/)
})

test('§2.83 status interaction messages carry the right keys and encode', () => {
	const statusKey = { id: 'STATUS1', participant: '1@s.whatsapp.net' }
	const answer = makeStatusQuestionAnswerMessage(statusKey, ' yes ')
	assert.equal(answer.statusQuestionAnswerMessage.text, 'yes')
	assert.equal(answer.statusQuestionAnswerMessage.key.remoteJid, 'status@broadcast')
	const sticker = makeStatusStickerInteractionMessage(statusKey, { id: 'S1' }, { type: 2 })
	assert.equal(sticker.statusStickerInteractionMessage.type, 2)
	const mention = makeStatusMentionMessage({ message: { conversation: 'hi' } })
	assert.ok(mention.statusMentionMessage.message.conversation)
	assert.ok(mention.messageContextInfo.statusMentionMessageInfo.quotedStatus)
	// §2.225: the attribution now lives inside the quoted content's contextInfo, because
	// proto.Message has no top-level contextInfo field (protobufjs dropped it silently).
	// A bare `conversation` string has nowhere to carry it, so it is left untouched.
	assert.equal(mention.contextInfo, undefined)
	const mentionRich = makeStatusMentionMessage({ message: { extendedTextMessage: { text: 'hi' } } })
	assert.equal(
		mentionRich.statusMentionMessage.message.extendedTextMessage.contextInfo.statusAttributionType,
		proto.ContextInfo.StatusAttributionType.RESHARED_FROM_MENTION
	)
	assert.ok(makeStatusMentionMessage({ conversation: 'hi' }, { group: true }).groupStatusMentionMessage)
	// round-trips through the proto
	const encoded = proto.Message.encode(proto.Message.fromObject(answer)).finish()
	assert.equal(proto.Message.decode(encoded).statusQuestionAnswerMessage.text, 'yes')
	assert.throws(() => makeStatusQuestionAnswerMessage({}, 'x'), /key with an id/)
	assert.throws(() => makeStatusQuestionAnswerMessage(statusKey, '  '), /cannot be empty/)
	assert.throws(() => makeStatusMentionMessage(null), /status message/)
})

// ── newsletter status ──────────────────────────────────────────────────────────
test('§2.83 newsletter attribution, node and admin invite', () => {
	const attributed = withNewsletterStatusAttribution({ text: 'hi' }, {
		newsletterJid: '123@newsletter', newsletterName: 'JAP News', serverMessageId: 7
	})
	const info = attributed.contextInfo.forwardedNewsletterMessageInfo
	assert.equal(info.newsletterJid, '123@newsletter')
	assert.equal(info.serverMessageId, 7)
	assert.equal(info.contentType, NEWSLETTER_STATUS_CONTENT_TYPE.UPDATE)
	assert.equal(attributed.contextInfo.isForwarded, true)
	const node = buildNewsletterStatusNode({ newsletterJid: '123@newsletter', serverMessageId: 7 })
	assert.equal(node.tag, 'meta')
	assert.equal(node.content[0].attrs.server_id, '7')
	const invite = makeNewsletterAdminInviteMessage({ newsletterJid: '123@newsletter', newsletterName: 'JAP News', caption: 'join' })
	assert.equal(invite.newsletterAdminInviteMessage.newsletterName, 'JAP News')
	assert.throws(() => withNewsletterStatusAttribution({ text: 'x' }, { newsletterJid: '628@s.whatsapp.net' }), /@newsletter jid/)
	assert.throws(() => makeNewsletterAdminInviteMessage({ newsletterJid: '123@newsletter' }), /newsletterName/)
	assert.throws(() => makeNewsletterAdminInviteMessage({ newsletterJid: '123@newsletter', newsletterName: 'x', inviteExpiration: -1 }), /unix timestamp/)
})

test('§2.83 makeNewsletterStatusSender posts to status@broadcast with attribution + meta node', async () => {
	const sent = []
	const sock = { sendMessage: async (jid, content, options) => { sent.push({ jid, content, options }); return { key: { id: 'X' } } } }
	const send = makeNewsletterStatusSender(sock)
	await send('123@newsletter', { text: 'drop' }, { statusJidList: ['1@s.whatsapp.net'], newsletterName: 'JAP' })
	assert.equal(sent[0].jid, 'status@broadcast')
	assert.equal(sent[0].content.contextInfo.forwardedNewsletterMessageInfo.newsletterName, 'JAP')
	assert.equal(sent[0].options.additionalNodes.at(-1).tag, 'meta')
	assert.deepEqual(sent[0].options.statusJidList, ['1@s.whatsapp.net'])
	await assert.rejects(send('123@newsletter', { text: 'x' }, {}), /statusJidList/)
	assert.throws(() => makeNewsletterStatusSender({}), /sendMessage/)
})

test('§2.83 makeNewsletterStatusFetcher unwraps the status_messages node', async () => {
	const sock = {
		generateMessageTag: () => 'tag',
		query: async () => ({
			tag: 'iq',
			attrs: {},
			content: [{
				tag: 'status_messages',
				attrs: {},
				content: [{
					tag: 'message',
					attrs: { server_id: '12', t: '1700000000' },
					content: [
						{ tag: 'views_count', attrs: { count: '34' } },
						{ tag: 'reactions', attrs: {}, content: [{ tag: 'reaction', attrs: { code: '👍', count: '2' } }] }
					]
				}]
			}]
		})
	}
	const [entry] = await makeNewsletterStatusFetcher(sock)('123@newsletter', { count: 5 })
	assert.equal(entry.serverId, 12)
	assert.equal(entry.views, 34)
	assert.deepEqual(entry.reactions, [{ code: '👍', count: 2 }])
	await assert.rejects(makeNewsletterStatusFetcher(sock)('123@newsletter', { count: 0 }), /positive integer/)
})

// ── scheduled messages ─────────────────────────────────────────────────────────
test('§2.83 scheduled messages encode, decode and unschedule', () => {
	const now = 1_700_000_000_000
	const enc = encodeScheduledMessage({ text: 'later' }, { at: now + 60_000, now })
	assert.equal(enc.delayMs, 60_000)
	assert.equal(enc.status, SCHEDULED_MSG_STATUS.PENDING)
	const dec = decodeScheduledMessage(enc.content)
	assert.equal(dec.scheduleId, enc.scheduleId)
	assert.deepEqual(dec.content, { text: 'later' })
	assert.equal(dec.isDue(now), false)
	assert.equal(dec.isDue(now + 61_000), true)
	assert.equal(decodeScheduledMessage({ text: 'plain' }), null)
	// accepts Date / ISO / seconds
	assert.equal(encodeScheduledMessage({ text: 'x' }, { at: new Date(now + 5000), now }).delayMs, 5000)
	assert.equal(encodeScheduledMessage({ text: 'x' }, { at: (now + 5000) / 1000, now }).delayMs, 5000)
	assert.equal(encodeScheduledMessage({ text: 'x' }, { at: new Date(now + 5000).toISOString(), now }).delayMs, 5000)
	assert.throws(() => encodeScheduledMessage({ text: 'x' }, { at: now - 1, now }), /in the future/)
	assert.throws(() => encodeScheduledMessage({ text: 'x' }, { at: now + SCHEDULED_MSG_MAX_DELAY_MS + 1000, now }), /more than/)
	assert.throws(() => encodeScheduledMessage({ text: 'x' }, { at: 'tomorrow-ish', now }), /Date, a timestamp/)
	const cancel = buildUnscheduleProtocolMessage({ id: 'ABC', remoteJid: JID }, { scheduleId: 'S1' })
	assert.equal(cancel.protocolMessage.type, proto.Message.ProtocolMessage.Type.REVOKE)
	assert.equal(cancel.scheduledMessage.status, SCHEDULED_MSG_STATUS.CANCELLED)
	assert.throws(() => buildUnscheduleProtocolMessage({}), /key with an id/)
})

// ── A2UI / AI rich ─────────────────────────────────────────────────────────────
test('§2.83 the declarative A2UI helpers build a real bloks widget', () => {
	const widget = bloksWidget(a2uiSurface([
		a2uiCard(a2uiColumn([a2uiText('Hello', { variant: 'title' }), a2uiText('World')])),
		a2uiRow([a2uiButton(a2uiText('Tap'), { action: { name: 'cta_url', url: 'https://x' } })])
	]))
	assert.deepEqual(Object.keys(widget).sort(), ['data', 'type', 'uuid'])
	const parsed = JSON.parse(widget.data)
	const components = parsed.createSurface.components.map(c => c.component)
	assert.deepEqual(components.filter(c => c === 'Text').length, 3)
	assert.ok(components.includes('Card') && components.includes('Button') && components.includes('Row'))
	assert.equal(parsed.createSurface.components[0].id, 'root')
	// a bare node/array is wrapped in a surface automatically
	assert.ok(bloksWidget([a2uiText('solo')]).data.includes('solo'))
	assert.throws(() => bloksWidget(a2uiSurface([])), /no children/)
	assert.throws(() => bloksWidget([{ component: 'Nope' }]), /expected an a2ui node/)
	assert.throws(() => bloksWidget([a2uiSurface([a2uiText('x')])]), /cannot be nested/)
})

test('§2.83 embeddedScreen wraps a widget for a full-screen surface', () => {
	const screen = embeddedScreen([a2uiText('step 1')], { title: 'Checkout' })
	assert.equal(screen.screenId, 'MAIN')
	assert.equal(screen.title, 'Checkout')
	assert.ok(screen.widget.data.includes('step 1'))
})

test('§2.83 chainOfThoughtSection composes into a jap() card', () => {
	const sock = { user: { id: '1@s.whatsapp.net' }, logger: { warn() {}, debug() {} }, relayMessage: async () => {} }
	const section = chainOfThoughtSection(['look it up', 'answer'], { title: 'Reasoning' })
	assert.equal(section.thinking.title, 'Reasoning')
	assert.equal(section.tasks.length, 2)
	const card = jap(sock, { ...section, markdown: '# done' })
	assert.ok(card.items.length >= 3)
	assert.throws(() => chainOfThoughtSection([]), /at least one step/)
})

test('§2.83 decodeAIRich reads a card built by AIRich, and the constants are exported', () => {
	assert.equal(AI_RICH_RESPONSE_TYPE_STANDARD, proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD)
	const result = decodeAIRich({ message: { conversation: 'not rich' } })
	assert.equal(result.found, false)
})

test('§2.83 MessageBuilder / MB expose the builder hub', () => {
	assert.equal(MessageBuilder, MB)
	assert.equal(typeof MessageBuilder, 'function')
	const hub = new MessageBuilder({ user: { id: '1@s.whatsapp.net' }, logger: { warn() {}, debug() {} } })
	for (const method of ['button', 'carousel', 'poll', 'rich', 'jap']) {
		assert.equal(typeof hub[method], 'function', method)
	}
})

test('§2.83 the new socket methods and their types exist', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	for (const method of ['sendAlbumMessage', 'sendAlbum', 'sendNewsletterStatus', 'fetchNewsletterStatus',
		'sendNewsletterAdminInvite', 'sendStatusReshare', 'sendStatusQuestionAnswer',
		'sendStatusStickerInteraction', 'scheduleMessage', 'unscheduleMessage']) {
		assert.match(src, new RegExp(`\\n\\s+${method}: `), method)
		for (const file of ['../lib/Socket/messages-send.d.ts', '../lib/Socket/index.d.ts']) {
			assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), new RegExp(`${method}:`), `${method} in ${file}`)
		}
	}
})
