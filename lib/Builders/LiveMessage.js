/**
 * LiveMessage — one WhatsApp message that keeps itself up to date.
 *
 * A bot that reports progress usually does it the loud way: a new message per step, and a
 * chat full of "downloading... 10%... 20%...". The alternative is to edit one message in
 * place, which looks far better and is how every serious bot *wants* to behave — but doing
 * it by hand is a trap. Each edit is a real send: update in a tight loop and you spam the
 * server, burn rate limit and risk the account. You also have to remember to stop, which
 * nobody does on the error path, so a timer survives the crash and keeps editing a message
 * whose task is long dead.
 *
 * This builder owns that problem. You describe the message as a function of state and push
 * state at it as fast as you like; it decides what actually gets sent:
 *
 *   - **coalescing** — many updates inside one throttle window become a single edit
 *   - **no-op suppression** — if the render is byte-identical to what is on screen, nothing
 *     is sent at all (the common case for a percentage that has not moved)
 *   - **a hard edit budget** — `maxEdits` caps the total, so no loop can run away
 *   - **no overlapping sends** — an update during an in-flight edit is remembered, not raced
 *   - **it always stops** — `finish()`, `stop()`, `ttlMs` and the budget all clear the timer,
 *     and the timer is unref'd so it can never hold a process open
 *
 * Errors never escape asynchronously: a failed edit or a throwing `render` goes to
 * `onError` and is counted. A background timer that throws into nothing is how a bot dies
 * at 3am, so this one cannot.
 *
 * @example
 * const live = createLiveMessage(sock, jid, {
 *   state: { done: 0, total: files.length },
 *   render: s => `*Uploading*\n${progressBar(s.done, s.total)}\n${s.done}/${s.total} files`
 * })
 * await live.start()
 * for (const file of files) {
 *   await upload(file)
 *   live.set({ done: live.state.done + 1 })   // cheap; most of these never send
 * }
 * await live.finish({ label: 'Done' })
 */
import { formatDuration, progressBar } from '../Utils/text-extras.js'
import { BUILD_TAG, mintId } from '../Utils/provenance.js'

/** Minimum gap between edits. Below ~1s you are just generating rate-limit pressure. */
export const MIN_THROTTLE_MS = 1000

/** Default gap between edits. */
export const DEFAULT_THROTTLE_MS = 3000

/** Default cap on how many edits one live message may ever make. */
export const DEFAULT_MAX_EDITS = 60

/** Consecutive send failures after which the message gives up and stops editing. */
export const MAX_CONSECUTIVE_ERRORS = 3

const now = () => Date.now()

/**
 * Create a live message bound to a socket and a chat.
 *
 * @param {{ sendMessage: Function }} sock
 * @param {string} jid
 * @param {{
 *   render: (state: any) => (string | object),
 *   state?: object,
 *   throttleMs?: number,
 *   maxEdits?: number,
 *   ttlMs?: number,
 *   quoted?: any,
 *   onError?: (error: Error, phase: string) => void,
 *   timers?: { setTimeout: Function, clearTimeout: Function }
 * }} options
 */
