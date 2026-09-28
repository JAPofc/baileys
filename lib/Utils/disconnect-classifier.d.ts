/** Disconnect classifier — category + recommended action for close errors. */

export type DisconnectCategory = 'transient' | 'conflict' | 'auth' | 'banned' | 'unknown';
export type DisconnectAction = 'reconnect-now' | 'reconnect-backoff' | 're-pair' | 'stop';

export interface DisconnectVerdict {
	code: number | null;
	reason: string | null;
	category: DisconnectCategory;
	action: DisconnectAction;
	shouldReconnect: boolean;
	description: string;
}

/** Accepts lastDisconnect, a Boom error, or a bare status code. */
export declare const classifyDisconnect: (input: unknown) => DisconnectVerdict;
/** One human-readable line for logs/owner DMs. */
export declare const explainDisconnect: (input: unknown) => string;
