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


/**
 * JAP@Upgrade: presence cycler — opt-in human-like presence activity:
 * short "composing…" bursts in chats YOU list, at Gaussian-jittered
 * intervals, so long-running bots don't look suspiciously silent.
 *
 * ```js
 * const cycler = createPresenceCycler(sock, {
 *     chats: [ownerJid],                 // only where you allow it
 *     meanIntervalMs: 10 * 60_000
 * })
 * cycler.start()
 * ```
 */
import { gaussianDelayMs } from './random-tools.js';

export const createPresenceCycler = (sock, options = {}) => {
	if (!sock) {
		throw new Error('createPresenceCycler(sock) requires a socket');
	}
	const {
		chats = [],
		meanIntervalMs = 10 * 60_000,
		stdIntervalMs = meanIntervalMs / 3,
		typingMs = 3000,
		random = Math.random
	} = options;
	if (!Array.isArray(chats) || !chats.length) {
		throw new Error('createPresenceCycler needs { chats: [jid, …] } — it never types in chats you did not list');
	}

	let timer = null;
	let cycles = 0;
	let failures = 0;
	let running = false;

	const cycleOnce = async () => {
		const chat = chats[Math.floor(random() * chats.length)];
		try {
			await sock.sendPresenceUpdate('composing', chat);
			// NOTE: this timer must stay referenced — an unref'd timer lets the
			// event loop drain mid-cycle and the pause never resolves.
			await new Promise(r => setTimeout(r, typingMs));
			await sock.sendPresenceUpdate('paused', chat);
			cycles++;
		} catch {
			failures++;
		}
	};

	const schedule = () => {
		if (!running) {
			return;
		}
		timer = setTimeout(async () => {
			await cycleOnce();
			schedule();
		}, gaussianDelayMs(meanIntervalMs, stdIntervalMs, { random }));
		if (timer.unref) {
			timer.unref();
		}
	};

	return {
		cycleOnce,
		start() {
			if (running) {
				return () => this.stop();
			}
			running = true;
			schedule();
			return () => this.stop();
		},
		stop() {
			running = false;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
		get isRunning() {
			return running;
		},
		get stats() {
			return { cycles, failures };
		}
	};
};