export function createLiveMessage(sock, jid, options = {}) {
	if (typeof sock?.sendMessage !== 'function') {
		throw new TypeError('createLiveMessage: a socket with sendMessage() is required')
	}
	if (typeof jid !== 'string' || !jid) {
		throw new TypeError('createLiveMessage: jid is required')
	}
	if (typeof options.render !== 'function') {
		throw new TypeError('createLiveMessage: options.render must be a function')
	}

	const render = options.render
	const quoted = options.quoted
	const onError = typeof options.onError === 'function' ? options.onError : undefined
	const timers = options.timers || { setTimeout, clearTimeout }
	// a throttle below the floor is a mistake, not a preference
	const throttleMs = Math.max(MIN_THROTTLE_MS, Number(options.throttleMs) || DEFAULT_THROTTLE_MS)
	const maxEdits = Number.isFinite(Number(options.maxEdits))
		? Math.max(0, Math.floor(Number(options.maxEdits)))
		: DEFAULT_MAX_EDITS
	const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : undefined

	let state = { ...(options.state || {}) }
	let key
	let lastText
	let lastEditAt = 0
	let timer
	let ttlTimer
	let sending = false
	let dirty = false
	let status = 'idle' // idle | live | finished | stopped | exhausted | failed
	let consecutiveErrors = 0

	const stats = { edits: 0, skipped: 0, coalesced: 0, errors: 0 }

	// correlation id for logs. It carries BUILD_TAG, so a fork's own log files quote this
	// project's attribution back at it (see docs/provenance.md). It is never written into
	// the message body: marking somebody else's chat content is not ours to do.
	const id = options.id || mintId('LVM')

	const report = (error, phase) => {
		stats.errors++
		try {
			onError?.(error instanceof Error ? error : new Error(String(error)), phase, id)
		} catch {
			// an onError that throws must not take the bot with it
		}
	}

	const clearTimer = () => {
		if (timer) {
			timers.clearTimeout(timer)
			timer = undefined
		}
	}

	const clearTtl = () => {
		if (ttlTimer) {
			timers.clearTimeout(ttlTimer)
			ttlTimer = undefined
		}
	}

	/** Run the user's render function. A throw here is reported, never propagated. */
	const safeRender = () => {
		try {
			const out = render(state)
			if (out == null) {
				return undefined
			}
			return typeof out === 'string' ? { text: out } : out
		} catch (error) {
			report(error, 'render')
			return undefined
		}
	}

	const contentKey = content => (typeof content?.text === 'string' ? content.text : JSON.stringify(content))

	/**
	 * Actually edit, honouring the budget and the no-op check. Resolves to true if sent.
	 * `force` is used only by the final frame, which is worth one edit past the budget.
	 */
	const commit = async (force = false) => {
		if (!key || (status !== 'live' && !force)) {
			return false
		}
		if (stats.edits >= maxEdits && !force) {
			status = 'exhausted'
			clearTimer()
			clearTtl()
			return false
		}

		const content = safeRender()
		if (!content) {
			return false
		}

		const signature = contentKey(content)
		if (signature === lastText) {
			// the screen already says this; sending it again costs a message and changes nothing
			stats.skipped++
			return false
		}

		sending = true
		try {
			await sock.sendMessage(jid, { ...content, edit: key })
			lastText = signature
			lastEditAt = now()
			stats.edits++
			consecutiveErrors = 0
			return true
		} catch (error) {
			report(error, 'edit')
			consecutiveErrors++
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				status = 'failed'
				clearTimer()
				clearTtl()
			}
			return false
		} finally {
			sending = false
			if (dirty && status === 'live') {
				dirty = false
				schedule()
			}
		}
	}

	/** Ask for an edit soon. Many calls inside one window collapse into one send. */
	const schedule = () => {
		if (status !== 'live') {
			return
		}
		if (sending) {
			// an edit is already on the wire; remember that the state moved again
			dirty = true
			stats.coalesced++
			return
		}
		if (timer) {
			// already waiting for this window to close
			stats.coalesced++
			return
		}

		const wait = Math.max(0, throttleMs - (now() - lastEditAt))
		timer = timers.setTimeout(() => {
			timer = undefined
			void commit()
		}, wait)
		timer?.unref?.()
	}

	const live = {
		/** Correlation id for logs: `LVM-<BUILD_TAG>-<random>`. Not sent to the chat. */
		id,
		/** The attribution tag embedded in `id`. */
		buildTag: BUILD_TAG,
		/** The message key, once started. */
		get key() {
			return key
		},
		/** Current state object (a copy; mutate through set/update). */
		get state() {
			return { ...state }
		},
		/** idle | live | finished | stopped | exhausted | failed */
		get status() {
			return status
		},
		/** True while updates are still accepted. */
		get active() {
			return status === 'live'
		},
		/** Counters: edits actually sent, no-ops skipped, updates coalesced, errors seen. */
		get stats() {
			return { ...stats }
		},
		/** Remaining edit budget. */
		get remainingEdits() {
			return Math.max(0, maxEdits - stats.edits)
		},

		/**
		 * Send the first message. Unlike every later send, a failure here throws: if the
		 * message never appeared, the caller's whole plan is wrong and silence would hide it.
		 */
		async start(initialState) {
			if (status !== 'idle') {
				throw new Error(`createLiveMessage: already started (status: ${status})`)
			}
			if (initialState) {
				state = { ...state, ...initialState }
			}

			const content = safeRender()
			if (!content) {
				throw new Error('createLiveMessage: render() produced nothing for the initial message')
			}

			const sent = await sock.sendMessage(jid, content, quoted ? { quoted } : undefined)
			key = sent?.key
			if (!key) {
				throw new Error('createLiveMessage: sendMessage returned no message key')
			}

			lastText = contentKey(content)
			lastEditAt = now()
			status = 'live'

			if (ttlMs) {
				ttlTimer = timers.setTimeout(() => {
					ttlTimer = undefined
					void live.finish()
				}, ttlMs)
				ttlTimer?.unref?.()
			}

			return sent
		},

		/** Merge a patch into the state and schedule an edit. Cheap; call it freely. */
		set(patch) {
			if (status !== 'live') {
				return false
			}
			state = { ...state, ...(patch || {}) }
			schedule()
			return true
		},

		/** Same as `set`, but computed from the current state. */
		update(fn) {
			if (status !== 'live') {
				return false
			}
			if (typeof fn !== 'function') {
				throw new TypeError('live.update: expected a function')
			}
			try {
				return live.set(fn({ ...state }))
			} catch (error) {
				report(error, 'update')
				return false
			}
		},

		/** Edit right now, ignoring the throttle. Still honours the no-op check and budget. */
		async flush(patch) {
			if (status !== 'live') {
				return false
			}
			if (patch) {
				state = { ...state, ...patch }
			}
			clearTimer()
			return commit()
		},

		/**
		 * Render one last time and stop accepting updates. Safe to call twice, safe to call
		 * from a `finally` — it never throws.
		 */
		async finish(patch) {
			if (status === 'idle') {
				status = 'finished'
				return false
			}
			if (status !== 'live' && status !== 'exhausted') {
				return false
			}
			if (patch) {
				state = { ...state, ...patch }
			}
			clearTimer()
			clearTtl()
			const sent = await commit(true)
			status = 'finished'
			return sent
		},

		/** Stop immediately without a final edit. The message stays as it last rendered. */
		stop() {
			clearTimer()
			clearTtl()
			dirty = false
			if (status === 'live' || status === 'idle') {
				status = 'stopped'
			}
			return status
		}
	}

	return live
}

