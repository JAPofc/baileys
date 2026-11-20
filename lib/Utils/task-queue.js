/**
 * Task queue — bounded-concurrency async jobs with retries: mass DMs,
 * media processing, API fan-outs.
 *
 * ```js
 * import { createTaskQueue } from '@japofc/baileys'
 *
 * const queue = createTaskQueue({ concurrency: 3, retries: 2 })
 * for (const jid of jids) {
 *     queue.push(() => sock.sendMessage(jid, content), { id: jid })
 * }
 * queue.onTaskDone(({ id, ok, attempts }) => console.log(id, ok))
 * await queue.onIdle()          // resolves when everything finished
 * queue.stats                   // { done, failed, pending, running }
 * ```
 */

export const createTaskQueue = (options = {}) => {
	const {
		concurrency = 1,
		retries = 0,
		retryDelayMs = 1000
	} = options;

	const pending = [];
	let running = 0;
	let done = 0;
	let failed = 0;
	let paused = false;
	const doneCbs = new Set();
	const idleResolvers = [];

	const emit = (payload) => {
		for (const cb of doneCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const maybeIdle = () => {
		if (!running && !pending.length) {
			while (idleResolvers.length) {
				idleResolvers.shift()();
			}
		}
	};

	const runTask = async (task) => {
		running++;
		let attempts = 0;
		let lastError;
		while (attempts <= retries) {
			attempts++;
			try {
				const result = await task.fn();
				running--;
				done++;
				emit({ id: task.id, ok: true, result, attempts });
				task.resolve({ ok: true, result, attempts });
				pump();
				maybeIdle();
				return;
			} catch (error) {
				lastError = error;
				if (attempts <= retries) {
					await new Promise(r => setTimeout(r, retryDelayMs * attempts));
				}
			}
		}
		running--;
		failed++;
		emit({ id: task.id, ok: false, error: lastError, attempts });
		task.resolve({ ok: false, error: lastError, attempts });
		pump();
		maybeIdle();
	};

	const pump = () => {
		while (!paused && running < concurrency && pending.length) {
			void runTask(pending.shift());
		}
	};

	return {
		/** Queue a job. Resolves with { ok, result|error, attempts } — never rejects. */
		push(fn, { id } = {}) {
			return new Promise((resolve) => {
				pending.push({ fn, id, resolve });
				pump();
			});
		},
		pause() {
			paused = true;
		},
		resume() {
			paused = false;
			pump();
		},
		/** Resolves when the queue is fully drained. */
		onIdle() {
			if (!running && !pending.length) {
				return Promise.resolve();
			}
			return new Promise(r => idleResolvers.push(r));
		},
		onTaskDone(cb) {
			doneCbs.add(cb);
			return () => doneCbs.delete(cb);
		},
		clearPending() {
			const dropped = pending.splice(0);
			for (const task of dropped) {
				task.resolve({ ok: false, error: new Error('queue cleared'), attempts: 0 });
			}
			maybeIdle();
			return dropped.length;
		},
		get stats() {
			return { done, failed, pending: pending.length, running };
		},
		get isPaused() {
			return paused;
		}
	};
};
