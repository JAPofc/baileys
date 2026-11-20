import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	DEFAULT_MAX_EVENTS,
	DIGEST_WINDOWS,
	createDigest,
	renderDigest,
	restoreDigest,
	startDigest
} from '../lib/Builders/Digest.js'
import { BUILD_TAG, findAttributionTraces } from '../lib/Utils/provenance.js'

const clockAt = start => {
	const clock = { t: start }
	return { clock, now: () => clock.t }
}

const sample = (overrides = {}) => ({ type: 'join', actor: 'a@s.whatsapp.net', text: 'Budi joined', ...overrides })

describe('createDigest — buffering', () => {
	it('counts events without sending anything', () => {
		const d = createDigest()
		d.add(sample())
		d.add(sample({ actor: 'b' }))
		assert.equal(d.size, 2)
		assert.equal(d.empty, false)
	})

	it('collapses repeats into one line with a count', () => {
		const d = createDigest({ dedupeKey: e => `${e.type}:${e.actor}`, format: e => e.text })
		for (let i = 0; i < 7; i++) {
			d.add(sample())
		}
		assert.equal(d.size, 7)
		assert.equal(d.unique, 1)
		assert.match(d.flush().text, /Budi joined x7/)
	})

	it('groups by section', () => {
		const d = createDigest({ groupBy: e => e.type, format: e => e.text, dedupeKey: e => e.text })
		d.add(sample())
		d.add(sample({ type: 'leave', text: 'Siti left' }))
		const { summary } = d.flush()
		assert.deepEqual(summary.groups.map(g => g.name), ['join', 'leave'])
	})

	it('keeps counting past the buffer cap instead of growing without bound', () => {
		const d = createDigest({ maxEvents: 10, dedupeKey: e => e.id })
		for (let i = 0; i < 1000; i++) {
			d.add({ id: i, text: `event ${i}` })
		}
		assert.equal(d.unique, 10, 'bodies are capped')
		assert.equal(d.size, 1000, 'but the flood is still reported')
		assert.equal(d.dropped, 990)
	})

	it('says out loud that it truncated', () => {
		const d = createDigest({ maxEvents: 2, dedupeKey: e => e.id })
		for (let i = 0; i < 50; i++) {
			d.add({ id: i, text: `e${i}` })
		}
		assert.match(d.flush().text, /48 events beyond the buffer limit were counted but not listed/)
	})

	it('caps rendered lines and reports the remainder', () => {
		const d = createDigest({ maxLines: 3, dedupeKey: e => e.id, format: e => e.text })
		for (let i = 0; i < 20; i++) {
			d.add({ id: i, text: `e${i}` })
		}
		const text = d.flush().text
		assert.equal((text.match(/^• /gm) || []).length, 3)
		assert.match(text, /… and 17 more lines/)
	})

	it('ignores a null event', () => {
		const d = createDigest()
		assert.equal(d.add(null).accepted, false)
		assert.equal(d.add(undefined).accepted, false)
		assert.equal(d.size, 0)
	})

	it('survives callbacks that throw', () => {
		const d = createDigest({
			dedupeKey: () => {
				throw new Error('bad key')
			},
			groupBy: () => {
				throw new Error('bad group')
			},
			format: () => {
				throw new Error('bad format')
			}
		})
		assert.equal(d.add(sample()).accepted, true)
		assert.doesNotThrow(() => d.flush())
	})
})

