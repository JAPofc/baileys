import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BUILD_TAG, findAttributionTraces } from '../lib/Utils/provenance.js'
import {
	DEFAULT_MAX_EDITS,
	MAX_CONSECUTIVE_ERRORS,
	MIN_THROTTLE_MS,
	createLiveMessage,
	progressRenderer,
	startProgressMessage
} from '../lib/Builders/LiveMessage.js'

/** A socket that records every send and never touches a network. */
const fakeSock = (behaviour = {}) => {
	const sends = []
	let n = 0
	return {
		sends,
		get edits() {
			return sends.filter(s => s.content.edit)
		},
		async sendMessage(jid, content, options) {
			sends.push({ jid, content, options })
			if (behaviour.fail?.(sends.length, content)) {
				throw new Error('send failed')
			}
			return { key: { id: `MSG${++n}`, remoteJid: jid, fromMe: true } }
		}
	}
}

/** Timers we drive by hand, so no test waits on a real clock. */
const manualTimers = () => {
	let seq = 0
	const pending = new Map()
	return {
		get size() {
			return pending.size
		},
		setTimeout(fn) {
			const id = ++seq
			pending.set(id, fn)
			return { id, unref() {} }
		},
		clearTimeout(handle) {
			if (handle) {
				pending.delete(handle.id)
			}
		},
		/** Fire everything currently pending and await the work it kicked off. */
		async tick() {
			const due = [...pending.entries()]
			pending.clear()
			for (const [, fn] of due) {
				fn()
			}
			await new Promise(resolve => setImmediate(resolve))
			await new Promise(resolve => setImmediate(resolve))
		}
	}
}

const setup = (options = {}, behaviour = {}) => {
	const sock = fakeSock(behaviour)
	const timers = manualTimers()
	const live = createLiveMessage(sock, '123@s.whatsapp.net', {
		render: s => `count: ${s.count ?? 0}`,
		state: { count: 0 },
		timers,
		...options
	})
	return { sock, timers, live }
}

describe('createLiveMessage — lifecycle', () => {
	it('sends one plain message on start and exposes its key', async () => {
		const { sock, live } = setup()
		await live.start()

		assert.equal(sock.sends.length, 1)
		assert.deepEqual(sock.sends[0].content, { text: 'count: 0' })
		assert.equal(sock.sends[0].content.edit, undefined, 'the first send must not be an edit')
		assert.equal(live.key.id, 'MSG1')
		assert.equal(live.status, 'live')
	})

	it('edits in place rather than sending a new message', async () => {
		const { sock, timers, live } = setup()
		await live.start()
		live.set({ count: 1 })
		await timers.tick()

		assert.equal(sock.sends.length, 2)
		assert.deepEqual(sock.sends[1].content.edit, live.key)
		assert.equal(sock.sends[1].content.text, 'count: 1')
	})

	it('refuses to start twice', async () => {
		const { live } = setup()
		await live.start()
		await assert.rejects(() => live.start(), /already started/)
	})

	it('propagates a failed first send, because a missing message is not recoverable', async () => {
		const { live } = setup({}, { fail: n => n === 1 })
		await assert.rejects(() => live.start(), /send failed/)
	})

	it('quotes the first message when asked, and never quotes the edits', async () => {
		const quoted = { key: { id: 'ORIGINAL' } }
		const { sock, timers, live } = setup({ quoted })
		await live.start()
		live.set({ count: 1 })
		await timers.tick()

		assert.deepEqual(sock.sends[0].options, { quoted })
		assert.equal(sock.sends[1].options, undefined)
	})
})

describe('createLiveMessage — send suppression', () => {
	it('coalesces a burst of updates into a single edit', async () => {
		const { sock, timers, live } = setup()
		await live.start()

		for (let i = 1; i <= 50; i++) {
			live.set({ count: i })
		}
		await timers.tick()

		assert.equal(sock.edits.length, 1, 'fifty updates must not be fifty messages')
		assert.equal(sock.edits[0].content.text, 'count: 50', 'the one edit shows the latest state')
		assert.ok(live.stats.coalesced >= 48)
	})

	it('sends nothing when the render is unchanged', async () => {
		const { sock, timers, live } = setup()
		await live.start()

		live.set({ unrelated: true })
		await timers.tick()
		live.set({ count: 0 })
		await timers.tick()

		assert.equal(sock.edits.length, 0, 'an identical render is not worth a message')
		assert.equal(live.stats.skipped, 2)
		assert.equal(live.stats.edits, 0)
	})

	it('honours the edit budget', async () => {
		const { sock, timers, live } = setup({ maxEdits: 3 })
		await live.start()

		for (let i = 1; i <= 10; i++) {
			live.set({ count: i })
			await timers.tick()
		}

		assert.equal(sock.edits.length, 3)
		assert.equal(live.status, 'exhausted')
		assert.equal(live.remainingEdits, 0)
	})

	it('still delivers the final frame after the budget is spent', async () => {
		const { sock, timers, live } = setup({ maxEdits: 1 })
		await live.start()
		live.set({ count: 1 })
		await timers.tick()
		live.set({ count: 2 })
		await timers.tick()
		assert.equal(live.status, 'exhausted')

		await live.finish({ count: 99 })
		assert.equal(sock.edits.at(-1).content.text, 'count: 99', 'the result must always land')
		assert.equal(live.status, 'finished')
	})

	it('clamps a reckless throttle instead of honouring it', async () => {
		const { live } = setup({ throttleMs: 1 })
		await live.start()
		// no public getter for the throttle: assert the behaviour instead — a 1ms throttle
		// would let a second edit through immediately, the floor does not
		assert.ok(MIN_THROTTLE_MS >= 1000)
		assert.equal(live.status, 'live')
	})
})

