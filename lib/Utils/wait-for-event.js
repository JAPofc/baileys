/**
 * JAP@Add (v2.4.8) --- `waitForEvent`: await the next matching Baileys event.
 *
 * Bots hand-roll this constantly ("send the invite, then wait for the group to
 * actually exist") and the hand-rolled version almost always leaks: a listener
 * stays attached when the predicate never matches, or the timer keeps the
 * process alive. This resolves with the matching payload, rejects on timeout or
 * abort, and detaches the listener on every single exit path.
 *
 * Buffered events arrive consolidated, so `payload` is whatever the flush
 * produced -- an array for `groups.update`, an object for `messages.upsert`.
 * Pass `pick` to pull one item out of a batch.
 *
 * @template T
 * @param {{ on: Function, off: Function }} ev the socket's event emitter (`sock.ev`)
 * @param {string} event event name, e.g. `'groups.update'`
 * @param {object} [opts]
 * @param {(payload: any) => boolean} [opts.filter] keep waiting while this returns false
 * @param {(payload: any) => T | undefined} [opts.pick] map/extract the resolved value;
 *   returning `undefined` is treated as "not it yet" and the wait continues
 * @param {number} [opts.timeoutMs=30000] `0` or a negative value disables the timeout
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<T>}
 */
export function waitForEvent(ev, event, opts = {}) {
	const { filter, pick, timeoutMs = 30000, signal } = opts
	if (!ev || typeof ev.on !== 'function' || typeof ev.off !== 'function') {
		throw new TypeError('waitForEvent: first argument must be an event emitter')
	}

	if (typeof event !== 'string' || !event) {
		throw new TypeError('waitForEvent: event name must be a non-empty string')
	}

	return new Promise((resolve, reject) => {
		let timer
		let onAbort

		const cleanup = () => {
			ev.off(event, listener)
			if (timer) {
				clearTimeout(timer)
				timer = undefined
			}

			if (onAbort && signal) {
				signal.removeEventListener('abort', onAbort)
				onAbort = undefined
			}
		}

		const fail = err => {
			cleanup()
			reject(err)
		}

		function listener(payload) {
			let value
			try {
				if (filter && !filter(payload)) {
					return
				}

				value = pick ? pick(payload) : payload
			} catch (err) {
				fail(err)
				return
			}

			if (value === undefined) {
				return
			}

			cleanup()
			resolve(value)
		}

		if (signal) {
			if (signal.aborted) {
				reject(signal.reason ?? new Error(`waitForEvent("${event}") aborted`))
				return
			}

			onAbort = () => fail(signal.reason ?? new Error(`waitForEvent("${event}") aborted`))
			signal.addEventListener('abort', onAbort, { once: true })
		}

		ev.on(event, listener)

		if (timeoutMs > 0) {
			timer = setTimeout(() => fail(new Error(`waitForEvent("${event}") timed out after ${timeoutMs}ms`)), timeoutMs)
		}
	})
}
