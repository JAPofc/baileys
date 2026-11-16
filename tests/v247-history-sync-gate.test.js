/**
 * tests/v247-history-sync-gate.test.js — batch Z (v2.4.7)
 *
 * Covers BUGREPORT §2.63: `shouldSyncHistoryMessage: () => false` also vetoed ON_DEMAND
 * history notifications, so `fetchMessageHistory()` could never deliver anything.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { proto } from '../WAProto/index.js';
import {
	EXPLICITLY_REQUESTED_HISTORY_TYPES,
	isOnDemandHistorySync,
	isProcessableHistorySyncType,
	recordsProcessedHistoryMessage,
	shouldProcessHistorySyncNotification
} from '../lib/Utils/index.js';
import processMessage from '../lib/Utils/process-message.js';

const { HistorySyncType } = proto.HistorySync;
const onDemand = { syncType: HistorySyncType.ON_DEMAND, chunkOrder: 1, peerDataRequestSessionId: 's1' };
const recent = { syncType: HistorySyncType.RECENT };
const syncOff = () => false;
const syncOn = () => true;

describe('§2.63 an explicitly requested history chunk is never vetoed by the sync preference', () => {
	it('ON_DEMAND passes even with history sync fully disabled', () => {
		assert.equal(shouldProcessHistorySyncNotification(onDemand, syncOff), true);
	});

	it('pushed history still obeys the preference', () => {
		assert.equal(shouldProcessHistorySyncNotification(recent, syncOff), false);
		assert.equal(shouldProcessHistorySyncNotification(recent, syncOn), true);
		assert.equal(shouldProcessHistorySyncNotification({ syncType: HistorySyncType.FULL },
			({ syncType }) => syncType !== HistorySyncType.FULL), false, 'the library default still skips FULL');
	});

	it('an unprocessable or absent notification is still refused', () => {
		assert.equal(shouldProcessHistorySyncNotification(undefined, syncOn), false);
		assert.equal(shouldProcessHistorySyncNotification(null, syncOn), false);
		assert.equal(shouldProcessHistorySyncNotification({}, syncOn), false);
		assert.equal(shouldProcessHistorySyncNotification({ syncType: 999 }, syncOn), false);
	});

	it('accepts a plain boolean preference as well as a predicate', () => {
		assert.equal(shouldProcessHistorySyncNotification(recent, true), true);
		assert.equal(shouldProcessHistorySyncNotification(recent, false), false);
		assert.equal(shouldProcessHistorySyncNotification(recent, undefined), false);
		assert.equal(shouldProcessHistorySyncNotification(onDemand, undefined), true);
	});

	it('the preference predicate receives the notification itself', () => {
		const seen = [];
		shouldProcessHistorySyncNotification(recent, (msg) => {
			seen.push(msg);
			return true;
		});
		assert.deepEqual(seen, [recent]);
	});
});

describe('history-sync-gate helpers (v2.4.7 upgrade)', () => {
	it('classifies on-demand payloads, from an object or a raw sync type', () => {
		assert.equal(isOnDemandHistorySync(onDemand), true);
		assert.equal(isOnDemandHistorySync(HistorySyncType.ON_DEMAND), true);
		assert.equal(isOnDemandHistorySync(recent), false);
		assert.equal(isOnDemandHistorySync(undefined), false);
		assert.equal(isOnDemandHistorySync(null), false);
		assert.equal(isOnDemandHistorySync({}), false);
	});

	it('knows which sync types the library can handle', () => {
		assert.equal(isProcessableHistorySyncType(recent), true);
		assert.equal(isProcessableHistorySyncType(HistorySyncType.INITIAL_BOOTSTRAP), true);
		assert.equal(isProcessableHistorySyncType({ syncType: 999 }), false);
		assert.equal(isProcessableHistorySyncType(null), false);
	});

	it('keeps on-demand chunks out of processedHistoryMessages', () => {
		assert.equal(recordsProcessedHistoryMessage(onDemand), false);
		assert.equal(recordsProcessedHistoryMessage(recent), true);
		assert.equal(recordsProcessedHistoryMessage(undefined), true);
	});

	it('exposes the frozen table', () => {
		assert.deepEqual([...EXPLICITLY_REQUESTED_HISTORY_TYPES], [HistorySyncType.ON_DEMAND]);
		assert.throws(() => EXPLICITLY_REQUESTED_HISTORY_TYPES.push(1));
	});
});

describe('§2.63 wiring', () => {
	const notification = {
		syncType: HistorySyncType.ON_DEMAND,
		directPath: '/x',
		mediaKey: Buffer.alloc(32),
		fileSha256: Buffer.alloc(32),
		fileEncSha256: Buffer.alloc(32),
		chunkOrder: 1,
		peerDataRequestSessionId: 's1'
	};
	const mkMsg = (histNotification = notification) => ({
		key: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: true },
		messageTimestamp: 1,
		message: {
			protocolMessage: {
				type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
				historySyncNotification: histNotification
			}
		}
	});
	const run = async (gate, histNotification) => {
		const events = [];
		let attemptedDownload = false;
		try {
			await processMessage(mkMsg(histNotification), {
				shouldProcessHistoryMsg: gate,
				ev: { emit: (event, data) => events.push([event, data]) },
				creds: { me: { id: '1@s.whatsapp.net' } },
				signalRepository: { lidMapping: { storeLIDPNMappings: async () => {} } },
				keyStore: {},
				options: {},
				getMessage: async () => undefined
			});
		} catch (err) {
			attemptedDownload = /fetch stream/i.test(err.message);
		}

		return { events, attemptedDownload };
	};

	it('a closed gate drops the chunk without even downloading it', async () => {
		const { events, attemptedDownload } = await run(false);
		assert.equal(attemptedDownload, false);
		assert.equal(events.length, 0);
	});

	it('an open gate downloads the chunk', async () => {
		const { attemptedDownload } = await run(true);
		assert.equal(attemptedDownload, true);
	});

	it('an on-demand chunk does not touch processedHistoryMessages', async () => {
		const { events } = await run(true);
		assert.equal(events.filter(([e]) => e === 'creds.update').length, 0);
	});

	it('a pushed chunk still records its progress before downloading', async () => {
		const { events } = await run(true, { ...notification, syncType: HistorySyncType.RECENT });
		const creds = events.find(([e]) => e === 'creds.update');
		assert.ok(creds, 'creds.update should fire for pushed history');
		assert.equal(creds[1].processedHistoryMessages.length, 1);
	});

	it('chats.js gates the payload separately from the connection state', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Socket/chats.js', import.meta.url), 'utf8');
		assert.match(source, /shouldProcessHistoryPayload = shouldProcessHistorySyncNotification\(/);
		assert.match(source, /shouldProcessHistoryMsg: shouldProcessHistoryPayload/);
		// the connection-state decision must keep using the user's preference verbatim
		assert.match(source, /if \(shouldProcessHistoryMsg\) \{/);
	});

	it('process-message.js no longer carries the TODO on this condition', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Utils/process-message.js', import.meta.url), 'utf8');
		assert.match(source, /if \(recordsProcessedHistoryMessage\(histNotification\)\) \{/);
		assert.doesNotMatch(source, /^\s*\/\/ TODO: investigate$/m);
	});
});
