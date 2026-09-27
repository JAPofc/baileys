/**
 * Command analytics — who uses which command, how often, and when.
 * Plugs straight into the router as middleware, or record manually.
 *
 * ```js
 * import { createCommandStats } from '@japofc/baileys'
 *
 * const stats = createCommandStats()
 * router.use(stats.middleware())        // counts every executed command
 *
 * stats.getTopCommands(5)               // [{ command: 'sticker', count: 120 }, …]
 * stats.getTopUsers(5)                  // most active users
 * stats.getBusiestHours()               // 24-slot histogram (local time)
 * stats.getCommandStats('sticker')      // { count, users, chats, lastUsedAt }
 * stats.getUserStats(jid)               // per-user breakdown by command
 * fs.writeFileSync('stats.json', JSON.stringify(stats.toJSON()))
 * ```
 */

export const createCommandStats = (options = {}) => {
	const { now = () => Date.now() } = options;

	/** command -> { count, users: Map(jid->count), chats: Map(jid->count), lastUsedAt } */
	const commands = new Map();
	/** user -> { count, commands: Map(command->count), lastSeenAt } */
	const users = new Map();
	const hours = new Array(24).fill(0);
	let total = 0;
	let since = now();

	const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

	return {
		/** Record one command execution. */
		record(command, user, chat) {
			if (!command) {
				return;
			}
			const t = now();
			total++;
			hours[new Date(t).getHours()]++;
			let cmd = commands.get(command);
			if (!cmd) {
				cmd = { count: 0, users: new Map(), chats: new Map(), lastUsedAt: 0 };
				commands.set(command, cmd);
			}
			cmd.count++;
			cmd.lastUsedAt = t;
			if (user) {
				bump(cmd.users, user);
				let u = users.get(user);
				if (!u) {
					u = { count: 0, commands: new Map(), lastSeenAt: 0 };
					users.set(user, u);
				}
				u.count++;
				u.lastSeenAt = t;
				bump(u.commands, command);
			}
			if (chat) {
				bump(cmd.chats, chat);
			}
		},
		/** Router middleware: `router.use(stats.middleware())`. */
		middleware() {
			return async (ctx, next) => {
				this.record(ctx.command, ctx.sender, ctx.jid);
				await next();
			};
		},
		getTopCommands(limit = 10) {
			return [...commands]
				.map(([command, c]) => ({ command, count: c.count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, limit);
		},
		getTopUsers(limit = 10) {
			return [...users]
				.map(([user, u]) => ({ user, count: u.count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, limit);
		},
		/** 24 numbers — command volume per local hour-of-day. */
		getBusiestHours: () => [...hours],
		getCommandStats(command) {
			const c = commands.get(command);
			if (!c) {
				return null;
			}
			return {
				command,
				count: c.count,
				users: c.users.size,
				chats: c.chats.size,
				lastUsedAt: c.lastUsedAt,
				topUsers: [...c.users].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([user, count]) => ({ user, count }))
			};
		},
		getUserStats(user) {
			const u = users.get(user);
			if (!u) {
				return null;
			}
			return {
				user,
				count: u.count,
				lastSeenAt: u.lastSeenAt,
				commands: [...u.commands].sort((a, b) => b[1] - a[1]).map(([command, count]) => ({ command, count }))
			};
		},
		get totalCommands() {
			return total;
		},
		get trackingSince() {
			return since;
		},
		toJSON() {
			return {
				since,
				total,
				hours: [...hours],
				commands: [...commands].map(([name, c]) => [name, { count: c.count, lastUsedAt: c.lastUsedAt, users: [...c.users], chats: [...c.chats] }]),
				users: [...users].map(([jid, u]) => [jid, { count: u.count, lastSeenAt: u.lastSeenAt, commands: [...u.commands] }])
			};
		},
		load(snapshot) {
			commands.clear();
			users.clear();
			hours.fill(0);
			total = snapshot?.total || 0;
			since = snapshot?.since || now();
			(snapshot?.hours || []).forEach((v, i) => {
				if (i < 24) {
					hours[i] = v;
				}
			});
			for (const [name, c] of snapshot?.commands || []) {
				commands.set(name, { count: c.count, lastUsedAt: c.lastUsedAt, users: new Map(c.users), chats: new Map(c.chats) });
			}
			for (const [jid, u] of snapshot?.users || []) {
				users.set(jid, { count: u.count, lastSeenAt: u.lastSeenAt, commands: new Map(u.commands) });
			}
		},
		clear() {
			commands.clear();
			users.clear();
			hours.fill(0);
			total = 0;
			since = now();
		}
	};
};
