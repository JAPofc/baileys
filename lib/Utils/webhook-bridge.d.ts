/** Webhook bridge — POST socket events to an HTTP endpoint. */

export interface WebhookBridgeOptions {
	/** Events to forward. Default ['messages.upsert']. */
	events?: string[];
	/** HMAC-SHA256 secret → X-JAP-Signature header. */
	secret?: string;
	headers?: Record<string, string>;
	/** Per-request timeout. Default 10000. */
	timeoutMs?: number;
	/** Retries after the first attempt. Default 2. */
	retries?: number;
	/** Base backoff delay (doubles per attempt). Default 1000. */
	retryDelayMs?: number;
	/** Cap the JSON body; oversized payloads get summarized. Default 512 KB. */
	maxBodyBytes?: number;
	/** Reshape/filter payloads; return null/undefined to skip the event. */
	transform?: (event: string, payload: unknown) => unknown;
	/** fetch override (testing). */
	fetchImpl?: typeof fetch;
}

export interface WebhookBridge {
	/** POST one event manually (with the same retry policy). */
	send(event: string, payload: unknown): Promise<{ ok?: boolean; status?: number; attempt?: number; skipped?: boolean; error?: unknown }>;
	bind(sock: unknown): () => void;
	unbind(): void;
	onDelivered(cb: (info: { event: string; status: number; attempt: number }) => void): () => void;
	onFailed(cb: (info: { event: string; error: unknown }) => void): () => void;
	readonly stats: { delivered: number; failed: number };
}

export declare const createWebhookBridge: (url: string, options?: WebhookBridgeOptions) => WebhookBridge;

/** Verify an X-JAP-Signature header against the raw request body. */
export declare const verifyWebhookSignature: (
	rawBody: string | Uint8Array,
	signatureHeader: string | undefined,
	secret: string
) => boolean;
