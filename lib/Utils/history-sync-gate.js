/**
 * history-sync-gate.js --- JAP@Fix (§2.63 / v2.4.7)
 *
 * Two *different* questions used to be answered by one boolean:
 *
 *  1. "should we passively ingest the history the server pushes at us?" -- a user
 *     preference (`shouldSyncHistoryMessage`), which also drives the connection's
 *     `Syncing` state, the app-state sync and the event-buffer flush;
 *  2. "may we process this history payload at all?" -- which, for an **ON_DEMAND**
 *     notification, is not a preference: that payload only ever arrives as the answer to an
 *     explicit `fetchMessageHistory()` / `requestPlaceholderResend()` call the user just
 *     made.
 *
 * Collapsing the two meant `shouldSyncHistoryMessage: () => false` -- the standard way to
 * skip the initial sync -- silently discarded on-demand responses as well, so
 * `fetchMessageHistory()` could never deliver anything.
 */
import { proto } from '../../WAProto/index.js';
import { PROCESSABLE_HISTORY_TYPES } from '../Defaults/index.js';

const syncTypeOf = (historyMsg) =>
	typeof historyMsg === 'number' ? historyMsg : historyMsg && typeof historyMsg === 'object' ? historyMsg.syncType : undefined;

/** Sync types that only ever arrive because the client explicitly asked for them. */
export const EXPLICITLY_REQUESTED_HISTORY_TYPES = Object.freeze([proto.HistorySync.HistorySyncType.ON_DEMAND]);

/** Whether this notification (or raw sync type) is the answer to an explicit request. */
export const isOnDemandHistorySync = (historyMsg) => {
	const syncType = syncTypeOf(historyMsg);
	return syncType !== undefined && syncType !== null && EXPLICITLY_REQUESTED_HISTORY_TYPES.includes(syncType);
};

/** Whether the library knows how to handle this sync type at all. */
export const isProcessableHistorySyncType = (historyMsg) => {
	const syncType = syncTypeOf(historyMsg);
	return syncType !== undefined && syncType !== null && PROCESSABLE_HISTORY_TYPES.includes(syncType);
};

/**
 * Whether a history notification may be downloaded and turned into
 * `messaging-history.set`. Honours the user's preference for *pushed* history, but never
 * lets it swallow a payload the user explicitly asked for.
 */
export const shouldProcessHistorySyncNotification = (historyMsg, shouldSyncHistoryMessage) => {
	if (!historyMsg || !isProcessableHistorySyncType(historyMsg)) {
		return false;
	}

	if (isOnDemandHistorySync(historyMsg)) {
		return true;
	}

	return typeof shouldSyncHistoryMessage === 'function' ? !!shouldSyncHistoryMessage(historyMsg) : !!shouldSyncHistoryMessage;
};

/**
 * Whether this notification belongs in `creds.processedHistoryMessages`. On-demand chunks
 * do not: that list tracks the *initial* sync's progress (`isLatest` is derived from it),
 * and appending a user-triggered back-fill to it would make a later reconnect believe the
 * initial sync had already happened. This is the answer to the upstream
 * `// TODO: investigate` on the same condition.
 */
export const recordsProcessedHistoryMessage = (historyMsg) => !isOnDemandHistorySync(historyMsg);
