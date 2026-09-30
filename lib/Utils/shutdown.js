/**
 * Shutdown manager — close the bot cleanly on SIGINT/SIGTERM (or on demand):
 * flush credentials, run your teardown hooks in order, end the socket, and
 * never run twice.
 *
 * ```js
 * import { createShutdownManager } from '@japofc/baileys'
 *
 * const shutdown = createShutdownManager({
 *     sock,
 *     saveCreds,                             // flushed FIRST — login survives
 *     timeoutMs: 10_000                      // hard cap for the whole teardown
 * })
 * shutdown.register('close db', () => db.close())
 * shutdown.register('flush store', () => store.flush())
 * shutdown.attach()                          // handles SIGINT + SIGTERM
 *
 * // manual: await shutdown.shutdown('deploy restart')
 * ```
 *
 * Hooks run sequentially in registration order; a failing hook is reported
 * via `onError` and never blocks the rest of the teardown.
 */

export const createShutdownManager = (options = {}) => {
	const {
		sock,
		saveCreds,
		timeoutMs = 10_000,
		signals = ['SIGINT', 'SIGTERM'],
		exit = false, // call process.exit(code) after teardown
		onError
	} = options;

	const hooks = [];
	const doneCbs = new Set();
	let shuttingDown = null; // Promise while in progress / after completion
	let attached = false;
	const signalHandlers = new Map();

	const reportError = (step, error) => {
		if (onError) {
			try {
				onError({ step, error });
			} catch {
				// error handler errors end here
			}
		}
	};

	const withTimeout = async (promise, ms, label) => {
		if (!ms) {
			return promise;
		}
		// NOTE: this timer must stay referenced — it can be the only thing
		// keeping the event loop alive while a hung hook never resolves.
		let timer;
		try {
			return await Promise.race([
				promise,
				new Promise((_, reject) => {
					timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
				})
			]);
		} finally {
			clearTimeout(timer);
		}
	};

	const run = async (reason) => {
		const result = { reason, steps: [], errors: [] };
		const step = async (name, fn) => {
			try {
				await withTimeout(Promise.resolve().then(fn), timeoutMs, name);
				result.steps.push(name);
			} catch (error) {
				result.errors.push({ step: name, error });
				reportError(name, error);
			}
		};
		// credentials first — whatever else fails, the login must survive
		if (saveCreds) {
			await step('saveCreds', saveCreds);
		}
		for (const hook of hooks) {
			await step(hook.name, hook.fn);
		}
		if (sock) {
			await step('socket.end', () => sock.end?.(undefined));
			await step('ws.close', () => sock.ws?.close?.());
		}
		for (const cb of doneCbs) {
			try {
				cb(result);
			} catch {
				// listener errors are the listener's problem
			}
		}
		return result;
	};

	const manager = {
		/** Add a teardown hook. Runs in registration order. Returns a remover. */
		register(name, fn) {
			if (typeof name === 'function') {
				fn = name;
				name = fn.name || `hook-${hooks.length + 1}`;
			}
			if (typeof fn !== 'function') {
				throw new TypeError('register(name, fn) requires a function');
			}
			const hook = { name: String(name), fn };
			hooks.push(hook);
			return () => {
				const i = hooks.indexOf(hook);
				if (i !== -1) {
					hooks.splice(i, 1);
				}
			};
		},
		/** Run the teardown once. Later calls return the same promise. */
		shutdown(reason = 'manual') {
			if (!shuttingDown) {
				shuttingDown = run(reason).then((result) => {
					if (exit) {
						process.exit(result.errors.length ? 1 : 0);
					}
					return result;
				});
			}
			return shuttingDown;
		},
		/** Listen for the configured signals. Returns a detach function. */
		attach() {
			if (attached) {
				return () => this.detach();
			}
			attached = true;
			for (const signal of signals) {
				const handler = () => {
					void manager.shutdown(signal);
				};
				signalHandlers.set(signal, handler);
				process.on(signal, handler);
			}
			return () => this.detach();
		},
		detach() {
			for (const [signal, handler] of signalHandlers) {
				process.off(signal, handler);
			}
			signalHandlers.clear();
			attached = false;
		},
		onDone(cb) {
			doneCbs.add(cb);
			return () => doneCbs.delete(cb);
		},
		get isShuttingDown() {
			return !!shuttingDown;
		},
		get hookCount() {
			return hooks.length;
		}
	};
	return manager;
};
