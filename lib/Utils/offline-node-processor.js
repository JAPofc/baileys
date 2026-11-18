/**
 * lib/Utils/offline-node-processor.js — drain the offline stanza backlog without blocking.
 *
 * When a bot reconnects, WhatsApp replays everything it buffered while the socket was down as
 * one burst of stanzas. Handling them straight from the websocket callback keeps the event
 * loop busy for as long as the burst lasts: timers fire late, keep-alives are missed, and a
 * single throwing handler takes the rest of the backlog with it.
 *
 * This queues the nodes, processes them one at a time, yields to the event loop every
 * `batchSize` nodes, and isolates handler errors.
 *
 * JAP@Add (§2.104).
 */

const defaultYield = () => new Promise(resolve => setImmediate(resolve));

/**
 * @param {Map<string, (node: any) => Promise<void> | void>} nodeProcessorMap handler per node type
 * @param {object} deps
 * @param {() => boolean} [deps.isOpen] stop draining when this turns false (default: always open)
 * @param {(err: unknown, context: string) => void} [deps.onUnexpectedError]
 * @param {() => Promise<void>} [deps.yieldToEventLoop]
 * @param {number} [batchSize] nodes handled between yields (default 10)
 */
export const makeOfflineNodeProcessor = (nodeProcessorMap, deps = {}, batchSize = 10) => {
	if (!nodeProcessorMap || typeof nodeProcessorMap.get !== 'function') {
		throw new TypeError('makeOfflineNodeProcessor: nodeProcessorMap must be a Map of type -> handler');
	}
	const limit = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 10;
	const isOpen = deps.isOpen || deps.isWsOpen || (() => true);
	const onUnexpectedError = deps.onUnexpectedError || (() => {});
	const yieldToEventLoop = deps.yieldToEventLoop || defaultYield;

	const queue = [];
	let processing = false;
	let idle = Promise.resolve();
	let resolveIdle;

	const drain = async () => {
		let inBatch = 0;
		while (queue.length && isOpen()) {
			const { type, node } = queue.shift();
			const processor = nodeProcessorMap.get(type);
			if (!processor) {
				onUnexpectedError(new Error(`unknown offline node type: ${type}`), 'processing offline node');
				continue;
			}
			try {
				await processor(node);
			}
			catch (err) {
				onUnexpectedError(err, `processing offline ${type}`);
			}
			if (++inBatch >= limit) {
				inBatch = 0;
				await yieldToEventLoop();
			}
		}
		processing = false;
		resolveIdle?.();
		resolveIdle = undefined;
	};

	return {
		/** Queue a stanza for processing. */
		enqueue(type, node) {
			queue.push({ type, node });
			if (processing) {
				return;
			}
			processing = true;
			idle = new Promise(resolve => {
				resolveIdle = resolve;
			});
			drain().catch(err => {
				processing = false;
				resolveIdle?.();
				resolveIdle = undefined;
				onUnexpectedError(err, 'processing offline nodes');
			});
		},
		/** Resolves once the current backlog has been drained. */
		async waitUntilIdle() {
			await idle;
		},
		/** Drop everything still queued (e.g. on logout) and report how many were dropped. */
		clear() {
			const dropped = queue.length;
			queue.length = 0;
			return dropped;
		},
		/** How many stanzas are still waiting. */
		get pending() {
			return queue.length;
		},
		/** Whether a drain is in flight. */
		get draining() {
			return processing;
		},
	};
};
