/**
 * Always online — keep the green "online" dot lit by refreshing presence on
 * an interval (WhatsApp drops it after inactivity).
 *
 * ```js
 * import { createAlwaysOnline } from '@japofc/baileys'
 *
 * const online = createAlwaysOnline(sock, { intervalMs: 60_000 })
 * online.start()
 *
 * online.setPresence('unavailable')   // switch to invisible mode live
 * online.stats                        // { updates, failures }
 * online.stop()
 * ```
 *
 * Failures (mid-reconnect etc.) are counted and retried on the next tick —
 * they never throw into your app.
 */

export const createAlwaysOnline = (sock, options = {}) => {
	if (!sock) {
		throw new Error('createAlwaysOnline(sock) requires a socket');
	}
	const { intervalMs = 60_000, presence: initialPresence = 'available' } = options;

	let presence = initialPresence;
	let timer = null;
	let updates = 0;
	let failures = 0;
	const errorCbs = new Set();

	const push = async () => {
		try {
			await sock.sendPresenceUpdate(presence);
			updates++;
		} catch (error) {
			failures++;
			for (const cb of errorCbs) {
				try {
					cb({ error, presence });
				} catch {
					// listener errors end here
				}
			}
		}
	};

	return {
		/** Push presence now (also called by the interval). */
		push,
		start() {
			if (timer) {
				return () => this.stop();
			}
			void push();
			timer = setInterval(() => {
				void push();
			}, intervalMs);
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
		/** Change the maintained presence ('available' | 'unavailable'). */
		setPresence(next) {
			presence = next;
			if (timer) {
				void push();
			}
		},
		get presence() {
			return presence;
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		get stats() {
			return { updates, failures };
		}
	};
};
