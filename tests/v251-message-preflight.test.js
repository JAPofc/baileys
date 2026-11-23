import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PREFLIGHT_LIMITS, formatPreflight, preflightMessage } from '../lib/Utils/message-preflight.js'

/**
 * §2.220 — preflight. The contract that matters most is the negative one: this function is
 * a validator, so it must never become the failure it exists to prevent. Every test here
 * that feeds it garbage is checking that it returns a finding instead of throwing.
 */

const DM = '62811111111@s.whatsapp.net'
const GROUP = '12345-67890@g.us'
const CHANNEL = '120363000000000000@newsletter'
const STATUS = 'status@broadcast'

const codes = result => result.findings.map(f => f.code).sort()
const has = (result, code) => result.findings.some(f => f.code === code)

describe('preflight — a clean payload stays clean', () => {
	it('a plain text message to a dm produces nothing', () => {
		const r = preflightMessage({ text: 'halo' }, { jid: DM })
		assert.equal(r.ok, true)
		assert.deepEqual(r.findings, [])
		assert.equal(r.recipient, 'dm')
		assert.equal(formatPreflight(r), '', 'nothing to report means an empty string, not "no issues"')
	})

	it('a valid poll in a group produces nothing', () => {
		const r = preflightMessage({ poll: { name: 'Hari terbaik?', values: ['Senin', 'Jumat'], selectableCount: 1 } }, { jid: GROUP })
		assert.equal(r.ok, true)
		assert.deepEqual(r.findings, [])
	})

	it('a clean result never claims delivery', () => {
		const r = preflightMessage({ text: 'halo' }, { jid: DM })
		assert.ok(Array.isArray(r.checked) && r.checked.length > 0, 'the result states what was actually checked')
		assert.ok(!('willDeliver' in r) && !('valid' in r), 'no field implies a server-side guarantee')
	})
})

describe('preflight — never throws, whatever it is handed', () => {
	for (const [label, input] of [
		['null', null],
		['undefined', undefined],
		['a string', 'halo'],
		['a number', 42],
		['an array', [1, 2]],
		['an empty object', {}]
	]) {
		it(`survives ${label}`, () => {
			const r = preflightMessage(input, { jid: DM })
			assert.equal(typeof r.ok, 'boolean')
			assert.ok(Array.isArray(r.findings))
		})
	}

	it('survives deeply malformed nested content', () => {
		const r = preflightMessage(
			{ poll: { values: 'not-an-array' }, buttons: 'nope', sections: 7, album: {}, stickerPack: { stickers: null }, mentions: 'x' },
			{ jid: GROUP }
		)
		assert.equal(typeof r.ok, 'boolean')
	})

	it('survives a self-referencing object', () => {
		const content = { text: 'hi' }
		content.contextInfo = { quotedMessage: content }
		const r = preflightMessage(content, { jid: DM })
		assert.equal(r.ok, true)
	})

	it('reports a non-object instead of crashing', () => {
		const r = preflightMessage(null, { jid: DM })
		assert.equal(r.ok, false)
		assert.ok(has(r, 'content-not-an-object'))
	})
})

describe('preflight — poll rules', () => {
	it('rejects fewer than two and more than twelve options', () => {
		assert.ok(has(preflightMessage({ poll: { name: 'q', values: ['a'] } }, { jid: GROUP }), 'poll-option-count'))
		const many = Array.from({ length: PREFLIGHT_LIMITS.pollOptionsMax + 1 }, (_, i) => `o${i}`)
		assert.ok(has(preflightMessage({ poll: { name: 'q', values: many } }, { jid: GROUP }), 'poll-option-count'))
	})

	it('accepts exactly the boundary counts', () => {
		const exactlyTwo = preflightMessage({ poll: { name: 'q', values: ['a', 'b'] } }, { jid: GROUP })
		const exactlyTwelve = preflightMessage(
			{ poll: { name: 'q', values: Array.from({ length: PREFLIGHT_LIMITS.pollOptionsMax }, (_, i) => `o${i}`) } },
			{ jid: GROUP }
		)
		assert.equal(exactlyTwo.ok, true)
		assert.equal(exactlyTwelve.ok, true)
	})

	it('flags duplicate options as a warning, not an error', () => {
		const r = preflightMessage({ poll: { name: 'q', values: ['a', 'a'] } }, { jid: GROUP })
		assert.ok(has(r, 'poll-duplicate-options'))
		assert.equal(r.ok, true, 'a duplicate is legal, just confusing')
	})

	it('flags a blank option, a non-string option and an over-long one', () => {
		const r = preflightMessage({ poll: { name: 'q', values: ['  ', 42, 'x'.repeat(PREFLIGHT_LIMITS.pollOptionMax + 1)] } }, { jid: GROUP })
		assert.ok(has(r, 'poll-option-empty'))
		assert.ok(has(r, 'poll-option-type'))
		assert.ok(has(r, 'poll-option-too-long'))
	})

	it('flags selectableCount larger than the option list', () => {
		assert.ok(has(preflightMessage({ poll: { name: 'q', values: ['a', 'b'], selectableCount: 3 } }, { jid: GROUP }), 'poll-selectable-count'))
	})

	it('a quiz poll is an error outside a newsletter and fine inside one', () => {
		const quiz = { poll: { name: 'q', values: ['a', 'b'], pollType: 1, correctAnswer: 0 } }
		assert.ok(has(preflightMessage(quiz, { jid: GROUP }), 'quiz-outside-newsletter'))
		assert.ok(has(preflightMessage(quiz, { jid: DM }), 'quiz-outside-newsletter'))
		assert.equal(preflightMessage(quiz, { jid: CHANNEL }).ok, true)
	})
})

