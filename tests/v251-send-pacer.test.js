import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SendPacer, createSendPacer } from '../lib/Utils/send-pacer.js'

/**
 * §2.222 — the pacer. Every clock is injected, so these tests assert exact millisecond
 * arithmetic with no real waiting and no flakiness. A pacer tested against `setTimeout`
 * would be a pacer tested against the CI machine's load average.
 */

/** A fake clock: time only moves when the pacer sleeps, or when we move it. */
const fakeClock = (start = 1_000_000) => {
	let t = start
	const slept = []
	return {
		now: () => t,
		sleep: async ms => {
			slept.push(ms)
			t += ms
		},
		advance: ms => {
			t += ms
		},
		slept,
		get time() {
			return t
		}
	}
}

const pacerWith = (clock, options = {}) =>
	new SendPacer({ now: clock.now, sleep: clock.sleep, random: () => 0, jitterMs: 0, ...options })

describe('§2.222 spacing', () => {
	it('the first send goes immediately', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 1000 })
		await pacer.schedule(() => 'ok')
		assert.deepEqual(clock.slept, [], 'nothing waited for an idle pacer')
	})

	it('a second send waits exactly minDelayMs', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 1000 })
		await pacer.schedule(() => 1)
		await pacer.schedule(() => 2)
		assert.deepEqual(clock.slept, [1000])
	})

	it('time already elapsed counts against the delay', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 1000 })
		await pacer.schedule(() => 1)
		clock.advance(700)
		await pacer.schedule(() => 2)
		assert.deepEqual(clock.slept, [300], 'only the remaining 300ms is waited')
	})

	it('a long idle period means no wait at all', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 1000 })
		await pacer.schedule(() => 1)
		clock.advance(60_000)
		await pacer.schedule(() => 2)
		assert.deepEqual(clock.slept, [])
	})

	it('msPerCharacter scales the gap with message length', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, msPerCharacter: 10 })
		await pacer.schedule(() => 1, { text: 'abc' })
		await pacer.schedule(() => 2, { text: 'abcde' })
		assert.deepEqual(clock.slept, [50], 'five characters at 10ms each')
	})
})

describe('§2.222 jitter', () => {
	it('is bounded by jitterMs and uses the injected randomness', async () => {
		const clock = fakeClock()
		const pacer = new SendPacer({ now: clock.now, sleep: clock.sleep, random: () => 1, minDelayMs: 1000, jitterMs: 400 })
		await pacer.schedule(() => 1)
		await pacer.schedule(() => 2)
		// Jitter applies to the FIRST send too, which is the point of jitter: a bot whose
		// very first reply is always instant is still a recognisable machine. So the first
		// release waits 0 + 400, and the second 1000 + 400.
		assert.deepEqual(clock.slept, [400, 1400], 'full jitter at random()===1, including the first send')
	})

	it('the first send is delayed by jitter alone, never by minDelayMs', async () => {
		const clock = fakeClock()
		const pacer = new SendPacer({ now: clock.now, sleep: clock.sleep, random: () => 0.5, minDelayMs: 5000, jitterMs: 200 })
		await pacer.schedule(() => 1)
		assert.deepEqual(clock.slept, [100], 'an idle pacer owes no spacing, only jitter')
	})

	it('jitter of zero makes the pacer exact', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 250 })
		await pacer.schedule(() => 1)
		await pacer.schedule(() => 2)
		assert.deepEqual(clock.slept, [250])
	})

	it('jitter still applies when no spacing is owed', () => {
		const clock = fakeClock()
		const pacer = new SendPacer({ now: clock.now, sleep: clock.sleep, random: () => 0.5, minDelayMs: 0, jitterMs: 200 })
		assert.equal(pacer.delayFor(''), 100)
	})
})

