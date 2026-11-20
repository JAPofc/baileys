// §2.84 — parity batch 1: banner opt-out, poll/quiz, payments, the rest of the status,
// newsletter-status and scheduled-message surfaces.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	proto, setBannerEnabled, isBannerEnabled, printBanner,
	getPollOptionHash, makePollAddOptionMessage, makeQuestionMessage, makeQuestionReplyMessage,
	makeQuestionResponseMessage, quizQuestion, quizSection, sideBySideSurveyItem, POLL_MAX_OPTIONS,
	money, readMoney, MONEY_OFFSET, buildSplitPayment, buildSplitPaymentUpdate, readSplitPayment,
	SplitPaymentStatus, buildPaymentReminder, readPaymentReminder, quotaUpsellButton, quotaUpsellSection,
	makeStatusQuotedMessage, makeStatusAddYoursAssociation, makeStatusNotificationMessage,
	makeGroupStatusAttribution, makeGroupStatusReactionMessage, STATUS_NOTIFICATION_TYPES, StatusFont, StatusLinkType,
	buildNewsletterStatusReactionNode, buildNewsletterStatusRevokeNode, buildNewsletterAdminProfileStatusMessage,
	makeNewsletterFollowerInviteMessage, extractNewsletterMessageMeta, parseNewsletterStatusAck,
	waitForNewsletterStatusServerId, makeNewsletterStatusReactionSender, makeNewsletterStatusRevokeSender,
	makeNewsletterStatusUpdatesFetcher, NEWSLETTER_SERVER_ID_TIMEOUT_MS,
	buildScheduledMsgMetaNode, isScheduledTimeValid, generateRevealKey, generateRevealKeyId,
	encryptWithRevealKey, decryptWithRevealKey, buildConditionalRevealMessage
} from '../lib/index.js'

const roundTrip = content => proto.Message.decode(proto.Message.encode(proto.Message.fromObject(content)).finish()).toJSON()

// ── banner opt-out ─────────────────────────────────────────────────────────────
test('§2.84 the startup banner can be switched off', () => {
	assert.equal(isBannerEnabled(), true)
	assert.equal(setBannerEnabled(false), false)
	assert.equal(isBannerEnabled(), false)
	let wrote = 0
	const original = process.stdout.write
	process.stdout.write = () => { wrote++; return true }
	try { printBanner() } finally { process.stdout.write = original }
	assert.equal(wrote, 0, 'the banner printed while disabled')
	setBannerEnabled(true)
	assert.equal(isBannerEnabled(), true)
	process.env.JAP_NO_BANNER = '1'
	assert.equal(isBannerEnabled(), false, 'JAP_NO_BANNER should silence it')
	process.env.JAP_NO_BANNER = '0'
	assert.equal(isBannerEnabled(), true, 'JAP_NO_BANNER=0 means "print it"')
	delete process.env.JAP_NO_BANNER
})

// ── poll / quiz ────────────────────────────────────────────────────────────────
test('§2.84 getPollOptionHash matches the aggregation buckets', () => {
	const hash = getPollOptionHash('Nasi goreng')
	assert.ok(Buffer.isBuffer(hash))
	assert.equal(hash.length, 32)
	assert.equal(getPollOptionHash('Nasi goreng', 'hex'), hash.toString('hex'))
	assert.notEqual(getPollOptionHash('Soto', 'hex'), hash.toString('hex'))
	assert.throws(() => getPollOptionHash(42), /must be a string/)
})

test('§2.84 makePollAddOptionMessage extends a poll safely', () => {
	const poll = { message: { pollCreationMessageV3: { name: 'Makan apa?', options: [{ optionName: 'Nasi' }], selectableOptionsCount: 1 } } }
	const result = makePollAddOptionMessage(poll, ['Soto', 'Rawon'])
	assert.deepEqual(result.values, ['Nasi', 'Soto', 'Rawon'])
	assert.deepEqual(result.content.poll.values, ['Nasi', 'Soto', 'Rawon'])
	assert.equal(result.optionHashes.Soto, getPollOptionHash('Soto', 'hex'))
	assert.throws(() => makePollAddOptionMessage(poll, ['Nasi']), /already on the poll/)
	assert.throws(() => makePollAddOptionMessage(poll, ['A', 'A']), /duplicate/)
	assert.throws(() => makePollAddOptionMessage(poll, Array.from({ length: POLL_MAX_OPTIONS }, (_, i) => `o${i}`)), /at most/)
	assert.throws(() => makePollAddOptionMessage({}, ['x']), /original poll message/)
})

