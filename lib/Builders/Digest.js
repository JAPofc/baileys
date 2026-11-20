/**
 * Digest — collect many small events and post one summary instead of many messages.
 *
 * The thing every notification bot gets wrong: it announces each event as it happens. Seven
 * people join and leave in a minute and the group gets fourteen messages, so the admins mute
 * the bot, and then they miss the one notice that mattered. The fix is not "announce less",
 * it is "announce together".
 *
 * The parts that are easy to get wrong, and what this does:
 *
 *   - **bounded memory** — a buffer with no cap is a bot that dies on its busiest day.
 *     Past `maxEvents` the bodies are dropped but the *counts* keep going, so a flooded
 *     digest still reports the flood instead of lying or crashing.
 *   - **repeats collapse** — `dedupeKey` turns seven identical events into one line with
 *     `x7`, which is the whole reason a digest is readable.
 *   - **an empty window says nothing** — a daily digest that posts "nothing happened"
 *     every day at 9am is just slower spam.
 *   - **flush is atomic** — the buffer is swapped out *before* rendering, so events that
 *     arrive mid-flush land in the next window rather than being lost or counted twice.
 *   - **it survives a restart** — `toJSON()`/`restoreDigest()` keep the open window, because
 *     bots restart constantly and a digest that resets on deploy never fires at all.
 *   - **aligned windows** — `every: 'daily'` means a fixed time of day, not "24 hours after
 *     whenever this process happened to boot".
 *
 * The core is pure: no socket, no timers, no I/O. `startDigest()` binds it to a chat.
 *
 * @example
 * const digest = createDigest({
 *   every: 'hourly',
 *   title: 'Group activity',
 *   groupBy: e => e.type,
 *   dedupeKey: e => `${e.type}:${e.actor}`
 * })
 * digest.add({ type: 'join', actor: '62...@s.whatsapp.net', text: 'Budi joined' })
 * if (digest.due()) await sock.sendMessage(jid, { text: digest.flush().text })
 */
import { mintId } from '../Utils/provenance.js'

/** Named windows, in milliseconds. */
export const DIGEST_WINDOWS = Object.freeze({
	hourly: 3_600_000,
	daily: 86_400_000,
	weekly: 604_800_000
})

/** Default cap on buffered event bodies. Counts continue past it. */
export const DEFAULT_MAX_EVENTS = 500

/** Default cap on lines in a rendered digest, so one noisy group cannot post a wall. */
export const DEFAULT_MAX_LINES = 40

const nowMs = () => Date.now()

const resolveWindow = every => {
	if (typeof every === 'number' && every > 0) {
		return every
	}
	const named = DIGEST_WINDOWS[String(every || 'daily')]
	if (!named) {
		throw new RangeError(`createDigest: unknown window "${every}"`)
	}
	return named
}

/**
 * Align the first release to a sensible boundary.
 *
 * An hourly digest should land on the hour and a daily one at a chosen hour, not at
 * whatever minute the process started. Anything else and the digest time drifts every
 * deploy, which is how people stop trusting it.
 */
const alignedRelease = (startedAt, windowMs, options) => {
	if (options.releaseAt != null) {
		return Number(options.releaseAt)
	}
	if (!options.align) {
		return startedAt + windowMs
	}

	const date = new Date(startedAt)
	if (windowMs === DIGEST_WINDOWS.hourly) {
		date.setMinutes(0, 0, 0)
		return date.getTime() + windowMs
	}
	if (windowMs === DIGEST_WINDOWS.daily || windowMs === DIGEST_WINDOWS.weekly) {
		const hour = Number.isFinite(Number(options.atHour)) ? Number(options.atHour) : 9
		date.setHours(hour, 0, 0, 0)
		let next = date.getTime()
		while (next <= startedAt) {
			next += windowMs
		}
		return next
	}
	return startedAt + windowMs
}

/**
 * Create a digest buffer.
 *
 * @param {{
 *   every?: 'hourly'|'daily'|'weekly'|number,
 *   title?: string,
 *   maxEvents?: number,
 *   maxLines?: number,
 *   groupBy?: (event: any) => string,
 *   dedupeKey?: (event: any) => string,
 *   format?: (event: any) => string,
 *   render?: (summary: any) => string,
 *   quietIfEmpty?: boolean,
 *   align?: boolean,
 *   atHour?: number,
 *   releaseAt?: number,
 *   id?: string,
 *   now?: () => number
 * }} [options]
 */
