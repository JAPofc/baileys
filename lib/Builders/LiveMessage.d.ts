export const MIN_THROTTLE_MS: number
export const DEFAULT_THROTTLE_MS: number
export const DEFAULT_MAX_EDITS: number
export const MAX_CONSECUTIVE_ERRORS: number

export type LiveMessageStatus = 'idle' | 'live' | 'finished' | 'stopped' | 'exhausted' | 'failed'

export type LiveMessageStats = {
	/** Edits actually sent. */
	edits: number
	/** Renders suppressed because the output was identical to what is on screen. */
	skipped: number
	/** Updates folded into a pending edit instead of sending their own. */
	coalesced: number
	/** Render/send/callback errors reported to `onError`. */
	errors: number
}

export type LiveMessageOptions<S = any> = {
	/** Produce the message body from state. Return a string or a full message content object. */
	render: (state: S) => string | object | undefined | null
	/** Initial state. */
	state?: S
	/** Minimum gap between edits, clamped to at least `MIN_THROTTLE_MS`. Default 3000. */
	throttleMs?: number
	/** Hard cap on edits. Default 60. The final `finish()` frame is allowed past it. */
	maxEdits?: number
	/** Auto-`finish()` after this long. */
	ttlMs?: number
	/** Quote this message when sending the first one. */
	quoted?: any
	/** Called for render errors, failed edits and throwing callbacks. Never rethrown. */
	onError?: (error: Error, phase: 'render' | 'edit' | 'update', id: string) => void
	/** Override the generated correlation id. */
	id?: string
	/** Injectable timers, for tests. */
	timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
}

export type LiveMessage<S = any> = {
	/** Correlation id for logs: `LVM-<BUILD_TAG>-<random>`. Never sent to the chat. */
	readonly id: string
	/** The attribution tag embedded in `id`. */
	readonly buildTag: string
	readonly key: any
	readonly state: S
	readonly status: LiveMessageStatus
	readonly active: boolean
	readonly stats: LiveMessageStats
	readonly remainingEdits: number
	/** Send the first message. Throws if that send fails. */
	start(initialState?: Partial<S>): Promise<any>
	/** Merge a patch into state and schedule an edit. Returns false once inactive. */
	set(patch: Partial<S>): boolean
	/** Merge a patch computed from current state. */
	update(fn: (state: S) => Partial<S>): boolean
	/** Edit now, ignoring the throttle. Still skips no-ops and honours the budget. */
	flush(patch?: Partial<S>): Promise<boolean>
	/** Final render, then stop. Idempotent and never throws. */
	finish(patch?: Partial<S>): Promise<boolean>
	/** Stop without a final edit. */
	stop(): LiveMessageStatus
}

/**
 * One WhatsApp message that keeps itself up to date: updates are coalesced into throttled
 * edits, identical renders are never sent, the edit budget is capped and the timer always
 * gets cleared.
 */
export function createLiveMessage<S = any>(
	sock: { sendMessage: Function },
	jid: string,
	options: LiveMessageOptions<S>
): LiveMessage<S>

export type ProgressState = {
	done?: number
	total?: number
	label?: string
	note?: string
	startedAt?: number
}

/** Ready-made renderer: title, progress bar, counts, elapsed and (once meaningful) an ETA. */
export function progressRenderer(options?: {
	title?: string
	barSize?: number
	showEta?: boolean
	footer?: string
}): (state: ProgressState) => string

/** Create and start a progress live message in one call. */
export function startProgressMessage(
	sock: { sendMessage: Function },
	jid: string,
	options?: {
		total?: number
		title?: string
		barSize?: number
		showEta?: boolean
		footer?: string
	} & Omit<LiveMessageOptions<ProgressState>, 'render'>
): Promise<LiveMessage<ProgressState>>