test('§2.84 the question family round-trips through the proto', () => {
	const free = makeQuestionMessage('Apa kabar?')
	assert.equal(roundTrip(free).questionMessage.message.conversation, 'Apa kabar?')
	const choice = makeQuestionMessage('Pilih', { answers: ['a', 'b'], allowMultiple: true })
	const poll = roundTrip(choice).questionMessage.message.pollCreationMessageV3
	assert.equal(poll.options.length, 2)
	assert.equal(poll.selectableOptionsCount, 2)
	const reply = roundTrip(makeQuestionReplyMessage({ id: 'Q1', participant: '1@s.whatsapp.net' }, 'baik'))
	assert.equal(reply.questionReplyMessage.message.extendedTextMessage.contextInfo.stanzaId, 'Q1')
	const response = makeQuestionResponseMessage({ id: 'Q1' }, 1, { answers: ['a', 'b'] })
	assert.equal(response.questionResponseMessage.text, 'b')
	assert.deepEqual(response.selectedHashes, [getPollOptionHash('b', 'hex')])
	assert.throws(() => makeQuestionMessage(''), /cannot be empty/)
	assert.throws(() => makeQuestionMessage('x', { answers: ['only one'] }), /at least 2 answers/)
	assert.throws(() => makeQuestionResponseMessage({ id: 'Q' }, 3, { answers: ['a'] }), /needs an "answers" list/)
})

test('§2.84 quiz helpers validate the correct answer', () => {
	const q = quizQuestion('Ibukota Indonesia?', ['Bandung', 'Jakarta'], { correct: 1, explanation: 'DKI' })
	assert.equal(q.answers[1].correct, true)
	assert.equal(q.answers[0].correct, false)
	assert.equal(q.explanation, 'DKI')
	const section = quizSection('Geografi', [q])
	assert.equal(section.total, 1)
	assert.throws(() => quizQuestion('x', ['a', 'b'], { correct: 5 }), /must be an index/)
	assert.throws(() => quizQuestion('x', ['a']), /at least 2 answers/)
	assert.throws(() => quizSection('x', []), /at least one question/)
	const sbs = sideBySideSurveyItem('Kopi atau teh?', 'Kopi', 'Teh')
	assert.equal(sbs.options.length, 2)
	assert.equal(sbs.options[0].hash, getPollOptionHash('Kopi', 'hex'))
	assert.throws(() => sideBySideSurveyItem('x', '', 'y'), /both sides need a label/)
})

// ── payments ───────────────────────────────────────────────────────────────────
test('§2.84 money() keeps WhatsApp money integral', () => {
	assert.deepEqual(money(25.5, 'usd'), { value: 25500, offset: MONEY_OFFSET, currencyCode: 'USD' })
	assert.deepEqual(money(15000, 'IDR'), { value: 15000, offset: 1, currencyCode: 'IDR' })
	assert.deepEqual(readMoney(money(25.5, 'USD')), { amount: 25.5, currencyCode: 'USD', offset: MONEY_OFFSET })
	assert.equal(readMoney({ amount1000: 2500 }).amount, 2.5)
	assert.equal(readMoney({}), null)
	assert.throws(() => money(1.23456, 'USD'), /more precision/)
	assert.throws(() => money(1, 'US'), /3-letter ISO/)
	assert.throws(() => money(Number.NaN, 'USD'), /finite number/)
})

test('§2.84 split payments split, update and report', () => {
	const split = buildSplitPayment({
		total: 100000, currencyCode: 'IDR', note: 'Dinner',
		participants: ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']
	})
	assert.deepEqual(split.participants.map(p => p.share.value), [33334, 33333, 33333])
	assert.equal(split.participants.reduce((acc, p) => acc + p.share.value, 0), 100000)
	assert.equal(split.status, SplitPaymentStatus.PENDING)
	const partial = buildSplitPaymentUpdate(split, { jid: 'a@s.whatsapp.net' })
	assert.equal(partial.status, SplitPaymentStatus.PARTIAL)
	const report = readSplitPayment(partial)
	assert.equal(report.settled, 1)
	assert.equal(report.of, 3)
	assert.equal(report.outstanding.length, 2)
	let all = partial
	for (const jid of ['b@s.whatsapp.net', 'c@s.whatsapp.net']) all = buildSplitPaymentUpdate(all, { jid })
	assert.equal(all.status, SplitPaymentStatus.SETTLED)
	assert.throws(() => buildSplitPaymentUpdate(split, { jid: 'z@s.whatsapp.net' }), /not part of this split/)
	assert.throws(() => buildSplitPaymentUpdate(split, { jid: 'a@s.whatsapp.net', status: 'maybe' }), /unknown status/)
	assert.throws(() => buildSplitPayment({
		total: 100, currencyCode: 'USD', participants: [{ jid: 'a@s.whatsapp.net', amount: 40 }, { jid: 'b@s.whatsapp.net', amount: 40 }]
	}), /add up to/)
})