describe('§2.222 rolling quotas', () => {
	it('stops at perMinute and resumes when the window rolls', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 3, perHour: 0 })
		for (let i = 0; i < 3; i++) await pacer.schedule(() => i)
		assert.deepEqual(clock.slept, [], 'the first three are free')
		await pacer.schedule(() => 4)
		assert.equal(clock.slept.length, 1)
		assert.equal(clock.slept[0], 60_000, 'waits until the oldest of the three expires')
	})

	it('waits only for the oldest entry, not a whole fresh window', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 2, perHour: 0 })
		await pacer.schedule(() => 1)
		clock.advance(50_000)
		await pacer.schedule(() => 2)
		await pacer.schedule(() => 3)
		assert.deepEqual(clock.slept, [10_000], 'the first entry expires in 10s, so that is the wait')
	})

	it('perHour is enforced as well', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 0, perHour: 2 })
		await pacer.schedule(() => 1)
		await pacer.schedule(() => 2)
		await pacer.schedule(() => 3)
		assert.deepEqual(clock.slept, [3_600_000])
	})

	it('a quota of zero disables that window', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 0, perHour: 0 })
		for (let i = 0; i < 50; i++) await pacer.schedule(() => i)
		assert.deepEqual(clock.slept, [])
	})

	it('history is bounded by the window, not by total sends', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 0, perHour: 0 })
		for (let i = 0; i < 40; i++) {
			await pacer.schedule(() => i)
			// Each step is over an hour, so at most one previous timestamp stays in window.
			// (A first attempt advanced 200s per send; an hour legitimately holds ~18 of
			// those, so the assertion was wrong, not the pruning.)
			clock.advance(3_700_000)
		}
		const { released, historySize } = pacer.getStats()
		assert.equal(released, 40)
		assert.ok(historySize <= 2, `40 sends spread over days must not retain 40 timestamps, kept ${historySize}`)
	})

	it('old entries are pruned, so history does not grow forever', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0, perMinute: 0, perHour: 5 })
		await pacer.schedule(() => 1)
		clock.advance(3_600_001)
		await pacer.schedule(() => 2)
		assert.equal(pacer.getStats().inLastHour, 1, 'the hour-old entry is gone')
	})
})

describe('§2.222 ordering and failure handling', () => {
	it('releases strictly in call order even when scheduled as a burst', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 10 })
		const order = []
		await Promise.all([1, 2, 3, 4].map(n => pacer.schedule(() => order.push(n))))
		assert.deepEqual(order, [1, 2, 3, 4])
	})

	it('a rejected task does not wedge the queue', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0 })
		await assert.rejects(() => pacer.schedule(() => Promise.reject(new Error('boom'))), /boom/)
		assert.equal(await pacer.schedule(() => 'still works'), 'still works')
	})

	it('the error reaches the caller, not just the chain', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 0 })
		await assert.rejects(
			() =>
				pacer.schedule(() => {
					throw new Error('thrown synchronously')
				}),
			/thrown synchronously/
		)
	})

	it('refuses a full queue instead of buffering without limit', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 1000, maxQueue: 2 })
		const a = pacer.schedule(() => 1)
		const b = pacer.schedule(() => 2)
		await assert.rejects(() => pacer.schedule(() => 3), /queue is full/)
		await Promise.all([a, b])
		assert.equal(pacer.getStats().rejected, 1)
	})

	it('close() stops accepting new work', async () => {
		const pacer = createSendPacer({ minDelayMs: 0 })
		pacer.close()
		await assert.rejects(() => pacer.schedule(() => 1), /closed/)
	})
})

describe('§2.222 construction and stats', () => {
	it('rejects nonsensical options loudly', () => {
		for (const bad of [{ minDelayMs: -1 }, { jitterMs: NaN }, { perMinute: 'lots' }, { maxQueue: Infinity }]) {
			assert.throws(() => new SendPacer(bad), TypeError, `${JSON.stringify(bad)} must be rejected`)
		}
	})

	it('counts releases, waits and window occupancy', async () => {
		const clock = fakeClock()
		const pacer = pacerWith(clock, { minDelayMs: 100 })
		await pacer.schedule(() => 1)
		await pacer.schedule(() => 2)
		const stats = pacer.getStats()
		assert.equal(stats.released, 2)
		assert.equal(stats.inLastMinute, 2)
		assert.equal(stats.maxWaitMs, 100)
		assert.equal(stats.averageWaitMs, 50)
		assert.equal(stats.queued, 0)
	})

	it('makes no claim it cannot keep', async () => {
		const pacer = createSendPacer()
		const stats = pacer.getStats()
		for (const forbidden of ['banRisk', 'safe', 'protected', 'antiBan']) {
			assert.ok(!(forbidden in stats), `stats must not imply account safety (${forbidden})`)
		}
	})
})
