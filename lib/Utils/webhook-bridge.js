/**
 * Webhook bridge — forward socket events to an HTTP endpoint as JSON:
 * plug your bot into n8n, Zapier-style automations, or your own backend.
 *
 * ```js
 * import { createWebhookBridge } from '@japofc/baileys'
 *
 * const bridge = createWebhookBridge('https://my.server/hook', {
 *     events: ['messages.upsert', 'group-participants.update'],
 *     secret: 'shared-secret',           // → X-JAP-Signature (HMAC-SHA256)
 *     retries: 2
 * })
 * bridge.bind(sock)
 *
 * bridge.onDelivered(({ event, status }) => console.log('sent', event, status))
 * bridge.onFailed(({ event, error }) => console.log('gave up on', event))
 * ```
 *
 * Each POST body: `{ event, payload, sentAt }`. With a secret set, the
 * signature header is `sha256=<hmac of the raw body>` — verify it server-side.
 * Failures retry with exponential backoff and never crash the socket.
 */
import { createHmac } from 'crypto';

const DEFAULT_EVENTS = ['messages.upsert'];

export const createWebhookBridge = (url, options = {}) => {
	if (!url) {
		throw new Error('createWebhookBridge(url) requires a webhook URL');
	}
	const {
		events = DEFAULT_EVENTS,
		secret,
		headers = {},
		timeoutMs = 10_000,
		retries = 2,
		retryDelayMs = 1000,
		transform, // (event, payload) => body payload (return null/undefined to skip)
		fetchImpl = fetch
	} = options;

	const deliveredCbs = new Set();
	const failedCbs = new Set();
	let boundSock = null;
	const boundHandlers = new Map();
	let delivered = 0;
	let failed = 0;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const sleep = (ms) => new Promise(r => setTimeout(r, ms));

	/** POST one event (with retries). Exposed for manual pushes too. */
	const send = async (event, payload) => {
		let body = payload;
		if (transform) {
			try {
				body = transform(event, payload);
			} catch {
				body = payload;
			}
			if (body === null || body === undefined) {
				return { skipped: true };
			}
		}
		const raw = JSON.stringify({ event, payload: body, sentAt: Date.now() });
		const requestHeaders = { 'content-type': 'application/json', ...headers };
		if (secret) {
			requestHeaders['x-jap-signature'] = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
		}
		let lastError;
		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), timeoutMs);
				let response;
				try {
					response = await fetchImpl(url, {
						method: 'POST',
						headers: requestHeaders,
						body: raw,
						signal: controller.signal
					});
				} finally {
					clearTimeout(timer);
				}
				if (response.ok) {
					delivered++;
					emit(deliveredCbs, { event, status: response.status, attempt });
					return { ok: true, status: response.status, attempt };
				}
				lastError = new Error(`webhook responded ${response.status}`);
				// 4xx (except 429) will not improve with retries
				if (response.status >= 400 && response.status < 500 && response.status !== 429) {
					break;
				}
			} catch (err) {
				lastError = err;
			}
			if (attempt < retries) {
				await sleep(retryDelayMs * Math.pow(2, attempt));
			}
		}
		failed++;
		emit(failedCbs, { event, error: lastError });
		return { ok: false, error: lastError };
	};

	return {
		send,
		bind(sock) {
			boundSock = sock;
			for (const event of events) {
				const handler = (payload) => {
					void send(event, payload);
				};
				boundHandlers.set(event, handler);
				sock.ev.on(event, handler);
			}
			return () => this.unbind();
		},
		unbind() {
			if (boundSock) {
				for (const [event, handler] of boundHandlers) {
					boundSock.ev.off(event, handler);
				}
			}
			boundHandlers.clear();
			boundSock = null;
		},
		onDelivered(cb) {
			deliveredCbs.add(cb);
			return () => deliveredCbs.delete(cb);
		},
		onFailed(cb) {
			failedCbs.add(cb);
			return () => failedCbs.delete(cb);
		},
		get stats() {
			return { delivered, failed };
		}
	};
};

/** Verify an X-JAP-Signature header against the raw request body. */
export const verifyWebhookSignature = (rawBody, signatureHeader, secret) => {
	if (!signatureHeader || !secret) {
		return false;
	}
	const expected = 'sha256=' + createHmac('sha256', secret)
		.update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody))
		.digest('hex');
	return signatureHeader === expected;
};
