/**
 * Call log — full call history from the `call` event: who called, when,
 * what happened (accepted/rejected/timeout), and how long it lasted.
 *
 * ```js
 * import { createCallLog } from '@japofc/baileys'
 *
 * const callLog = createCallLog()
 * callLog.bind(sock)
 *
 * callLog.getHistory()                    // newest first
 * callLog.getHistory({ from: jid })       // one caller
 * callLog.getCallerStats(jid)             // { calls, video, outcomes, totalDurationMs }
 * callLog.onEnded(({ from, outcome, durationMs }) =>
 *     console.log(from, outcome, Math.round(durationMs / 1000) + 's'))
 * ```
 *
 * Duration is measured offer→terminate on the same call id. Works next to
 * createCallGuard — this one only observes.
 */

const DEFAULT_MAX_ENTRIES = 500;

export const createCallLog = (options = {}) => {
	const { maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = options;

	/** call id -> entry { id, from, chatId, isVideo, isGroup, offerAt, endedAt, outcome, statuses[] } */
	const entries = new Map();
	const endedCbs = new Set();
	let boundSock = null;
	let boundHandler = null;

	const emit = (payload) => {
		for (const cb of endedCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors must not break call handling
			}
		}
	};

	const outcomeOf = (status) => {
		if (status === 'accept') {
			return 'accepted';
		}
		if (status === 'reject') {
			return 'rejected';
		}
		if (status === 'timeout') {
			return 'missed';
		}
		return null;
	};

	/** Handler for the `call` event. */
	const handler = (events) => {
		for (const call of events || []) {
			if (!call?.id) {
				continue;
			}
			let entry = entries.get(call.id);
			if (!entry) {
				entry = {
					id: call.id,
					from: call.from,
					chatId: call.chatId,
					isVideo: !!call.isVideo,
					isGroup: !!call.isGroup,
					offerAt: null,
					endedAt: null,
					outcome: 'ongoing',
					statuses: []
				};
				entries.set(call.id, entry);
				while (entries.size > maxEntries) {
					const oldest = entries.keys().next().value;
					entries.delete(oldest);
				}
			}
			entry.statuses.push(call.status);
			if (call.status === 'offer') {
				entry.offerAt = now();
				entry.isVideo = !!call.isVideo;
				entry.isGroup = !!call.isGroup;
			}
			const mapped = outcomeOf(call.status);
			if (mapped) {
				entry.outcome = mapped;
			}
			if (call.status === 'terminate') {
				entry.endedAt = now();
				if (entry.outcome === 'ongoing') {
					entry.outcome = 'ended';
				}
				const durationMs = entry.offerAt ? entry.endedAt - entry.offerAt : 0;
				emit({ ...entry, durationMs });
			}
		}
	};

	return {
		handler,
		bind(sock) {
			boundSock = sock;
			boundHandler = handler;
			sock.ev.on('call', boundHandler);
			return () => this.unbind();
		},
		unbind() {
			if (boundSock && boundHandler) {
				boundSock.ev.off('call', boundHandler);
			}
			boundSock = null;
			boundHandler = null;
		},
		onEnded(cb) {
			endedCbs.add(cb);
			return () => endedCbs.delete(cb);
		},
		/** Newest-first history, optionally filtered by caller. */
		getHistory({ from, limit = 50 } = {}) {
			const list = [...entries.values()]
				.filter(e => !from || e.from === from)
				.reverse()
				.slice(0, limit);
			return list.map(e => ({ ...e, statuses: [...e.statuses] }));
		},
		getCallerStats(from) {
			const mine = [...entries.values()].filter(e => e.from === from);
			if (!mine.length) {
				return null;
			}
			const outcomes = {};
			let totalDurationMs = 0;
			let video = 0;
			for (const e of mine) {
				outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1;
				if (e.isVideo) {
					video++;
				}
				if (e.offerAt && e.endedAt) {
					totalDurationMs += e.endedAt - e.offerAt;
				}
			}
			return { from, calls: mine.length, video, outcomes, totalDurationMs };
		},
		get size() {
			return entries.size;
		},
		toJSON() {
			return { entries: [...entries.values()] };
		},
		load(snapshot) {
			entries.clear();
			for (const entry of snapshot?.entries || []) {
				entries.set(entry.id, { ...entry, statuses: [...(entry.statuses || [])] });
			}
		},
		clear() {
			entries.clear();
		}
	};
};
