// §2.113 — split bills and payment reminders.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { proto } from '../WAProto/index.js'
import {
	wireMoney, readWireMoney, buildSplitPaymentMessage, buildSplitPaymentUpdateMessage,
	buildPaymentReminderMessage, readSplitPaymentMessage, readSplitPaymentUpdateMessage,
	readPaymentReminderMessage, readPaymentMessage, toSplitPaymentMessage,
	WIRE_MONEY_OFFSET, SPLIT_PAYMENT_PARTICIPANT_STATUS, PAYMENT_REMINDER_FREQUENCY, PAYMENT_REMINDER_STATUS,
	buildSplitPayment
} from '../lib/index.js'

const A = '628111@s.whatsapp.net'
const B = '628222@s.whatsapp.net'
const roundTrip = content => proto.Message.decode(proto.Message.encode(content).finish())

test('§2.113 wireMoney() scales human amounts and readWireMoney() scales them back', () => {
	assert.deepEqual(wireMoney(125, 'idr'), { value: 125 * WIRE_MONEY_OFFSET, offset: WIRE_MONEY_OFFSET, currencyCode: 'IDR' })
	assert.equal(wireMoney(12.3456, 'USD').value, 12346, 'rounded to the offset precision')
	assert.equal(readWireMoney(wireMoney(99.5, 'EUR')).amount, 99.5)
	assert.equal(readWireMoney(undefined), undefined)
	assert.throws(() => wireMoney('10', 'IDR'), /finite number/)
	assert.throws(() => wireMoney(10, 'rupiah'), /3-letter ISO code/)
	assert.throws(() => wireMoney(10, 'IDR', 0), /positive integer/)
})

test('§2.113 a split survives the wire and reports what is still owed', () => {
	const split = buildSplitPaymentMessage({
		splitId: 'dinner-1', total: 300, currency: 'IDR', description: 'Makan malam', requesterJid: A,
		participants: [{ jid: A, amount: 100, status: 'PAID' }, { jid: B, amount: 200 }],
		createdAt: new Date(1700000000000)
	})
	const read = readSplitPaymentMessage(roundTrip({ splitPaymentMessage: split }))
	assert.equal(read.splitId, 'dinner-1')
	assert.equal(read.total.amount, 300)
	assert.equal(read.total.currency, 'IDR')
	assert.equal(read.createdAtMs, 1700000000000)
	assert.equal(read.participants.length, 2)
	assert.equal(read.participants[0].paid, true)
	assert.equal(read.participants[1].status, SPLIT_PAYMENT_PARTICIPANT_STATUS.PENDING)
	assert.equal(read.settled, 100)
	assert.equal(read.outstanding, 200)
	assert.equal(read.complete, false)
})

test('§2.113 splitEvenly divides the rest and the parts always add up', () => {
	const split = buildSplitPaymentMessage({
		splitId: 7, total: 100, currency: 'USD', splitEvenly: true,
		participants: [{ jid: A, amount: 40 }, { jid: B }, { jid: '628333@s.whatsapp.net' }]
	})
	const values = split.participants.map(p => p.amount.value)
	assert.equal(values.reduce((a, b) => a + b, 0), 100 * WIRE_MONEY_OFFSET, 'the parts must sum to the total')
	assert.deepEqual(values.slice(1), [30000, 30000])
	assert.throws(() => buildSplitPaymentMessage({ splitId: 1, splitEvenly: true, participants: [{ jid: A }] }), /numeric "total"/)
})

test('§2.113 inputs are validated instead of silently producing junk', () => {
	assert.throws(() => buildSplitPaymentMessage({ participants: [{ jid: A }] }), /"splitId"/)
	assert.throws(() => buildSplitPaymentMessage({ splitId: 'x', participants: [] }), /non-empty array/)
	assert.throws(() => buildSplitPaymentMessage({ splitId: 'x', participants: [{ jid: 'not-a-jid' }] }), /jid is required/)
	assert.throws(() => buildSplitPaymentMessage({ splitId: 'x', participants: [{ jid: A, status: 'MAYBE' }] }), /unknown value/)
	assert.throws(() => buildPaymentReminderMessage({ reminderId: 'r', frequency: 'DAILY' }), /unknown value/)
	assert.throws(() => buildSplitPaymentUpdateMessage({ splitId: 'x' }), /jid is required/)
})

test('§2.113 a reminder survives the wire with its enums intact', () => {
	const reminder = buildPaymentReminderMessage({
		reminderId: 'rent', instanceId: 3, description: 'Kos', frequency: 'MONTHLY',
		amount: 1500, currency: 'IDR', payerJid: B, payeeVpa: 'jap@bank'
	})
	assert.equal(reminder.frequency, PAYMENT_REMINDER_FREQUENCY.MONTHLY)
	assert.equal(reminder.status, PAYMENT_REMINDER_STATUS.ACTIVE)
	const read = readPaymentReminderMessage(roundTrip({ paymentReminderMessage: reminder }))
	assert.equal(read.reminderId, 'rent')
	assert.equal(read.instanceId, '3')
	assert.equal(read.amount.amount, 1500)
	assert.equal(read.payerJid, B)
	assert.equal(read.active, true)
})

test('§2.113 updates read back, and readPaymentMessage() dispatches', () => {
	const update = buildSplitPaymentUpdateMessage({ splitId: 'dinner-1', participantJid: B })
	const decoded = roundTrip({ splitPaymentUpdateMessage: update })
	assert.deepEqual(readSplitPaymentUpdateMessage(decoded), { splitId: 'dinner-1', participantJid: B })
	assert.equal(readPaymentMessage(decoded).type, 'splitUpdate')
	assert.equal(readPaymentMessage(roundTrip({ paymentReminderMessage: buildPaymentReminderMessage({ reminderId: 'r' }) })).type, 'reminder')
	assert.equal(readPaymentMessage(roundTrip({
		splitPaymentMessage: buildSplitPaymentMessage({ splitId: 's', participants: [{ jid: A }] })
	})).type, 'split')
	assert.equal(readPaymentMessage({ conversation: 'hi' }), null)
	assert.equal(readSplitPaymentMessage({ conversation: 'hi' }), null)
})

test('§2.113 the socket exposes the three senders, typed', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	for (const name of ['sendSplitPayment', 'sendSplitPaymentUpdate', 'sendPaymentReminder']) {
		assert.match(src, new RegExp(`${name}: async \\(jid`), name)
	}
	for (const file of ['index', 'messages-send']) {
		const dts = readFileSync(new URL(`../lib/Socket/${file}.d.ts`, import.meta.url), 'utf8')
		assert.match(dts, /sendPaymentReminder: \(jid: string/, file)
	}
})

test('§2.113 the legacy bookkeeping split can be turned into a sendable message', () => {
	const legacy = buildSplitPayment({ total: 240000, currencyCode: 'IDR', participants: [A, B], note: 'Dinner' })
	const wire = toSplitPaymentMessage(legacy, { requesterJid: A })
	const read = readSplitPaymentMessage(roundTrip({ splitPaymentMessage: wire }))
	assert.equal(read.description, 'Dinner')
	assert.equal(read.requesterJid, A)
	assert.equal(read.participants.length, 2)
	assert.equal(read.total.amount, 240000)
	assert.equal(read.participants.reduce((sum, p) => sum + p.amount.value, 0), read.total.value)
	assert.throws(() => toSplitPaymentMessage({}), /buildSplitPayment\(\)/)
})
