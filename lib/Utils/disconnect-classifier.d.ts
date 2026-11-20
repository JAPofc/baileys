/** Disconnect classifier — category + recommended action for close errors. */

export type DisconnectCategory = 'transient' | 'conflict' | 'auth' | 'banned' | 'unknown';
export type DisconnectAction = 'reconnect-now' | 'reconnect-backoff' | 're-pair' | 'retry-then-re-pair' | 'stop';

export interface DisconnectVerdict {
	code: number | null;
	reason: string | null;
	category: DisconnectCategory;
	action: DisconnectAction;
	shouldReconnect: boolean;
	description: string;
	/** Reconnecting cannot fix this close (and may make it worse). */
	fatal: boolean;
	/**
	 * How many CONSECUTIVE closes with this code are tolerated before `fatal`
	 * applies. `null` means it is fatal on the first one. Only `badSession`
	 * uses it today (3): a single bad decrypt is usually a server hiccup.
	 */
	fatalAfterStreak: number | null;
	/** What the operator should actually do about it. */
	remedy: string;
}

/** Accepts lastDisconnect, a Boom error, or a bare status code. */
export declare const classifyDisconnect: (input: unknown) => DisconnectVerdict;
/**
 * One human-readable line for logs/owner DMs. Fatal closes get a second
 * `↳ FATAL: <remedy>` line; pass the current `streak` so a streaked code
 * (badSession) reports `2/3 in a row — retrying` instead of crying wolf.
 */
export declare const explainDisconnect: (input: unknown, opts?: { streak?: number }) => string;