describe('preflight — length rules count characters, not bytes', () => {
	it('a caption of emoji is measured by code points', () => {
		// 1025 astral characters is 4100 bytes; the limit is about characters
		const caption = '😀'.repeat(PREFLIGHT_LIMITS.captionMax + 1)
		const r = preflightMessage({ image: { url: 'x.jpg' }, caption }, { jid: DM })
		assert.ok(has(r, 'caption-too-long'))
		const justUnder = '😀'.repeat(PREFLIGHT_LIMITS.captionMax)
		assert.equal(preflightMessage({ image: { url: 'x.jpg' }, caption: justUnder }, { jid: DM }).ok, true)
	})

	it('an empty text is an error, an omitted one is not', () => {
		assert.ok(has(preflightMessage({ text: '' }, { jid: DM }), 'text-empty'))
		assert.equal(preflightMessage({ image: { url: 'x.jpg' } }, { jid: DM }).ok, true)
	})
})

describe('preflight — buttons, lists, albums, sticker packs', () => {
	it('caps buttons at ten and notices duplicate ids', () => {
		const buttons = Array.from({ length: PREFLIGHT_LIMITS.buttonsMax + 1 }, (_, i) => ({ buttonId: `b${i}`, buttonText: { displayText: 'x' } }))
		assert.ok(has(preflightMessage({ text: 'hi', buttons }, { jid: DM }), 'buttons-too-many'))
		const dupes = [
			{ buttonId: 'same', buttonText: { displayText: 'a' } },
			{ buttonId: 'same', buttonText: { displayText: 'b' } }
		]
		assert.ok(has(preflightMessage({ text: 'hi', buttons: dupes }, { jid: DM }), 'buttons-duplicate-id'))
	})

	it('caps list sections and rows', () => {
		const sections = Array.from({ length: PREFLIGHT_LIMITS.listSectionsMax + 1 }, () => ({ rows: [{ title: 'r' }] }))
		assert.ok(has(preflightMessage({ text: 'hi', sections }, { jid: DM }), 'list-sections-too-many'))
		const fat = [{ rows: Array.from({ length: PREFLIGHT_LIMITS.listRowsPerSectionMax + 1 }, () => ({ title: 'r' })) }]
		assert.ok(has(preflightMessage({ text: 'hi', sections: fat }, { jid: DM }), 'list-rows-too-many'))
	})

	it('an album needs two or more items and rejects a non-media entry', () => {
		assert.ok(has(preflightMessage({ album: [{ image: { url: 'a.jpg' } }] }, { jid: DM }), 'album-too-small'))
		assert.ok(has(preflightMessage({ album: [{ image: { url: 'a.jpg' } }, { text: 'no' }] }, { jid: DM }), 'album-bad-item'))
	})

	it('a sticker pack is capped at 60 stickers and 1 MB each', () => {
		const stickers = Array.from({ length: PREFLIGHT_LIMITS.stickerPackMax + 1 }, () => Buffer.alloc(8))
		assert.ok(has(preflightMessage({ stickerPack: { stickers } }, { jid: DM }), 'sticker-pack-too-large'))
		const heavy = { stickerPack: { stickers: [Buffer.alloc(PREFLIGHT_LIMITS.stickerBytesMax + 1)] } }
		assert.ok(has(preflightMessage(heavy, { jid: DM }), 'sticker-too-large'))
	})
})