test('§2.84 payment reminders and quota upsells', () => {
	const reminder = buildPaymentReminder({ jid: 'a@s.whatsapp.net', amount: 50, currencyCode: 'USD', dueAt: 1_000 })
	const read = readPaymentReminder(reminder, { now: 2_000 })
	assert.equal(read.amount, 50)
	assert.equal(read.overdue, true)
	assert.equal(readPaymentReminder(reminder, { now: 500 }).overdue, false)
	assert.equal(readPaymentReminder({}), null)
	const button = quotaUpsellButton('Upgrade', { url: 'https://x', price: 5, currencyCode: 'USD' })
	assert.equal(button.name, 'cta_url')
	assert.equal(JSON.parse(button.buttonParamsJson).price.value, 5000)
	assert.equal(quotaUpsellButton('More').name, 'quick_reply')
	const section = quotaUpsellSection({ title: 'Out of quota', buttons: ['Upgrade'], remaining: 0, limit: 20 })
	assert.equal(section.quotaUpsell.buttons.length, 1)
	assert.throws(() => quotaUpsellSection({ buttons: [] }), /at least one button/)
	assert.throws(() => quotaUpsellSection({ buttons: ['x'], remaining: 5, limit: 1 }), /cannot exceed/)
})

// ── status extras ──────────────────────────────────────────────────────────────
test('§2.84 the rest of the status surface builds real proto messages', () => {
	const quoted = makeStatusQuotedMessage({ id: 'S1' }, { text: 'nice' })
	assert.equal(roundTrip(quoted).statusQuotedMessage.text, 'nice')
	assert.equal(quoted.statusQuotedMessage.originalStatusId.remoteJid, 'status@broadcast')
	const notification = makeStatusNotificationMessage({ id: 'S1' }, { id: 'R1' }, { type: STATUS_NOTIFICATION_TYPES.STATUS_ADD_YOURS })
	assert.equal(roundTrip(notification).statusNotificationMessage.type, 'STATUS_ADD_YOURS')
	const addYours = makeStatusAddYoursAssociation({ image: { url: 'x' } }, { id: 'S1' })
	assert.equal(addYours.messageContextInfo.messageAssociation.parentMessageKey.id, 'S1')
	const group = makeGroupStatusAttribution({ conversation: 'hi' }, '123@g.us', { subject: 'Squad' })
	assert.equal(group.contextInfo.parentGroupJid, '123@g.us')
	assert.equal(group.contextInfo.groupSubject, 'Squad')
	const reaction = makeGroupStatusReactionMessage({ id: 'S1' }, '🔥', { groupJid: '123@g.us' })
	assert.equal(reaction.reactionMessage.text, '🔥')
	assert.ok(Object.keys(StatusFont).length >= 10)
	assert.equal(StatusLinkType.PREVIEW, 1)
	assert.throws(() => makeStatusQuotedMessage({}), /key with an id/)
	assert.throws(() => makeGroupStatusAttribution({}, '1@s.whatsapp.net'), /@g\.us/)
	assert.throws(() => makeStatusNotificationMessage({ id: 'a' }, { id: 'b' }, { type: 99 }), /unknown notification type/)
})

// ── newsletter status, the rest ────────────────────────────────────────────────
test('§2.84 channel status reaction / revoke / invite nodes', () => {
	const reaction = buildNewsletterStatusReactionNode({ newsletterJid: '1@newsletter', serverMessageId: 7, code: '👍' })
	assert.equal(reaction.attrs.type, 'reaction')
	assert.equal(reaction.content[0].attrs.code, '👍')
	const revoke = buildNewsletterStatusRevokeNode({ newsletterJid: '1@newsletter', serverMessageId: 7 })
	assert.equal(revoke.attrs.type, 'revoke')
	const profile = buildNewsletterAdminProfileStatusMessage({ newsletterJid: '1@newsletter', text: 'hi', newsletterName: 'JAP' })
	assert.equal(profile.contextInfo.forwardedNewsletterMessageInfo.newsletterName, 'JAP')
	const invite = makeNewsletterFollowerInviteMessage({ newsletterJid: '1@newsletter', newsletterName: 'JAP' })
	assert.equal(invite.newsletterFollowerInviteMessageV2.newsletterJid, '1@newsletter')
	assert.throws(() => buildNewsletterStatusReactionNode({ newsletterJid: '1@newsletter' }), /serverMessageId/)
	assert.throws(() => buildNewsletterAdminProfileStatusMessage({ newsletterJid: '1@newsletter' }), /"text" is required/)
})

