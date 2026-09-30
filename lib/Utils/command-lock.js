/**
 * Command lock — turn commands off per chat ("!off game di grup ini"),
 * plus a global maintenance mode that only owners bypass.
 *
 * ```js
 * import { createCommandLock } from '@japofc/baileys'
 *
 * const locks = createCommandLock({ owners: [ownerJid] })
 * locks.lock(chat, 'slot')                 // one command in one chat
 * locks.lock(chat, '*')                    // everything in one chat
 * locks.lockGlobal('rob')                  // one command everywhere
 *
 * // plugs straight into the router:
 * const router = createRouter({ prefix: '!' })
 * router.use(locks.middleware({ reply: 'Command dimatikan di chat ini.' }))
 *
 * locks.setMaintenance(true, { message: 'Bot lagi maintenance 🛠️' })
 * // only owners can run anything until setMaintenance(false)
 * ```
 */

export const createCommandLock = (options = {}) => {
	const { owners = [] } = options;

	const ownerSet = new Set((Array.isArray(owners) ? owners : [owners]).filter(Boolean).map(j => String(j).replace(/:\d+(?=@)/, '')));
	/** chat -> Set(command | '*') */
	const chatLocks = new Map();
	const globalLocks = new Set();
	let maintenance = false;
	let maintenanceMessage = 'Bot is under maintenance.';
	/** users already told about maintenance (once each per toggle) */
	let notified = new Set();
	const blockedCbs = new Set();

	const emit = (payload) => {
		for (const cb of blockedCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const isOwner = (jid) => ownerSet.has(String(jid || '').replace(/:\d+(?=@)/, ''));

	const check = (chat, command, sender) => {
		if (maintenance && !isOwner(sender)) {
			return { locked: true, reason: 'maintenance' };
		}
		if (globalLocks.has(command) || globalLocks.has('*')) {
			return { locked: true, reason: 'global' };
		}
		const set = chatLocks.get(chat);
		if (set && (set.has(command) || set.has('*'))) {
			return { locked: true, reason: 'chat' };
		}
		return { locked: false };
	};

	return {
		/** Is this command locked here (for this sender)? */
		check,
		isLocked: (chat, command, sender) => check(chat, command, sender).locked,
		lock(chat, command = '*') {
			let set = chatLocks.get(chat);
			if (!set) {
				set = new Set();
				chatLocks.set(chat, set);
			}
			set.add(String(command).toLowerCase());
		},
		unlock(chat, command = '*') {
			const set = chatLocks.get(chat);
			if (!set) {
				return false;
			}
			const removed = set.delete(String(command).toLowerCase());
			if (!set.size) {
				chatLocks.delete(chat);
			}
			return removed;
		},
		lockGlobal(command) {
			globalLocks.add(String(command).toLowerCase());
		},
		unlockGlobal(command) {
			return globalLocks.delete(String(command).toLowerCase());
		},
		getLocks(chat) {
			return {
				chat: [...(chatLocks.get(chat) || [])],
				global: [...globalLocks]
			};
		},
		/** Maintenance mode: only owners run anything while on. */
		setMaintenance(on, { message } = {}) {
			maintenance = !!on;
			if (message) {
				maintenanceMessage = message;
			}
			notified = new Set(); // re-notify everyone after each toggle
		},
		get isMaintenance() {
			return maintenance;
		},
		/**
		 * Router middleware: blocks locked commands. `reply` (string or
		 * (ctx, verdict) => string) is sent once per user per maintenance
		 * toggle, every time for chat/global locks. Pass `reply: false`
		 * for silent drops.
		 */
		middleware({ reply } = {}) {
			return async (ctx, next) => {
				const verdict = check(ctx.jid, ctx.command, ctx.sender);
				if (!verdict.locked) {
					return next();
				}
				emit({ chat: ctx.jid, sender: ctx.sender, command: ctx.command, reason: verdict.reason });
				if (reply === false) {
					return;
				}
				let text;
				if (verdict.reason === 'maintenance') {
					if (notified.has(ctx.sender)) {
						return; // don't spam during maintenance
					}
					notified.add(ctx.sender);
					text = maintenanceMessage;
				} else {
					text = typeof reply === 'function' ? reply(ctx, verdict) : (reply || 'This command is disabled here.');
				}
				try {
					await ctx.reply(text);
				} catch {
					// reply failures must not break the router
				}
			};
		},
		onBlocked(cb) {
			blockedCbs.add(cb);
			return () => blockedCbs.delete(cb);
		},
		toJSON() {
			return {
				chatLocks: [...chatLocks].map(([chat, set]) => [chat, [...set]]),
				globalLocks: [...globalLocks],
				maintenance,
				maintenanceMessage
			};
		},
		load(snapshot) {
			chatLocks.clear();
			globalLocks.clear();
			for (const [chat, list] of snapshot?.chatLocks || []) {
				chatLocks.set(chat, new Set(list));
			}
			for (const command of snapshot?.globalLocks || []) {
				globalLocks.add(command);
			}
			maintenance = !!snapshot?.maintenance;
			if (snapshot?.maintenanceMessage) {
				maintenanceMessage = snapshot.maintenanceMessage;
			}
		}
	};
};
