/**
 * Group events tracker — welcome/goodbye/promote/demote callbacks plus a
 * per-group event log, built on `group-participants.update` and `groups.update`.
 *
 * ```js
 * import { createGroupEventsTracker } from '@japofc/baileys'
 *
 * const groups = createGroupEventsTracker()
 * groups.bind(sock)
 *
 * groups.onJoin(({ id, participants }) =>
 *     sock.sendMessage(id, { text: `Welcome ${participants.join(', ')}!` }))
 * groups.onLeave(({ id, participants }) => console.log('left:', participants))
 * groups.onPromote(({ participants, author }) => console.log(author, 'promoted', participants))
 * groups.onDemote(({ participants }) => console.log('demoted:', participants))
 * groups.onGroupUpdate(update => console.log('group changed:', update.subject ?? update))
 *
 * groups.getEvents('123@g.us') // recent events for that group, oldest first
 * ```
 */

const DEFAULT_MAX_EVENTS = 500;

export const createGroupEventsTracker = (options = {}) => {
	const { maxEvents = DEFAULT_MAX_EVENTS } = options;

	/** flat LRU log of events, key = incrementing seq */
	const log = new Map();
	let seq = 0;
	const cbs = {
		add: new Set(),
		remove: new Set(),
		promote: new Set(),
		demote: new Set(),
		modify: new Set(),
		any: new Set(),
		groupUpdate: new Set()
	};
	let boundSock = null;
	let boundParticipants = null;
	let boundGroups = null;

	const emit = (set, payload) => {
		for (const cb of set) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const remember = (event) => {
		log.set(++seq, event);
		while (log.size > maxEvents) {
			const oldest = log.keys().next().value;
			log.delete(oldest);
		}
	};

	/** Handler for `group-participants.update`. */
	const participantsHandler = (update) => {
		if (!update?.id || !update.action) {
			return;
		}
		const event = {
			type: 'participants',
			id: update.id,
			action: update.action,
			participants: update.participants || [],
			author: update.author,
			at: Date.now()
		};
		remember(event);
		if (cbs[update.action]) {
			emit(cbs[update.action], event);
		}
		emit(cbs.any, event);
	};

	/** Handler for `groups.update` (subject, description, settings...). */
	const groupsHandler = (updates) => {
		for (const update of updates || []) {
			if (!update?.id) {
				continue;
			}
			const event = { type: 'update', id: update.id, update, at: Date.now() };
			remember(event);
			emit(cbs.groupUpdate, event);
			emit(cbs.any, event);
		}
	};

	return {
		participantsHandler,
		groupsHandler,
		/** Wire both handlers to the socket. Returns an unbind function. */
		bind(sock) {
			boundSock = sock;
			boundParticipants = participantsHandler;
			boundGroups = groupsHandler;
			sock.ev.on('group-participants.update', boundParticipants);
			sock.ev.on('groups.update', boundGroups);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock) {
				boundSock.ev.off('group-participants.update', boundParticipants);
				boundSock.ev.off('groups.update', boundGroups);
			}
			boundSock = null;
			boundParticipants = null;
			boundGroups = null;
		},
		onJoin(cb) {
			cbs.add.add(cb);
			return () => cbs.add.delete(cb);
		},
		onLeave(cb) {
			cbs.remove.add(cb);
			return () => cbs.remove.delete(cb);
		},
		onPromote(cb) {
			cbs.promote.add(cb);
			return () => cbs.promote.delete(cb);
		},
		onDemote(cb) {
			cbs.demote.add(cb);
			return () => cbs.demote.delete(cb);
		},
		/** GROUP_PARTICIPANT_CHANGE_NUMBER etc. */
		onModify(cb) {
			cbs.modify.add(cb);
			return () => cbs.modify.delete(cb);
		},
		/** Subject/description/settings changes from `groups.update`. */
		onGroupUpdate(cb) {
			cbs.groupUpdate.add(cb);
			return () => cbs.groupUpdate.delete(cb);
		},
		/** Every event (participants + updates). */
		onAny(cb) {
			cbs.any.add(cb);
			return () => cbs.any.delete(cb);
		},
		/** Recent events, oldest first — optionally filtered by group jid. */
		getEvents(groupJid) {
			const all = [...log.values()];
			return groupJid ? all.filter(e => e.id === groupJid) : all;
		},
		get size() {
			return log.size;
		},
		clear() {
			log.clear();
		}
	};
};
