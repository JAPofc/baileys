export type SendPacerOptions = {
	/** Minimum gap between two releases. Default 1000. */
	minDelayMs?: number
	/** Random extra delay, 0..jitterMs. Default 500. */
	jitterMs?: number
	/** Cap per rolling minute. 0 disables. Default 20. */
	perMinute?: number
	/** Cap per rolling hour. 0 disables. Default 250. */
	perHour?: number
	/** Extra delay per character of message text, approximating typing. Default 0. */
	msPerCharacter?: number
	/** Refuse to buffer more than this many pending sends. Default 1000. */
	maxQueue?: number
	/** Injectable clock, for tests. */
	now?: () => number
	/** Injectable sleep, for tests. */
	sleep?: (ms: number) => Promise<void>
	/** Injectable randomness, for tests. */
	random?: () => number
}

export type SendPacerStats = {
	released: number
	rejected: number
	queued: number
	inLastMinute: number
	inLastHour: number
	/** Retained timestamps. Bounded by the rolling hour, not by total sends. */
	historySize: number
	totalWaitMs: number
	maxWaitMs: number
	averageWaitMs: number
}

/**
 * Spreads outbound sends over time. This is a queue with a clock — it makes no claim
 * about account safety or what WhatsApp will tolerate.
 */
export declare class SendPacer {
	constructor(options?: SendPacerOptions)
	/** How long the next send would wait right now, in ms. */
	delayFor(text?: string): number
	/** Run `fn` when pacing allows. Releases strictly in call order. */
	schedule<T>(fn: () => T | Promise<T>, options?: { text?: string }): Promise<T>
	getStats(): SendPacerStats
	/** Reject anything scheduled after this call. */
	close(): void
}

export declare const createSendPacer: (options?: SendPacerOptions) => SendPacer
