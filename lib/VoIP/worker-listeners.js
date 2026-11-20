/**
 * lib/VoIP/worker-listeners.js — one parentPort subscription, many listeners.
 *
 * JAP@Fix (§2.102): the worker bootstrap called `parentPort.on('message', …)` once per
 * `addEventListener('message', …)` call *and* once per `WorkerSyncedMessagePort` it built,
 * never removed any of them, and never implemented `removeEventListener` at all. The WASM
 * VoIP loader registers a handful of handlers and rebuilds its port on every call, so a
 * long-running bot accumulated parentPort listeners until Node printed
 * `MaxListenersExceededWarning` — and every delivered message was then fanned out through
 * all the stale handlers too.
 *
 * This dispatcher attaches exactly ONE underlying listener and fans out itself, so adding
 * and removing is symmetric and a handler that throws cannot stop the others.
 */

/**
 * @param {{ on: Function, off?: Function, removeListener?: Function } | null | undefined} port
 * @param {{ onError?: (err: unknown, data: unknown) => void }} [opts]
 */
export const createPortDispatcher = (port, { onError } = {}) => {
	const listeners = new Set();
	let attached = false;
	let disposed = false;

	const fanout = data => {
		for (const fn of [...listeners]) {
			try {
				fn(data);
			}
			catch (err) {
				if (onError) {
					onError(err, data);
				}
				else {
					console.error('[VoIP worker-bootstrap] message listener threw:', err);
				}
			}
		}
	};

	const attach = () => {
		if (attached || disposed || !port?.on) {
			return;
		}
		port.on('message', fanout);
		attached = true;
	};

	const detach = () => {
		if (!attached) {
			return;
		}
		const off = port.off || port.removeListener;
		off?.call(port, 'message', fanout);
		attached = false;
	};

	return {
		/** Register a handler. Returns an unsubscribe function. */
		add(fn) {
			if (typeof fn !== 'function') {
				throw new TypeError('createPortDispatcher: listener must be a function');
			}
			if (disposed) {
				return () => {};
			}
			listeners.add(fn);
			attach();
			return () => this.remove(fn);
		},
		/** Remove a handler. Returns whether it was registered. */
		remove(fn) {
			const had = listeners.delete(fn);
			if (!listeners.size) {
				detach();
			}
			return had;
		},
		/** Deliver a message to every handler (used by tests and by synchronous replays). */
		dispatch: fanout,
		/** How many handlers are registered. */
		get size() {
			return listeners.size;
		},
		/** Whether the single underlying port subscription is currently attached. */
		get attached() {
			return attached;
		},
		/** Drop every handler and the port subscription. */
		dispose() {
			disposed = true;
			listeners.clear();
			detach();
		},
	};
};