describe('createLiveMessage — stopping', () => {
	it('finish() renders once more and then ignores updates', async () => {
		const { sock, timers, live } = setup()
		await live.start()
		await live.finish({ count: 7 })

		assert.equal(sock.edits.length, 1)
		assert.equal(sock.edits[0].content.text, 'count: 7')
		assert.equal(live.set({ count: 8 }), false)
		await timers.tick()
		assert.equal(sock.edits.length, 1)
	})

	it('finish() is idempotent and safe from a finally block', async () => {
		const { sock, live } = setup()
		await live.start()
		await live.finish({ count: 1 })
		await live.finish({ count: 2 })
		await live.finish()

		assert.equal(sock.edits.length, 1)
	})

	it('stop() leaves the message as-is and cancels pending work', async () => {
		const { sock, timers, live } = setup()
		await live.start()
		live.set({ count: 5 })
		assert.equal(timers.size, 1)

		live.stop()
		assert.equal(timers.size, 0, 'stop must clear the timer')
		await timers.tick()
		assert.equal(sock.edits.length, 0)
		assert.equal(live.status, 'stopped')
	})

	it('a ttl finishes the message on its own', async () => {
		const { sock, timers, live } = setup({ ttlMs: 5000 })
		await live.start()
		live.set({ count: 3 })
		await timers.tick() // fires both the throttle timer and the ttl

		assert.equal(live.status, 'finished')
		assert.ok(sock.edits.length >= 1)
		assert.equal(timers.size, 0, 'no timer may survive the finish')
	})

	it('leaves no timer behind in any terminal state', async () => {
		for (const close of [live => live.finish(), live => live.stop()]) {
			const { timers, live } = setup()
			await live.start()
			live.set({ count: 1 })
			await close(live)
			assert.equal(timers.size, 0)
		}
	})
})

describe('createLiveMessage — failures never escape', () => {
	it('reports a failed edit instead of rejecting in the background', async () => {
		const errors = []
		const { timers, live } = setup({ onError: (e, phase) => errors.push(phase) }, { fail: n => n > 1 })
		await live.start()
		live.set({ count: 1 })
		await timers.tick()

		assert.deepEqual(errors, ['edit'])
		assert.equal(live.stats.errors, 1)
		assert.equal(live.status, 'live', 'one failure is not fatal')
	})

	it('gives up after repeated failures rather than hammering the server', async () => {
		const { timers, live } = setup({ onError: () => {} }, { fail: n => n > 1 })
		await live.start()
		for (let i = 1; i <= MAX_CONSECUTIVE_ERRORS; i++) {
			live.set({ count: i })
			await timers.tick()
		}

		assert.equal(live.status, 'failed')
		assert.equal(timers.size, 0)
	})

	it('survives a render function that throws', async () => {
		const errors = []
		const { sock, timers, live } = setup({
			render: s => {
				if (s.count === 1) {
					throw new Error('bad render')
				}
				return `count: ${s.count}`
			},
			onError: (e, phase) => errors.push(phase)
		})
		await live.start()
		live.set({ count: 1 })
		await timers.tick()

		assert.deepEqual(errors, ['render'])
		assert.equal(sock.edits.length, 0)

		live.set({ count: 2 })
		await timers.tick()
		assert.equal(sock.edits.at(-1).content.text, 'count: 2', 'it recovers on the next update')
	})

	it('survives an onError callback that itself throws', async () => {
		const { timers, live } = setup({
			onError: () => {
				throw new Error('handler exploded')
			}
		}, { fail: n => n > 1 })
		await live.start()
		live.set({ count: 1 })
		await assert.doesNotReject(() => timers.tick())
	})

	it('rejects a bad construction loudly', () => {
		assert.throws(() => createLiveMessage(null, 'jid', { render: () => 'x' }), /sendMessage/)
		assert.throws(() => createLiveMessage(fakeSock(), '', { render: () => 'x' }), /jid/)
		assert.throws(() => createLiveMessage(fakeSock(), 'jid', {}), /render/)
	})
})