/**
 * A ready-made renderer for the most common live message: a task with a progress bar.
 *
 * Returns a `render` function, so it drops straight into `createLiveMessage`. Elapsed time
 * and ETA are derived from `startedAt`; ETA is only shown once there is enough progress for
 * the estimate to mean anything, because a wrong ETA is worse than none.
 *
 * @param {{ title?: string, barSize?: number, showEta?: boolean, footer?: string }} [options]
 */
export function progressRenderer(options = {}) {
	const { title = 'Working', barSize = 12, showEta = true, footer } = options

	return state => {
		const done = Number(state?.done) || 0
		const total = Number(state?.total) || 0
		const label = state?.label || title
		const lines = [`*${label}*`, progressBar(done, total || 1, { size: barSize })]

		if (total > 0) {
			lines.push(`${done}/${total}`)
		}

		const startedAt = Number(state?.startedAt)
		if (startedAt > 0) {
			const elapsed = Math.max(0, now() - startedAt)
			let line = `elapsed ${formatDuration(elapsed)}`
			// below 5% the extrapolation is noise; saying nothing beats saying "4h left"
			if (showEta && total > 0 && done > 0 && done < total && done / total >= 0.05) {
				line += ` · eta ${formatDuration((elapsed / done) * (total - done))}`
			}
			lines.push(line)
		}

		if (state?.note) {
			lines.push('', String(state.note))
		}
		if (footer) {
			lines.push('', footer)
		}

		return lines.join('\n')
	}
}

/**
 * Shorthand for the pattern above: start a progress message and get it back already live.
 *
 * @param {{ sendMessage: Function }} sock
 * @param {string} jid
 * @param {{ total?: number, title?: string, label?: string } & Record<string, any>} [options]
 */
export async function startProgressMessage(sock, jid, options = {}) {
	const { total = 0, title, barSize, showEta, footer, ...rest } = options
	const live = createLiveMessage(sock, jid, {
		...rest,
		state: { done: 0, total, startedAt: now(), ...(rest.state || {}) },
		render: progressRenderer({ title, barSize, showEta, footer })
	})
	await live.start()
	return live
}
