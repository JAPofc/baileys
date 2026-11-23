export declare const MESSAGE_SIZE_WARN_BYTES: number
export declare const MESSAGE_SIZE_MAX_BYTES: number

export type MessageSizeEstimate = {
	/** Serialised protobuf length of the message node, or `undefined` if unmeasurable offline. */
	bytes: number | undefined
	/**
	 * Locally knowable media bytes (Buffers). `undefined` means at least one media item is
	 * a URL or stream whose size cannot be known without fetching it — not that it is zero.
	 */
	mediaBytes: number | undefined
	hasUnknownMedia: boolean
	withinLimit: boolean | undefined
	nearLimit: boolean | undefined
	/** The single heaviest top-level field, so you know what to cut. */
	heaviest: { field: string; bytes: number } | undefined
	/** Present only when the content could not be encoded without uploading. */
	unmeasurable?: string
	/** What the byte count does NOT include. */
	excludes: string[]
}

/** Measure what `sendMessage` would put on the wire. Never uploads anything. */
export declare const estimateMessageSize: (
	content: any,
	options?: { userJid?: string; generateOptions?: any }
) => Promise<MessageSizeEstimate>

/**
 * NOTE: an album node only announces a count — the images travel as separate messages —
 * so a multi-image album reports a small `bytes` value by design.
 */
