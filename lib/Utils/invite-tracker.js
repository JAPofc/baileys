/**
 * Invite tracker — who brings people in: counts every group add by its
 * author ("top inviter" leaderboards, invite-reward events).
 *
 * ```js
 * import { createInviteTracker } from '@japofc/baileys'
 *
 * const invites = createInviteTracker()
 * invites.bind(sock)   // listens to group-participants.update
 *
 * invites.onInvite(({ chat, inviter, invited }) => eco.add(inviter, 500, 'invite reward'))
 * invites.getCount(chat, inviter)          // adds credited in this chat
 * invites.getInviter(chat, member)         // who brought this member
 * invites.getLeaderboard(chat, 10)         // top inviters
 * invites.renderLeaderboard(chat)          // 🥇 @a — 12 invites …
 * ```
 *
 * Leaves are tracked too: a member who leaves subtracts from `active`
 * (invite farming with join/leave loops stops paying).
 */

export const createInviteTracker = (options = {}) => {
	const { now = () => Date.now() } = options;

	/** chat -> { byInviter: Map(inviter -> { total, active }), byMember: Map(member -> inviter) } */
	const chats = new Map();
	const inviteCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (payload) => {
		for (const cb of inviteCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const bucket = (chat) => {
		let entry = chats.get(chat);
		if (!entry) {
			entry = { byInviter: new Map(), byMember: new Map() };
			chats.set(chat, entry);
		}
		return entry;
	};

	/** Handler for `group-participants.update`. */
	const handler = (update) => {
		const chat = update?.id;
		if (!chat || !Array.isArray(update.participants)) {
			return;
		}
		const entry = bucket(chat);
		if (update.action === 'add' && update.author) {
			for (const member of update.participants) {
				if (member === update.author) {
					continue; // self-joins credit nobody
				}
				// JAP@Fix: a member already tracked as present must not be credited
				// again. WhatsApp re-emits group-participants.update (and history /
				// app-state sync replays it), so a duplicate 'add' for a still-present
				// member used to double-fire onInvite (double invite reward) and inflate
				// `active` past 1 for a single membership. A genuine re-add after a leave
				// is unaffected: 'remove' deletes the byMember entry, so the member is no
				// longer present and gets credited again.
				if (entry.byMember.has(member)) {
					continue;
				}
				entry.byMember.set(member, update.author);
				let stats = entry.byInviter.get(update.author);
				if (!stats) {
					stats = { total: 0, active: 0 };
					entry.byInviter.set(update.author, stats);
				}
				stats.total++;
				stats.active++;
				emit({ chat, inviter: update.author, invited: member, at: now() });
			}
		} else if (update.action === 'remove') {
			for (const member of update.participants) {
				const inviter = entry.byMember.get(member);
				if (inviter) {
					entry.byMember.delete(member);
					const stats = entry.byInviter.get(inviter);
					if (stats && stats.active > 0) {
						stats.active--;
					}
				}
			}
		}
	};

	return {
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = handler;
			sock.ev.on('group-participants.update', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('group-participants.update', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		onInvite(cb) {
			inviteCbs.add(cb);
			return () => inviteCbs.delete(cb);
		},
		/** { total, active } adds credited to an inviter in a chat. */
		getCount(chat, inviter) {
			const stats = chats.get(chat)?.byInviter.get(inviter);
			return stats ? { ...stats } : { total: 0, active: 0 };
		},
		/** Who brought this member in (null for unknown/founders). */
		getInviter(chat, member) {
			return chats.get(chat)?.byMember.get(member) ?? null;
		},
		/** Top inviters by ACTIVE invites (join/leave loops don't pay). */
		getLeaderboard(chat, limit = 10) {
			return [...(chats.get(chat)?.byInviter || [])]
				.map(([inviter, s]) => ({ inviter, ...s }))
				.sort((a, b) => b.active - a.active || b.total - a.total)
				.slice(0, limit);
		},
		/**
		 * JAP@Upgrade: an inviter's combined { total, active } across ALL chats —
		 * for bots that reward inviting anywhere, not just per group.
		 */
		getGlobalCount(inviter) {
			let total = 0;
			let active = 0;
			for (const entry of chats.values()) {
				const s = entry.byInviter.get(inviter);
				if (s) {
					total += s.total;
					active += s.active;
				}
			}
			return { total, active };
		},
		/** JAP@Upgrade: top inviters aggregated across every tracked chat. */
		getGlobalLeaderboard(limit = 10) {
			const totals = new Map();
			for (const entry of chats.values()) {
				for (const [inviter, s] of entry.byInviter) {
					const acc = totals.get(inviter) || { total: 0, active: 0 };
					acc.total += s.total;
					acc.active += s.active;
					totals.set(inviter, acc);
				}
			}
			return [...totals]
				.map(([inviter, s]) => ({ inviter, ...s }))
				.sort((a, b) => b.active - a.active || b.total - a.total)
				.slice(0, limit);
		},
		renderLeaderboard(chat, { title = '📨 *Top Inviter*', limit = 10 } = {}) {
			const rows = this.getLeaderboard(chat, limit);
			if (!rows.length) {
				return `${title}\n(belum ada data)`;
			}
			const medals = ['🥇', '🥈', '🥉'];
			const lines = rows.map((r, i) =>
				`${medals[i] || `${i + 1}.`} @${String(r.inviter).split('@')[0]} — ${r.active} aktif (${r.total} total)`);
			return `${title}\n${lines.join('\n')}`;
		},
		toJSON() {
			return {
				entries: [...chats].map(([chat, e]) => [chat, {
					byInviter: [...e.byInviter],
					byMember: [...e.byMember]
				}])
			};
		},
		load(snapshot) {
			chats.clear();
			for (const [chat, e] of snapshot?.entries || []) {
				chats.set(chat, {
					byInviter: new Map((e.byInviter || []).map(([k, v]) => [k, { ...v }])),
					byMember: new Map(e.byMember || [])
				});
			}
		},
		get size() {
			return chats.size;
		}
	};
};
