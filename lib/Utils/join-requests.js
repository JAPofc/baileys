/**
 * Join-request manager — handle group membership requests automatically:
 * approve allowlisted numbers, reject denylisted ones, or route everything
 * through your own callback.
 *
 * ```js
 * import { createJoinRequestManager } from '@japofc/baileys'
 *
 * const joins = createJoinRequestManager({
 *     mode: 'manual',                    // or 'approve-all' / 'reject-all'
 *     denylist: ['62812…@s.whatsapp.net']
 * })
 * joins.bind(sock) // reacts to the live 'group.join-request' event
 *
 * joins.onRequest(async ({ chat, user, approve, reject }) => {
 *     // your logic — e.g. ask the admins, check a database…
 *     await approve()                    // or reject()
 * })
 * joins.onProcessed(({ chat, user, action }) => console.log(action, user))
 *
 * // or sweep the pending list on demand (no event needed):
 * await joins.sweep(sock, groupJid)
 * ```
 */

export const createJoinRequestManager = (options = {}) => {
	const {
		mode = 'manual', // 'manual' | 'approve-all' | 'reject-all'
		allowlist = [],
		denylist = [],
		groups
	} = options;

	const allowed = new Set(allowlist);
	const denied = new Set(denylist);
	const watchedGroups = groups ? new Set(groups) : null;
	const requestCbs = new Set();
	const processedCbs = new Set();
	const errorCbs = new Set();
	let boundSock = null;
	let boundHandler = null;
	let processedCount = 0;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break event handling
			}
		}
	};

	const act = async (sock, chat, user, action) => {
		try {
			await sock.groupRequestParticipantsUpdate(chat, [user], action);
			processedCount++;
			emit(processedCbs, { chat, user, action });
			return true;
		} catch (error) {
			emit(errorCbs, { chat, user, action, error });
			return false;
		}
	};

	/** Decide for one request. Returns 'approve' | 'reject' | null (manual). */
	const decide = (user) => {
		if (denied.has(user)) {
			return 'reject';
		}
		if (allowed.has(user)) {
			return 'approve';
		}
		if (mode === 'approve-all') {
			return 'approve';
		}
		if (mode === 'reject-all') {
			return 'reject';
		}
		return null;
	};

	/** Handler for the `group.join-request` event. */
	const handler = async (update, sock = boundSock) => {
		if (!update || update.action === 'revoked') {
			return;
		}
		const chat = update.id;
		const user = update.participant;
		if (!chat || !user) {
			return;
		}
		if (watchedGroups && !watchedGroups.has(chat)) {
			return;
		}
		const verdict = decide(user);
		if (verdict) {
			if (sock) {
				await act(sock, chat, user, verdict);
			}
			return;
		}
		emit(requestCbs, {
			chat,
			user,
			method: update.method,
			author: update.author,
			approve: () => act(sock, chat, user, 'approve'),
			reject: () => act(sock, chat, user, 'reject')
		});
	};

	return {
		handler,
		decide,
		bind(sock) {
			boundSock = sock;
			boundHandler = (update) => {
				handler(update, sock).catch(() => { });
			};
			sock.ev.on('group.join-request', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('group.join-request', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		/**
		 * Fetch the pending list for a group and process it with the same
		 * rules. Returns `{ approved, rejected, pending }` (jids).
		 */
		async sweep(sock, groupJid) {
			const list = await sock.groupRequestParticipantsList(groupJid);
			const approved = [];
			const rejected = [];
			const pending = [];
			for (const req of list || []) {
				const user = req.jid || req.id || req.participant;
				if (!user) {
					continue;
				}
				const verdict = decide(user);
				if (verdict === 'approve') {
					if (await act(sock, groupJid, user, 'approve')) {
						approved.push(user);
					}
				} else if (verdict === 'reject') {
					if (await act(sock, groupJid, user, 'reject')) {
						rejected.push(user);
					}
				} else {
					pending.push(user);
					emit(requestCbs, {
						chat: groupJid,
						user,
						approve: () => act(sock, groupJid, user, 'approve'),
						reject: () => act(sock, groupJid, user, 'reject')
					});
				}
			}
			return { approved, rejected, pending };
		},
		allow(jid) {
			denied.delete(jid);
			allowed.add(jid);
		},
		deny(jid) {
			allowed.delete(jid);
			denied.add(jid);
		},
		onRequest(cb) {
			requestCbs.add(cb);
			return () => requestCbs.delete(cb);
		},
		onProcessed(cb) {
			processedCbs.add(cb);
			return () => processedCbs.delete(cb);
		},
		onError(cb) {
			errorCbs.add(cb);
			return () => errorCbs.delete(cb);
		},
		get processedCount() {
			return processedCount;
		}
	};
};