describe('preflight — recipient rules', () => {
	it('a missing jid is reported, not assumed', () => {
		const r = preflightMessage({ text: 'hi' })
		assert.equal(r.ok, false)
		assert.ok(has(r, 'recipient-missing'))
		assert.equal(r.recipient, 'unknown')
	})

	it('classifies dm, group, newsletter and status', () => {
		assert.equal(preflightMessage({ text: 'x' }, { jid: DM }).recipient, 'dm')
		assert.equal(preflightMessage({ text: 'x' }, { jid: GROUP }).recipient, 'group')
		assert.equal(preflightMessage({ text: 'x' }, { jid: CHANNEL }).recipient, 'newsletter')
		assert.equal(preflightMessage({ text: 'x' }, { jid: STATUS }).recipient, 'status')
	})

	it('warns about interactive content and mentions in a channel', () => {
		const r = preflightMessage({ text: 'x', buttons: [{ buttonId: 'a', buttonText: { displayText: 'a' } }], mentions: [DM] }, { jid: CHANNEL })
		assert.ok(has(r, 'interactive-in-newsletter'))
		assert.ok(has(r, 'mentions-in-newsletter'))
		assert.equal(r.ok, true, 'these are warnings: the message still sends, it just will not render')
	})

	it('buttons on a status update are an error', () => {
		assert.ok(has(preflightMessage({ text: 'x', buttons: [{ buttonId: 'a' }] }, { jid: STATUS }), 'buttons-in-status'))
	})

	it('a malformed mention jid is caught', () => {
		const r = preflightMessage({ text: 'x', mentions: ['62811111111', DM] }, { jid: GROUP })
		assert.ok(has(r, 'mention-malformed'))
	})

	it('reads mentions from contextInfo too', () => {
		const r = preflightMessage({ text: 'x', contextInfo: { mentionedJid: ['nope'] } }, { jid: GROUP })
		assert.ok(has(r, 'mention-malformed'))
	})
})

describe('preflight — media shape', () => {
	it('accepts Buffer, { url } and { stream }', () => {
		assert.equal(preflightMessage({ image: Buffer.alloc(4) }, { jid: DM }).ok, true)
		assert.equal(preflightMessage({ video: { url: 'v.mp4' } }, { jid: DM }).ok, true)
		assert.equal(preflightMessage({ document: { stream: Buffer.alloc(2) } }, { jid: DM }).ok, true)
	})

	it('rejects an unresolvable media value and an empty url', () => {
		assert.ok(has(preflightMessage({ image: 'please-fetch-this' }, { jid: DM }), 'media-unresolvable'))
		assert.ok(has(preflightMessage({ image: { url: '   ' } }, { jid: DM }), 'media-empty-url'))
	})

	it('warns when audio has no mimetype and no ptt flag', () => {
		assert.ok(has(preflightMessage({ audio: { url: 'a.ogg' } }, { jid: DM }), 'audio-no-mimetype'))
		assert.equal(preflightMessage({ audio: { url: 'a.ogg' }, ptt: true }, { jid: DM }).ok, true)
	})
})

describe('preflight — the result shape itself', () => {
	it('errors and warnings partition findings, and ok tracks errors only', () => {
		const r = preflightMessage({ poll: { name: 'q', values: ['a', 'a', 42] } }, { jid: CHANNEL })
		assert.equal(r.errors.length + r.warnings.length, r.findings.length)
		assert.equal(r.ok, r.errors.length === 0)
		assert.ok(r.errors.every(f => f.severity === 'error'))
		assert.ok(r.warnings.every(f => f.severity === 'warning'))
	})

	it('every finding carries a stable machine-readable code', () => {
		const r = preflightMessage({ poll: { values: [] }, buttons: [], image: 7 }, { jid: CHANNEL })
		assert.ok(r.findings.length > 0)
		for (const f of r.findings) {
			assert.match(f.code, /^[a-z0-9-]+$/, 'codes are stable identifiers, safe to switch on')
			assert.ok(f.message.length > 0)
		}
		assert.deepEqual(codes(r), [...codes(r)].sort())
	})

	it('formatPreflight renders one line per finding', () => {
		const r = preflightMessage({ poll: { name: 'q', values: ['a'] }, text: '' }, { jid: GROUP })
		const lines = formatPreflight(r).split('\n')
		assert.equal(lines.length, r.findings.length)
		assert.ok(lines.every(l => l.startsWith('[error]') || l.startsWith('[warning]')))
	})
})