describe('createDigest — windows', () => {
	it('is not due before its window closes', () => {
		const { clock, now } = clockAt(1000)
		const d = createDigest({ every: 'hourly', now })
		assert.equal(d.due(), false)
		clock.t += DIGEST_WINDOWS.hourly
		assert.equal(d.due(), true)
	})

	it('accepts a numeric window', () => {
		const { clock, now } = clockAt(0)
		const d = createDigest({ every: 5000, now })
		clock.t = 4999
		assert.equal(d.due(), false)
		clock.t = 5000
		assert.equal(d.due(), true)
	})

	it('rejects an unknown named window', () => {
		assert.throws(() => createDigest({ every: 'fortnightly' }), /unknown window/)
	})

	it('aligns a daily release to a chosen hour rather than to boot time', () => {
		const start = new Date('2026-10-01T13:37:00Z').getTime()
		const d = createDigest({ every: 'daily', align: true, atHour: 9, now: () => start })
		const release = new Date(d.releaseAt)
		assert.equal(release.getHours(), 9)
		assert.equal(release.getMinutes(), 0)
		assert.ok(d.releaseAt > start)
	})

	it('rolls the release forward past a missed window', () => {
		const { clock, now } = clockAt(0)
		const d = createDigest({ every: 1000, now })
		d.add(sample())
		clock.t = 10_500 // ten windows went by while the bot was asleep
		d.flush()
		assert.ok(d.releaseAt > 10_500, 'the next release must be in the future')
		assert.ok(d.releaseAt <= 11_500)
	})
})

describe('createDigest — releasing', () => {
	it('says nothing when the window was empty', () => {
		const d = createDigest()
		const result = d.flush()
		assert.equal(result.released, false)
		assert.equal(result.text, undefined)
		assert.equal(d.releases, 0)
	})

	it('can be made to speak even when empty', () => {
		const d = createDigest({ quietIfEmpty: false })
		assert.equal(d.flush().released, true)
	})

	it('empties the buffer on release', () => {
		const d = createDigest()
		d.add(sample())
		d.flush()
		assert.equal(d.size, 0)
		assert.equal(d.flush().released, false)
	})

	it('reopens before rendering, so a mid-flush event is not lost', () => {
		let captured
		const d = createDigest({
			render: summary => {
				// an event arriving while the caller renders/sends belongs to the NEXT window
				d.add(sample({ text: 'arrived during flush' }))
				captured = summary.total
				return 'rendered'
			}
		})
		d.add(sample())
		d.flush()

		assert.equal(captured, 1, 'the released summary holds only the closed window')
		assert.equal(d.size, 1, 'and the late event survives into the new window')
	})

	it('reset() drops the window without releasing it', () => {
		const d = createDigest()
		d.add(sample())
		d.reset()
		assert.equal(d.size, 0)
		assert.equal(d.releases, 0)
	})

	it('peek() shows the contents without closing anything', () => {
		const d = createDigest({ format: e => e.text, dedupeKey: e => e.text })
		d.add(sample())
		assert.equal(d.peek().total, 1)
		assert.equal(d.size, 1, 'peek must not consume')
	})
})

describe('createDigest — surviving a restart', () => {
	it('round-trips through JSON with its window intact', () => {
		const { now } = clockAt(5000)
		const d = createDigest({ every: 'hourly', dedupeKey: e => e.text, format: e => e.text, now })
		d.add(sample())
		d.add(sample())
		const state = JSON.parse(JSON.stringify(d.toJSON()))

		const revived = restoreDigest(state, { every: 'hourly', dedupeKey: e => e.text, format: e => e.text, now })
		assert.equal(revived.size, 2)
		assert.equal(revived.unique, 1)
		assert.equal(revived.releaseAt, d.releaseAt)
		assert.match(revived.flush().text, /Budi joined x2/)
	})

	it('keeps accumulating into the restored window', () => {
		const d = createDigest({ dedupeKey: e => e.text })
		d.add(sample())
		const revived = restoreDigest(d.toJSON(), { dedupeKey: e => e.text })
		revived.add(sample({ text: 'another' }))
		assert.equal(revived.size, 2)
	})

	it('ignores broken state rather than throwing', () => {
		for (const bad of [null, undefined, 42, 'nope', {}, { entries: 'not an array' }]) {
			assert.doesNotThrow(() => restoreDigest(bad))
		}
		assert.equal(restoreDigest({ entries: [['k', { event: 1, count: 1 }], 'garbage'] }).unique, 1)
	})
})

