/**
 * Group scheduler — open/close groups on a daily schedule ("night mode"):
 * announcement-only at 22:00, everyone-can-chat again at 06:00.
 *
 * ```js
 * import { createGroupScheduler } from '@japofc/baileys'
 *
 * const nightMode = createGroupScheduler()
 * nightMode.add({ group: '123@g.us', action: 'close', at: '22:00' })
 * nightMode.add({ group: '123@g.us', action: 'open',  at: '06:00' })
 * nightMode.add({ group: '123@g.us', action: 'close', at: '13:00', days: [5] }) // Fridays only
 * nightMode.start(sock)
 *
 * nightMode.onAction(({ group, action }) =>
 *     sock.sendMessage(group, { text: action === 'close' ? '🌙 Group closed for the night' : '☀️ Group is open!' }))
 * ```
 *
 * 'close' → announcement mode (admins only), 'open' → everyone can send.
 * Times are local to the process (`HH:MM`, 24h). Rules survive missed ticks:
 * a due rule fires on the next check, then reschedules for the next day.
 */

export const createGroupScheduler = (options = {}) => {
	const { checkIntervalMs = 30_000, now = () => Date.now() } = options;

	/** id -> rule { group, action, at, days, nextRun } */
	const rules = new Map();
	let nextId = 1;
	let timer = null;
	let sockRef = null;
	const actionCbs = new Set();
	const errorCbs = new Set();

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break the scheduler
			}
		}
	};

	const parseAt = (at) => {
		const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(at).trim());
		if (!m) {
			throw new Error(`invalid time "${at}" — use "HH:MM" (24h)`);
		}
		return { hour: +m[1], minute: +m[2] };
	};

	const computeNextRun = (rule, fromMs) => {
		const { hour, minute } = rule.time;
		const candidate = new Date(fromMs);
		candidate.setHours(hour, minute, 0, 0);
		for (let i = 0; i < 8; i++) {
			const t = candidate.getTime() + i * 86_400_000;
			const d = new Date(t);
			if (t > fromMs && (!rule.days || rule.days.includes(d.getDay()))) {
				return t;
			}
		}
		throw new Error('could not compute next run (empty days list?)');
	};

	const execute = async (rule, sock) => {
		const setting = rule.action === 'close' ? 'announcement' : 'not_announcement';
		try {
			await sock.groupSettingUpdate(rule.group, setting);
			emit(actionCbs, { id: rule.id, group: rule.group, action: rule.action, setting, at: now() });
		} catch (error) {
			emit(errorCbs, { id: rule.id, group: rule.group, action: rule.action, error });
		}
	};

	/** Run one scheduler pass — fires every due rule. Exposed for manual use. */
	const tick = async (sock = sockRef) => {
		if (!sock) {
			return;
		}
		const t = now();
		for (const rule of rules.values()) {
			if (t >= rule.nextRun) {
				await execute(rule, sock);
				rule.nextRun = computeNextRun(rule, t);
			}
		}
	};

	return {
		tick,
		/**
		 * Add a rule: `{ group, action: 'open'|'close', at: 'HH:MM',
		 * days?: [0-6] }` (days: 0 = Sunday). Returns the rule id.
		 */
		add({ group, action, at, days } = {}) {
			if (!group || (action !== 'open' && action !== 'close')) {
				throw new Error("rule needs { group, action: 'open'|'close', at: 'HH:MM' }");
			}
			const time = parseAt(at);
			if (days !== undefined && (!Array.isArray(days) || !days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6))) {
				throw new Error('days must be a non-empty array of 0-6 (0 = Sunday)');
			}
			const id = nextId++;
			const rule = { id, group, action, at, time, days: days ? [...days] : undefined };
			rule.nextRun = computeNextRun(rule, now());
			rules.set(id, rule);
			return id;
		},
		remove(id) {
			return rules.delete(id);
		},
		list() {
			return [...rules.values()].map(({ id, group, action, at, days, nextRun }) => ({ id, group, action, at, days, nextRun }));
		},
		/** Start checking (default every 30s). Safe to call once per socket. */
		start(sock) {
			sockRef = sock;
			if (timer) {
				return () => this.stop();
			}
			timer = setInterval(() => {
				tick().catch(() => { });
			}, checkIntervalMs);
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
			sockRef = null;
		},
		get isRunning() {
			return !!timer;
		},
		onAction(cb) {
			actionCbs.add(cb);
			return () => actionCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		get size() {
			return rules.size;
		},
		clear() {
			rules.clear();
		}
	};
};
