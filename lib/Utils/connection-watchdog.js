/**
 * Connection watchdog — catch the silent half-open socket: when NO events
 * arrive for too long, the connection is probably dead even though the
 * websocket still "looks" open. Fires `onStale` so you can restart.
 *
 * ```js
 * import { createConnectionWatchdog } from '@japofc/baileys'
 *
 * const watchdog = createConnectionWatchdog({ staleMs: 5 * 60_000 })
 * watchdog.bind(sock)   // marks activity on messages, receipts, presence…
 * watchdog.onStale(({ silentMs }) => {
 *     console.log('connection silent for', silentMs, 'ms — restarting')
 *     sock.end(new Error('stale connection'))   // auto-reconnect takes over
 * })
 * watchdog.start()
 *
 * watchdog.touch()          // manual activity mark (e.g. after a successful send)
 * watchdog.silentMs         // how quiet it currently is
 * ```
 *
 * `onStale` fires once per stale period — it re-arms only after activity
 * resumes, so a dead link doesn't spam restarts.
 */

const DEFAULT_EVENTS = [
	'messages.upsert',
	'messages.update',
	'message-receipt.update',
	'presence.update',
	'chats.update',
	'connection.update',
	'creds.update'
];

export const createConnectionWatchdog = (options = {}) => {
	const {
		staleMs = 5 * 60_000,
		checkIntervalMs = 30_000,
		events = DEFAULT_EVENTS,
		now = () => Date.now()
	} = options;

	let lastActivity = now();
	let staleSince = null; // set while in a stale period
	let timer = null;
	let boundSock = null;
	const boundHandlers = new Map();
	const staleCbs = new Set();
	const activityCbs = new Set();
	let staleCount = 0;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	/** Mark the connection as alive right now. */
	const touch = () => {
		const wasStale = staleSince !== null;
		lastActivity = now();
		staleSince = null;
		if (wasStale) {
			emit(activityCbs, { at: lastActivity });
		}
	};

	/** Run one staleness check (also called by the interval). */
	const check = () => {
		const silent = now() - lastActivity;
		if (silent >= staleMs && staleSince === null) {
			staleSince = now();
			staleCount++;
			emit(staleCbs, { silentMs: silent, lastActivity, at: staleSince });
		}
		return { silentMs: silent, stale: staleSince !== null };
	};

	return {
		touch,
		check,
		bind(sock) {
			boundSock = sock;
			for (const event of events) {
				const handler = () => touch();
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
		start() {
			if (timer) {
				return () => this.stop();
			}
			touch(); // starting counts as activity
			timer = setInterval(check, checkIntervalMs);
			if (timer.unref) {
				timer.unref();
			}
			return () => this.stop();
		},
		stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		get isRunning() {
			return !!timer;
		},
		/** Fires once per stale period (re-armed by new activity). */
		onStale(cb) {
			staleCbs.add(cb);
			return () => staleCbs.delete(cb);
		},
		/** Fires when activity resumes after a stale period. */
		onActivity(cb) {
			activityCbs.add(cb);
			return () => activityCbs.delete(cb);
		},
		get lastActivity() {
			return lastActivity;
		},
		get silentMs() {
			return now() - lastActivity;
		},
		get isStale() {
			return staleSince !== null;
		},
		get stats() {
			return { staleCount };
		}
	};
};
