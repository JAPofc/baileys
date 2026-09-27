/**
 * Health monitor — watch the bot process itself: memory, uptime, event-loop
 * lag and your own probes, with threshold alerts.
 *
 * ```js
 * import { createHealthMonitor } from '@japofc/baileys'
 *
 * const health = createHealthMonitor({
 *     intervalMs: 30_000,
 *     thresholds: { heapUsedMb: 400, eventLoopLagMs: 200 }
 * })
 * health.addProbe('pendingJobs', () => queue.size)
 * health.onAlert(({ metric, value, threshold }) =>
 *     sock.sendMessage(ownerJid, { text: `⚠️ ${metric} = ${value} (limit ${threshold})` }))
 * health.start()
 *
 * health.snapshot() // { uptimeSec, heapUsedMb, rssMb, eventLoopLagMs, probes… }
 * ```
 *
 * Alerts fire once per threshold crossing (re-armed after the metric drops
 * back under), so a long incident doesn't spam the owner.
 */

/** JAP@Upgrade: pretty owner-DM text for a snapshot(). */
export const formatHealthSnapshot = (snap) => {
	if (!snap) {
		return '(no snapshot)';
	}
	const lines = [
		'🩺 *Bot Health*',
		`Uptime: ${Math.floor(snap.processUptimeSec / 3600)}h ${Math.floor((snap.processUptimeSec % 3600) / 60)}m`,
		`Heap: ${snap.heapUsedMb}/${snap.heapTotalMb} MB · RSS: ${snap.rssMb} MB`,
		`Event loop lag: ${snap.eventLoopLagMs} ms`
	];
	const probes = Object.entries(snap.probes || {});
	if (probes.length) {
		lines.push('— probes —');
		for (const [name, value] of probes) {
			lines.push(`${name}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
		}
	}
	return lines.join('\n');
};

export const createHealthMonitor = (options = {}) => {
	const {
		intervalMs = 30_000,
		thresholds = {},
		now = () => Date.now()
	} = options;

	const probes = new Map();
	const alertCbs = new Set();
	const snapshotCbs = new Set();
	/** metric -> currently in alert state */
	const alerting = new Map();
	const history = [];
	const maxHistory = options.maxHistory ?? 60;
	let timer = null;
	let lagProbe = { lastCheck: 0, lagMs: 0 };
	const startedAt = now();

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const measureLag = () => new Promise((resolve) => {
		const scheduled = now();
		setImmediate(() => {
			// a saturated loop delays even setImmediate; add timer drift too.
			// NOTE: this short timer must stay referenced — unref'd it can
			// never fire when nothing else keeps the event loop alive, and
			// snapshot() would hang forever.
			const immediateLag = Math.max(0, now() - scheduled);
			const timerStart = now();
			setTimeout(() => {
				resolve(Math.max(immediateLag, now() - timerStart - 10));
			}, 10);
		});
	});

	/** Collect one snapshot (async — measures real event-loop lag). */
	const snapshot = async () => {
		const mem = process.memoryUsage();
		lagProbe.lagMs = await measureLag();
		const snap = {
			at: now(),
			uptimeSec: Math.round((now() - startedAt) / 1000),
			processUptimeSec: Math.round(process.uptime()),
			heapUsedMb: +(mem.heapUsed / 1048576).toFixed(1),
			heapTotalMb: +(mem.heapTotal / 1048576).toFixed(1),
			rssMb: +(mem.rss / 1048576).toFixed(1),
			externalMb: +(mem.external / 1048576).toFixed(1),
			eventLoopLagMs: +lagProbe.lagMs.toFixed(1),
			probes: {}
		};
		for (const [name, fn] of probes) {
			try {
				snap.probes[name] = await fn();
			} catch (err) {
				snap.probes[name] = { error: err?.message || 'probe failed' };
			}
		}
		history.push(snap);
		while (history.length > maxHistory) {
			history.shift();
		}
		checkThresholds(snap);
		emit(snapshotCbs, snap);
		return snap;
	};

	const valueOf = (snap, metric) =>
		metric in snap ? snap[metric] : snap.probes[metric];

	const checkThresholds = (snap) => {
		for (const [metric, threshold] of Object.entries(thresholds)) {
			const value = valueOf(snap, metric);
			if (typeof value !== 'number') {
				continue;
			}
			const over = value > threshold;
			const wasAlerting = alerting.get(metric) || false;
			if (over && !wasAlerting) {
				alerting.set(metric, true);
				emit(alertCbs, { metric, value, threshold, at: snap.at });
			} else if (!over && wasAlerting) {
				alerting.set(metric, false); // re-arm
			}
		}
	};

	return {
		snapshot,
		addProbe(name, fn) {
			if (typeof fn !== 'function') {
				throw new TypeError('addProbe(name, fn) requires a function');
			}
			probes.set(name, fn);
			return () => probes.delete(name);
		},
		start() {
			if (timer) {
				return () => this.stop();
			}
			timer = setInterval(() => {
				snapshot().catch(() => { });
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
		onAlert(cb) {
			alertCbs.add(cb);
			return () => alertCbs.delete(cb);
		},
		onSnapshot(cb) {
			snapshotCbs.add(cb);
			return () => snapshotCbs.delete(cb);
		},
		getHistory: () => [...history],
		/** Is a metric currently over its threshold? */
		isAlerting: (metric) => alerting.get(metric) || false
	};
};