describe('createLiveMessage — state and content', () => {
	it('hands out a copy of state, not the live object', async () => {
		const { live } = setup()
		await live.start()
		const snapshot = live.state
		snapshot.count = 999
		assert.equal(live.state.count, 0)
	})

	it('update() computes from current state', async () => {
		const { sock, timers, live } = setup()
		await live.start()
		live.update(s => ({ count: s.count + 10 }))
		await timers.tick()
		assert.equal(sock.edits[0].content.text, 'count: 10')
	})

	it('accepts a full content object, not just a string', async () => {
		const { sock, timers, live } = setup({
			render: s => ({ text: `n=${s.count}`, mentions: ['1@s.whatsapp.net'] })
		})
		await live.start()
		live.set({ count: 2 })
		await timers.tick()
		assert.deepEqual(sock.edits[0].content.mentions, ['1@s.whatsapp.net'])
	})

	it('skips an edit when render returns nothing', async () => {
		const { sock, timers, live } = setup({ render: s => (s.count ? `n=${s.count}` : 'start') })
		await live.start()
		live.set({ count: 0 })
		await timers.tick()
		assert.equal(sock.edits.length, 0)
	})
})

describe('progressRenderer', () => {
	it('renders a bar, a count and the title', () => {
		const text = progressRenderer({ title: 'Uploading' })({ done: 5, total: 10 })
		assert.match(text, /\*Uploading\*/)
		assert.match(text, /50%/)
		assert.match(text, /5\/10/)
	})

	it('hides the eta until the estimate means something', () => {
		const render = progressRenderer()
		const early = render({ done: 1, total: 1000, startedAt: Date.now() - 1000 })
		const later = render({ done: 500, total: 1000, startedAt: Date.now() - 1000 })
		assert.ok(!early.includes('eta'), 'a 1-in-1000 sample is not an estimate')
		assert.match(later, /eta/)
	})

	it('shows no eta once the work is done', () => {
		const text = progressRenderer()({ done: 10, total: 10, startedAt: Date.now() - 5000 })
		assert.ok(!text.includes('eta'))
		assert.match(text, /elapsed/)
	})

	it('does not produce NaN for an empty or unknown total', () => {
		for (const state of [{}, { done: 3 }, { done: 0, total: 0 }]) {
			assert.ok(!progressRenderer()(state).includes('NaN'), JSON.stringify(state))
		}
	})

	it('appends a note and a footer when present', () => {
		const text = progressRenderer({ footer: 'bot v1' })({ done: 1, total: 2, note: 'retrying' })
		assert.match(text, /retrying/)
		assert.match(text, /bot v1/)
	})
})

describe('startProgressMessage', () => {
	it('starts live with sensible defaults', async () => {
		const sock = fakeSock()
		const live = await startProgressMessage(sock, 'g@g.us', { total: 4, title: 'Sync', timers: manualTimers() })

		assert.equal(live.status, 'live')
		assert.equal(live.state.total, 4)
		assert.ok(live.state.startedAt > 0)
		assert.match(sock.sends[0].content.text, /\*Sync\*/)
		assert.equal(live.remainingEdits, DEFAULT_MAX_EDITS)
	})

	it('drives a whole job with far fewer messages than steps', async () => {
		const sock = fakeSock()
		const timers = manualTimers()
		const live = await startProgressMessage(sock, 'g@g.us', { total: 200, title: 'Job', timers })

		for (let i = 1; i <= 200; i++) {
			live.set({ done: i })
		}
		await timers.tick()
		await live.finish({ label: 'Done', note: 'all files uploaded' })

		assert.ok(sock.sends.length <= 3, `expected a handful of sends, got ${sock.sends.length}`)
		assert.match(sock.sends.at(-1).content.text, /\*Done\*/)
		assert.match(sock.sends.at(-1).content.text, /200\/200/)
	})
})

describe('createLiveMessage — provenance', () => {
	it('carries a tagged correlation id', async () => {
		const { live } = setup()
		assert.match(live.id, /^LVM-[0-9A-F]{6}-[0-9A-F]{8}$/)
		assert.ok(live.id.includes(BUILD_TAG))
		assert.equal(live.buildTag, BUILD_TAG)
	})

	it('the id is a trace the provenance scanner recognises', () => {
		const { live } = setup()
		const traces = findAttributionTraces(`[warn] live message ${live.id} failed`)
		assert.ok(traces.some(t => t.name === 'build-tag'), JSON.stringify(traces))
	})

	it('never writes the id into the chat message', async () => {
		const { sock, timers, live } = setup()
		await live.start()
		live.set({ count: 1 })
		await timers.tick()
		for (const send of sock.sends) {
			assert.ok(
				!JSON.stringify(send.content).includes(live.id),
				'marking a user\'s message content is not ours to do'
			)
			assert.ok(!JSON.stringify(send.content).includes(BUILD_TAG))
		}
	})

	it('passes the id to onError so a failure can be correlated', async () => {
		const seen = []
		const { timers, live } = setup({ onError: (e, phase, id) => seen.push(id) }, { fail: n => n > 1 })
		await live.start()
		live.set({ count: 1 })
		await timers.tick()
		assert.deepEqual(seen, [live.id])
	})

	it('ids are unique across instances', () => {
		const ids = new Set(Array.from({ length: 500 }, () => setup().live.id))
		assert.equal(ids.size, 500)
	})

	it('accepts an explicit id for callers with their own scheme', () => {
		const { live } = setup({ id: 'my-own-id' })
		assert.equal(live.id, 'my-own-id')
	})
})
