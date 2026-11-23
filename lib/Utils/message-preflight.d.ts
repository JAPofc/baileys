/** Severity of a single preflight finding. */
export type PreflightSeverity = 'error' | 'warning'

/** One thing preflight noticed about a message payload. */
export type PreflightFinding = {
	severity: PreflightSeverity
	/** Stable machine-readable identifier, e.g. `poll-option-count`. */
	code: string
	message: string
	/** Present when there is a concrete suggested fix. */
	hint?: string
}

export type PreflightResult = {
	/** True when no `error`-severity finding was produced. Warnings do not clear it. */
	ok: boolean
	/** `dm` | `group` | `newsletter` | `status` | `unknown`. */
	recipient: string
	findings: PreflightFinding[]
	errors: PreflightFinding[]
	warnings: PreflightFinding[]
	/**
	 * What was actually inspected. A clean result means "nothing locally detectable is
	 * wrong" -- never "WhatsApp will deliver this".
	 */
	checked: string[]
}

export declare const PREFLIGHT_LIMITS: {
	pollOptionsMin: number
	pollOptionsMax: number
	pollNameMax: number
	pollOptionMax: number
	buttonsMax: number
	listSectionsMax: number
	listRowsPerSectionMax: number
	stickerPackMax: number
	stickerBytesMax: number
	captionMax: number
	textMax: number
	albumMin: number
	albumMax: number
	mentionsMax: number
}

/**
 * Check a `sendMessage` payload without sending it. Never throws, whatever it is given.
 */
export declare const preflightMessage: (content: any, options?: { jid?: string }) => PreflightResult

/** Render findings as lines for a log. Empty string when there is nothing to report. */
export declare const formatPreflight: (result: PreflightResult) => string
