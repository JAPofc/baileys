export const DIGEST_WINDOWS: Readonly<{ hourly: number; daily: number; weekly: number }>
export const DEFAULT_MAX_EVENTS: number
export const DEFAULT_MAX_LINES: number

export type DigestWindow = 'hourly' | 'daily' | 'weekly' | number

export type DigestSummary = {
	id: string
	title: string
	openedAt: number
	closedAt: number
	windowMs: number
	/** Every event counted, including those whose body was dropped. */
	total: number
	/** Distinct lines after de-duplication. */
	unique: number
	/** Event bodies discarded because the buffer was full. */
	dropped: number
	groups: Array<{ name: string; count: number; lines: string[] }>
}

export type DigestAddResult = {
	accepted: boolean
	reason: 'counted' | 'merged' | 'dropped'
	total: number
}

export type DigestFlushResult = {
	/** Undefined when nothing was released. */
	text?: string
	summary: DigestSummary
	released: boolean
}

export type DigestState = {
	id: string
	openedAt: number
	releaseAt: number
	total: number
	dropped: number
	releases: number
	entries: Array<[string, { event: any; count: number; firstAt: number; lastAt: number }]>
}

export type DigestOptions = {
	/** Named window or an interval in ms. Default `'daily'`. */
	every?: DigestWindow
	title?: string
	/** Cap on buffered event bodies. Counts continue past it. Default 500. */
	maxEvents?: number
	/** Cap on rendered lines. Default 40. Overflow is reported, never hidden. */
	maxLines?: number
	/** Section an event belongs to. */
	groupBy?: (event: any) => string
	/** Events sharing a key collapse into one line with a count. */
	dedupeKey?: (event: any) => string
	/** Turn one event into its line. */
	format?: (event: any) => string
	/** Replace the whole layout. */
	render?: (summary: DigestSummary) => string
	/** Suppress a digest with no events. Default true. */
	quietIfEmpty?: boolean
	/** Align the first release to the hour, or to `atHour` for daily/weekly. */
	align?: boolean
	atHour?: number
	releaseAt?: number
	id?: string
	now?: () => number
}

export type Digest = {
	readonly id: string
	readonly title: string
	readonly windowMs: number
	readonly openedAt: number
	readonly releaseAt: number
	readonly size: number
	readonly unique: number
	readonly dropped: number
	readonly releases: number
	readonly empty: boolean
	add(event: any): DigestAddResult
	due(at?: number): boolean
	peek(at?: number): DigestSummary
	/** Close the window and return the summary. Reopens before rendering. */
	flush(at?: number): DigestFlushResult
	reset(at?: number): Digest
	toJSON(): DigestState
	load(state: DigestState | null | undefined): Digest
}

/** Collect many small events and release one summary per window. Pure: no I/O. */
export function createDigest(options?: DigestOptions): Digest

/** Rebuild a digest from `toJSON()` state, so a restart does not lose the open window. */
export function restoreDigest(state: DigestState | null | undefined, options?: DigestOptions): Digest

/** Default layout: header, grouped lines, and an explicit overflow note. */
export function renderDigest(summary: DigestSummary, options?: { maxLines?: number }): string

/** Bind a digest to a chat. Releases on `tick()`, or on an internal unref'd timer. */
export function startDigest(
	sock: { sendMessage: Function },
	jid: string,
	options?: DigestOptions & {
		autoTickMs?: number
		onError?: (error: Error) => void
		timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
	}
): {
	digest: Digest
	add(event: any): DigestAddResult
	tick(): Promise<boolean>
	release(): Promise<boolean>
	stop(): DigestState
}
