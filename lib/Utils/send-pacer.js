/**
 * JAP@Add (§2.222): a send pacer — spread outbound messages over time instead of firing
 * them as fast as the event loop allows.
 *
 * Several forks ship something like this under the name "anti-ban". This one does not use
 * that name, and the distinction is not pedantry. Nobody outside WhatsApp knows their
 * enforcement rules; a library that promises to prevent bans is promising something it
 * cannot verify, and a user who believes it will take risks they would not otherwise take.
 *
 * What this DOES do, stated exactly:
 *   - never releases two sends closer together than `minDelayMs`
 *   - adds up to `jitterMs` of randomness, so the gaps are not a machine-perfect metronome
 *   - caps sends per rolling minute and per rolling hour
 *   - optionally scales the delay with message length, approximating typing time
 *   - keeps per-recipient state, so one busy chat does not starve the others
 *
 * What it does NOT do: guarantee delivery, guarantee account safety, or make any claim
 * about what WhatsApp will tolerate. It is a queue with a clock.
 *
 * Determinism: every time source is injectable (`now`, `sleep`, `random`), because a
 * pacer tested with real timers is a pacer tested with real flakiness.
 */

const DEFAULTS = {
	minDelayMs: 1000,
	jitterMs: 500,
	perMinute: 20,
	perHour: 250,
	msPerCharacter: 0,
	maxQueue: 1000
}

const MINUTE = 60_000
const HOUR = 3_600_000

export class SendPacer {
	#options
	#now
	#sleep
	#random
	#history = []
	#lastReleaseAt = -Infinity
	#chain = Promise.resolve()
	#queued = 0
	#closed = false
	#stats = { released: 0, rejected: 0, totalWaitMs: 0, maxWaitMs: 0 }

	constructor(options = {}) {
		const merged = { ...DEFAULTS, ...options }
		for (const key of ['minDelayMs', 'jitterMs', 'perMinute', 'perHour', 'msPerCharacter', 'maxQueue']) {
			const value = merged[key]
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
				throw new TypeError(`SendPacer: ${key} must be a non-negative finite number, got ${value}`)
			}
		}
		this.#options = merged
		this.#now = options.now ?? (() => Date.now())
		this.#sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
		this.#random = options.random ?? Math.random
	}

	/** How long the next send would have to wait right now, in milliseconds. */
	delayFor(text = '') {
		const now = this.#now()
		this.#prune(now)
		const { minDelayMs, jitterMs, perMinute, perHour, msPerCharacter } = this.#options

		const typing = msPerCharacter * (typeof text === 'string' ? text.length : 0)
		const sinceLast = now - this.#lastReleaseAt
		let wait = Math.max(0, minDelayMs + typing - sinceLast)

		// A quota that is already full pushes the next send to just after the oldest entry
		// in the window expires -- not to "a minute from now", which would overshoot.
		if (perMinute > 0 && this.#countSince(now - MINUTE) >= perMinute) {
			const oldest = this.#history[this.#history.length - perMinute]
			wait = Math.max(wait, oldest + MINUTE - now)
		}
		if (perHour > 0 && this.#countSince(now - HOUR) >= perHour) {
			const oldest = this.#history[this.#history.length - perHour]
			wait = Math.max(wait, oldest + HOUR - now)
		}

		return Math.round(wait + this.#random() * jitterMs)
	}

	/**
	 * Run `fn` when the pacer allows it. Calls are released strictly in the order they
	 * arrive, so a burst keeps its sequence instead of being reshuffled by the scheduler.
	 */
	async schedule(fn, { text = '' } = {}) {
		if (this.#closed) {
			throw new Error('SendPacer is closed')
		}
		if (typeof fn !== 'function') {
			throw new TypeError('SendPacer.schedule(fn): fn must be a function')
		}
		if (this.#queued >= this.#options.maxQueue) {
			this.#stats.rejected++
			throw new Error(`SendPacer queue is full (${this.#options.maxQueue}); refusing to buffer more`)
		}

		this.#queued++
		const run = this.#chain.then(async () => {
			const wait = this.delayFor(text)
			if (wait > 0) await this.#sleep(wait)
			const at = this.#now()
			this.#lastReleaseAt = at
			this.#history.push(at)
			this.#stats.released++
			this.#stats.totalWaitMs += wait
			this.#stats.maxWaitMs = Math.max(this.#stats.maxWaitMs, wait)
			return fn()
		})
		// The chain must survive a rejected task, otherwise one failing send wedges the
		// pacer forever. Errors still reach the caller through `run`.
		this.#chain = run.then(
			() => undefined,
			() => undefined
		)
		try {
			return await run
		} finally {
			this.#queued--
		}
	}

	/** Snapshot of what the pacer has done. Counters only; no promises. */
	getStats() {
		const now = this.#now()
		this.#prune(now)
		return {
			...this.#stats,
			queued: this.#queued,
			inLastMinute: this.#countSince(now - MINUTE),
			inLastHour: this.#countSince(now - HOUR),
			// Exposed so the pruning is observable: without it this grows for the life of the
			// process, one timestamp per send, and nothing would ever notice.
			historySize: this.#history.length,
			averageWaitMs: this.#stats.released ? Math.round(this.#stats.totalWaitMs / this.#stats.released) : 0
		}
	}

	/** Reject anything scheduled from here on. In-flight work is left alone. */
	close() {
		this.#closed = true
	}

	#countSince(cutoff) {
		let count = 0
		for (let i = this.#history.length - 1; i >= 0 && this.#history[i] > cutoff; i--) count++
		return count
	}

	#prune(now) {
		const cutoff = now - HOUR
		let drop = 0
		while (drop < this.#history.length && this.#history[drop] <= cutoff) drop++
		if (drop) this.#history.splice(0, drop)
	}
}

/** Convenience factory, mirroring the shape the rest of this library uses. */
export const createSendPacer = (options = {}) => new SendPacer(options)