export function createDigest(options = {}) {
	const {
		title = 'Digest',
		groupBy,
		dedupeKey,
		format,
		render,
		quietIfEmpty = true,
		now = nowMs
	} = options

	const windowMs = resolveWindow(options.every)
	const maxEvents = Math.max(1, Math.floor(Number(options.maxEvents) || DEFAULT_MAX_EVENTS))
	const maxLines = Math.max(1, Math.floor(Number(options.maxLines) || DEFAULT_MAX_LINES))
	const id = options.id || mintId('DGST')

	let openedAt = now()
	let releaseAt = alignedRelease(openedAt, windowMs, options)
	let entries = new Map() // dedupe key -> { event, count, firstAt, lastAt }
	let total = 0
	let dropped = 0
	let releases = 0

	const keyOf = event => {
		if (typeof dedupeKey === 'function') {
			try {
				return String(dedupeKey(event))
			} catch {
				// a throwing key function must not lose the event
			}
		}
		return `#${total}`
	}

	const groupOf = event => {
		if (typeof groupBy !== 'function') {
			return ''
		}
		try {
			return String(groupBy(event) ?? '')
		} catch {
			return ''
		}
	}

	const lineOf = entry => {
		let text
		if (typeof format === 'function') {
			try {
				text = format(entry.event)
			} catch {
				text = undefined
			}
		}
		if (text == null) {
			text = typeof entry.event === 'string'
				? entry.event
				: entry.event?.text ?? entry.event?.message ?? JSON.stringify(entry.event)
		}
		return entry.count > 1 ? `${text} x${entry.count}` : String(text)
	}

	const buildSummary = (at, snapshot = { entries, total, dropped, openedAt }) => {
		const groups = new Map()
		for (const entry of snapshot.entries.values()) {
			const group = groupOf(entry.event)
			if (!groups.has(group)) {
				groups.set(group, [])
			}
			groups.get(group).push(entry)
		}

		return {
			id,
			title,
			openedAt: snapshot.openedAt,
			closedAt: at,
			windowMs,
			/** Every event counted, including ones whose body was dropped. */
			total: snapshot.total,
			/** Distinct lines after de-duplication. */
			unique: snapshot.entries.size,
			/** Event bodies discarded because the buffer was full. */
			dropped: snapshot.dropped,
			groups: [...groups].map(([name, items]) => ({
				name,
				count: items.reduce((sum, e) => sum + e.count, 0),
				lines: items.map(lineOf)
			}))
		}
	}

	const digest = {
		id,
		title,
		windowMs,
		get openedAt() {
			return openedAt
		},
		get releaseAt() {
			return releaseAt
		},
		/** Events counted this window, including dropped bodies. */
		get size() {
			return total
		},
		get unique() {
			return entries.size
		},
		get dropped() {
			return dropped
		},
		get releases() {
			return releases
		},
		get empty() {
			return total === 0
		},

		/**
		 * Buffer one event.
		 *
		 * @returns {{accepted: boolean, reason: 'counted'|'merged'|'dropped', total: number}}
		 */
		add(event) {
			if (event == null) {
				return { accepted: false, reason: 'dropped', total }
			}

			const at = now()
			const key = keyOf(event)
			const existing = entries.get(key)

			if (existing) {
				existing.count++
				existing.lastAt = at
				total++
				return { accepted: true, reason: 'merged', total }
			}

			if (entries.size >= maxEvents) {
				// the flood still gets counted; only the body is lost
				dropped++
				total++
				return { accepted: false, reason: 'dropped', total }
			}

			entries.set(key, { event, count: 1, firstAt: at, lastAt: at })
			total++
			return { accepted: true, reason: 'counted', total }
		},

		/** Is the window over? */
		due(at = now()) {
			return at >= releaseAt
		},

		/** Current contents without closing the window. */
		peek(at = now()) {
			return buildSummary(at)
		},

		/**
		 * Close the window and hand back the summary.
		 *
		 * The buffer is swapped before anything is rendered, so an event arriving while the
		 * caller is still sending lands in the next window instead of vanishing.
		 *
		 * @returns {{text: string|undefined, summary: object, released: boolean}}
		 */
		flush(at = now()) {
			// snapshot first, reopen immediately: anything arriving during the caller's send
			// belongs to the next window, and cannot be lost or counted twice
			const snapshot = { entries, total, dropped, openedAt }

			entries = new Map()
			total = 0
			dropped = 0
			openedAt = at
			while (releaseAt <= at) {
				releaseAt += windowMs
			}

			const summary = buildSummary(at, snapshot)

			if (quietIfEmpty && summary.total === 0) {
				return { text: undefined, summary, released: false }
			}

			releases++
			const text = typeof render === 'function'
				? render(summary)
				: renderDigest(summary, { maxLines })

			return { text, summary, released: true }
		},

		/** Drop everything in the open window without releasing it. */
		reset(at = now()) {
			entries = new Map()
			total = 0
			dropped = 0
			openedAt = at
			return digest
		},

		/** Serialisable state, so a restart does not lose the open window. */
		toJSON() {
			return {
				id,
				openedAt,
				releaseAt,
				total,
				dropped,
				releases,
				entries: [...entries].map(([key, e]) => [key, {
					event: e.event, count: e.count, firstAt: e.firstAt, lastAt: e.lastAt
				}])
			}
		},

		/** Load state produced by `toJSON()`. Unknown or broken state is ignored. */
		load(state) {
			if (!state || typeof state !== 'object') {
				return digest
			}
			if (Array.isArray(state.entries)) {
				entries = new Map(state.entries.filter(pair => Array.isArray(pair) && pair.length === 2))
			}
			if (Number.isFinite(state.openedAt)) {
				openedAt = state.openedAt
			}
			if (Number.isFinite(state.releaseAt)) {
				releaseAt = state.releaseAt
			}
			if (Number.isFinite(state.total)) {
				total = state.total
			}
			if (Number.isFinite(state.dropped)) {
				dropped = state.dropped
			}
			if (Number.isFinite(state.releases)) {
				releases = state.releases
			}
			return digest
		}
	}

	return digest
}