describe('renderDigest', () => {
	it('leads with the count and the window length', () => {
		const d = createDigest({ every: 3_600_000, now: (() => {
			let t = 0
			return () => t
		})() })
		d.add(sample())
		assert.match(d.flush().text, /1 event in the last 0 min/)
	})

	it('works standalone on a summary object', () => {
		const d = createDigest({ format: e => e.text, dedupeKey: e => e.text })
		d.add(sample())
		const { summary } = d.flush()
		assert.match(renderDigest(summary), /Budi joined/)
	})

	it('falls back to something readable without a format function', () => {
		const d = createDigest()
		d.add('plain string event')
		d.add({ text: 'object with text' })
		d.add({ message: 'object with message' })
		d.add({ weird: true })
		const text = d.flush().text
		for (const expected of ['plain string event', 'object with text', 'object with message', '"weird"']) {
			assert.ok(text.includes(expected), `missing: ${expected}`)
		}
	})
})

describe('createDigest — provenance', () => {
	it('carries a tagged id the scanner recognises', () => {
		const d = createDigest()
		assert.match(d.id, /^DGST-[0-9A-F]{6}-[0-9A-F]{8}$/)
		assert.ok(d.id.includes(BUILD_TAG))
		assert.ok(findAttributionTraces(d.id).some(t => t.name === 'build-tag'))
	})

	it('does not leak the id into the posted text', () => {
		const d = createDigest()
		d.add(sample())
		assert.ok(!d.flush().text.includes(d.id))
	})
})

describe('startDigest', () => {
	const fakeSock = () => {
		const sends = []
		return {
			sends,
			async sendMessage(jid, content) {
				sends.push(content)
				return { key: { id: `M${sends.length}` } }
			}
		}
	}

	it('posts nothing until the window is over', async () => {
		const { clock, now } = clockAt(0)
		const sock = fakeSock()
		const session = startDigest(sock, 'g@g.us', { every: 1000, now, dedupeKey: e => e.text })

		session.add(sample())
		assert.equal(await session.tick(), false)
		assert.equal(sock.sends.length, 0)

		clock.t = 1000
		assert.equal(await session.tick(), true)
		assert.equal(sock.sends.length, 1)
	})

	it('turns a flood into a single message', async () => {
		const { clock, now } = clockAt(0)
		const sock = fakeSock()
		const session = startDigest(sock, 'g@g.us', {
			every: 1000,
			now,
			dedupeKey: e => `${e.type}:${e.actor}`,
			format: e => e.text
		})

		for (let i = 0; i < 200; i++) {
			session.add(sample())
		}
		clock.t = 1000
		await session.tick()

		assert.equal(sock.sends.length, 1, '200 events, one message')
		assert.match(sock.sends[0].text, /x200/)
	})

	it('stays quiet across an empty window', async () => {
		const { clock, now } = clockAt(0)
		const sock = fakeSock()
		const session = startDigest(sock, 'g@g.us', { every: 1000, now })
		clock.t = 5000
		assert.equal(await session.tick(), false)
		assert.equal(sock.sends.length, 0)
	})

	it('reports a failed send instead of throwing into the scheduler', async () => {
		const errors = []
		const session = startDigest({
			async sendMessage() {
				throw new Error('offline')
			}
		}, 'g@g.us', { every: 1, onError: e => errors.push(e.message) })

		session.add(sample())
		await new Promise(resolve => setTimeout(resolve, 5))
		assert.equal(await session.release(), false)
		assert.deepEqual(errors, ['offline'])
	})

	it('stop() clears the timer and hands back resumable state', () => {
		let cleared = 0
		const timers = {
			setTimeout: () => ({ unref() {} }),
			clearTimeout: () => {
				cleared++
			}
		}
		const session = startDigest(fakeSock(), 'g@g.us', { autoTickMs: 1000, timers, dedupeKey: e => e.text })
		session.add(sample())
		const state = session.stop()

		assert.equal(cleared, 1)
		assert.equal(state.total, 1)
		assert.ok(Array.isArray(state.entries))
	})

	it('rejects a bad construction loudly', () => {
		assert.throws(() => startDigest(null, 'g@g.us'), /sendMessage/)
		assert.throws(() => startDigest(fakeSock(), ''), /jid/)
	})

	it('uses a sane default buffer cap', () => {
		assert.equal(DEFAULT_MAX_EVENTS, 500)
	})
})