test('§2.84 channel acks, server ids and the senders', async () => {
	const node = { tag: 'ack', attrs: { id: 'M1', server_id: '42', from: '1@newsletter', t: '1700000000' } }
	assert.equal(extractNewsletterMessageMeta(node).serverId, 42)
	assert.equal(extractNewsletterMessageMeta(null), null)
	assert.equal(parseNewsletterStatusAck(node, 'M1').matched, true)
	assert.equal(parseNewsletterStatusAck(node, 'OTHER').matched, false)

	const listeners = {}
	const sock = {
		ws: { on: (evt, fn) => { listeners[evt] = fn }, off: () => { delete listeners.frame } },
		generateMessageTag: () => 'tag',
		sendNode: async n => { sock.sent = n }
	}
	const promise = waitForNewsletterStatusServerId(sock, 'M1', { timeoutMs: 2000 })
	listeners.frame(node)
	assert.equal(await promise, 42)
	await assert.rejects(waitForNewsletterStatusServerId(sock, 'NOPE', { timeoutMs: 20 }), /no server id/)

	assert.deepEqual(await makeNewsletterStatusReactionSender(sock)('1@newsletter', 7, '🔥'),
		{ sent: true, serverMessageId: 7, code: '🔥' })
	assert.equal(sock.sent.attrs.type, 'reaction')
	assert.deepEqual(await makeNewsletterStatusRevokeSender(sock)('1@newsletter', 7), { revoked: true, serverMessageId: 7 })
	assert.equal(typeof NEWSLETTER_SERVER_ID_TIMEOUT_MS, 'number')
})

test('§2.84 the updates fetcher only returns what changed', async () => {
	const sock = {
		generateMessageTag: () => 'tag',
		query: async () => ({
			tag: 'iq', attrs: {}, content: [{
				tag: 'status_messages', attrs: {}, content: [
					{ tag: 'message', attrs: { server_id: '1', t: '1000' } },
					{ tag: 'message', attrs: { server_id: '2', t: '3000' } }
				]
			}]
		})
	}
	const result = await makeNewsletterStatusUpdatesFetcher(sock)('1@newsletter', { since: 2000 })
	assert.equal(result.updates.length, 1)
	assert.equal(result.updates[0].serverId, 2)
	assert.equal(result.latestTimestamp, 3000)
})

// ── scheduling + reveal keys ───────────────────────────────────────────────────
test('§2.84 schedule validation and the meta node', () => {
	const now = 1_700_000_000_000
	assert.equal(isScheduledTimeValid(now + 60_000, { now }).valid, true)
	assert.equal(isScheduledTimeValid(now - 1, { now }).reason, 'in the past')
	assert.equal(isScheduledTimeValid(now + 10, { now }).reason, 'too soon')
	assert.equal(isScheduledTimeValid(now + 40 * 24 * 3600 * 1000, { now }).reason, 'too far ahead')
	assert.equal(isScheduledTimeValid('whenever', { now }).reason, 'unparseable')
	const node = buildScheduledMsgMetaNode({ scheduleId: 'S1', scheduledAt: now, timezone: 'Asia/Jakarta' })
	assert.equal(node.tag, 'scheduled_msg')
	assert.equal(node.attrs.t, String(now / 1000))
	assert.equal(node.attrs.tz, 'Asia/Jakarta')
	assert.throws(() => buildScheduledMsgMetaNode({ scheduledAt: now }), /scheduleId/)
	assert.throws(() => buildScheduledMsgMetaNode({ scheduleId: 'S', scheduledAt: -1 }), /timestamp in ms/)
})

test('§2.84 reveal keys lock a payload until the key is shared', () => {
	const key = generateRevealKey()
	assert.equal(key.length, 32)
	assert.equal(generateRevealKeyId(key).length, 32)
	const envelope = encryptWithRevealKey({ text: 'Surprise!' }, key)
	assert.equal(envelope.keyId, generateRevealKeyId(key))
	assert.deepEqual(decryptWithRevealKey(envelope, key), { text: 'Surprise!' })
	assert.throws(() => decryptWithRevealKey(envelope, generateRevealKey()), /does not match/)
	const tampered = { ...envelope, keyId: undefined, ciphertext: Buffer.concat([envelope.ciphertext.subarray(0, -1), Buffer.from([0])]) }
	assert.throws(() => decryptWithRevealKey(tampered, key), /wrong key or tampered/)
	assert.throws(() => encryptWithRevealKey({}, Buffer.alloc(8)), /must be 32 bytes/)

	const locked = buildConditionalRevealMessage({ text: 'Surprise!' }, key, { revealAt: Date.now() + 3_600_000 })
	assert.equal(locked.content.conditionalReveal.keyId, locked.keyId)
	assert.ok(!JSON.stringify(locked.content).includes('Surprise!'), 'the payload leaked in cleartext')
	assert.deepEqual(locked.reveal(key), { text: 'Surprise!' })
	assert.throws(() => buildConditionalRevealMessage({ text: 'x' }, key, { revealAt: Date.now() - 1000 }), /in the past/)
})