/** Rebuild a digest from `toJSON()` state. */
export function restoreDigest(state, options = {}) {
	return createDigest({ ...options, id: state?.id || options.id }).load(state)
}

/**
 * Default digest layout: a header, then grouped lines, then the overflow note.
 *
 * The overflow note is not optional. A digest that silently truncates is a digest that
 * tells you the quiet lie that nothing else happened.
 */
export function renderDigest(summary, options = {}) {
	const maxLines = Math.max(1, Math.floor(Number(options.maxLines) || DEFAULT_MAX_LINES))
	const lines = [`*${summary.title}*`]

	const minutes = Math.round((summary.closedAt - summary.openedAt) / 60000)
	lines.push(`${summary.total} event${summary.total === 1 ? '' : 's'} in the last ${minutes} min`)
	lines.push('')

	let budget = maxLines
	let hidden = 0

	for (const group of summary.groups) {
		if (group.name) {
			lines.push(`*${group.name}* (${group.count})`)
		}
		for (const line of group.lines) {
			if (budget > 0) {
				lines.push(`• ${line}`)
				budget--
			} else {
				hidden++
			}
		}
		lines.push('')
	}

	if (hidden) {
		lines.push(`… and ${hidden} more line${hidden === 1 ? '' : 's'}`)
	}
	if (summary.dropped) {
		lines.push(`(${summary.dropped} event${summary.dropped === 1 ? '' : 's'} beyond the buffer limit were counted but not listed)`)
	}

	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Bind a digest to a chat.
 *
 * Releases are driven by `tick()` — call it from your own scheduler — or by an internal
 * timer when `autoTickMs` is set. The timer is `unref`'d and cleared by `stop()`, so it can
 * neither hold the process open nor outlive the digest.
 *
 * @param {{sendMessage: Function}} sock
 * @param {string} jid
 * @param {object} [options] — everything `createDigest` takes, plus `autoTickMs`, `onError`
 */
export function startDigest(sock, jid, options = {}) {
	if (typeof sock?.sendMessage !== 'function') {
		throw new TypeError('startDigest: a socket with sendMessage() is required')
	}
	if (typeof jid !== 'string' || !jid) {
		throw new TypeError('startDigest: jid is required')
	}

	const { autoTickMs, onError, timers = { setTimeout, clearTimeout }, ...digestOptions } = options
	const digest = createDigest(digestOptions)
	let timer
	let stopped = false
	let releasing = false

	const publish = async () => {
		// one release at a time: a slow send must not overlap the next tick
		if (releasing) {
			return false
		}
		releasing = true
		try {
			const { text, released } = digest.flush()
			if (!released || !text) {
				return false
			}
			await sock.sendMessage(jid, { text })
			return true
		} catch (error) {
			try {
				onError?.(error instanceof Error ? error : new Error(String(error)))
			} catch {
				// a throwing handler must not take the scheduler with it
			}
			return false
		} finally {
			releasing = false
		}
	}

	const arm = () => {
		if (stopped || !autoTickMs) {
			return
		}
		timer = timers.setTimeout(() => {
			timer = undefined
			void (async () => {
				if (digest.due()) {
					await publish()
				}
				arm()
			})()
		}, autoTickMs)
		timer?.unref?.()
	}

	arm()

	return {
		digest,
		add: event => digest.add(event),
		/** Release if the window is over. Returns whether a message was sent. */
		async tick() {
			return digest.due() ? publish() : false
		},
		/** Release right now, window or not. */
		async release() {
			return publish()
		},
		stop() {
			stopped = true
			if (timer) {
				timers.clearTimeout(timer)
				timer = undefined
			}
			return digest.toJSON()
		}
	}
}
