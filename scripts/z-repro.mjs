/**
 * scripts/z-repro.mjs --- batch Z repro for BUGREPORT 2.63
 *
 * A: the gate itself. `shouldSyncHistoryMessage: () => false` (the standard way to skip the
 *    initial history sync) used to also veto **ON_DEMAND** notifications -- which only ever
 *    arrive as the answer to an explicit `fetchMessageHistory()` call.
 * B: the consequence inside `processMessage()`: with the gate closed the payload is never
 *    even downloaded, so no `messaging-history.set` can ever fire.
 * C: `processedHistoryMessages` must still ignore on-demand chunks (upstream
 *    `// TODO: investigate`), because `isLatest` is derived from that list being empty.
 *
 * Run: node scripts/z-repro.mjs
 */
import { proto } from '../WAProto/index.js';
import { PROCESSABLE_HISTORY_TYPES } from '../lib/Defaults/index.js';
import {
	isOnDemandHistorySync,
	recordsProcessedHistoryMessage,
	shouldProcessHistorySyncNotification
} from '../lib/Utils/history-sync-gate.js';
import processMessage from '../lib/Utils/process-message.js';

const { HistorySyncType } = proto.HistorySync;
const onDemand = { syncType: HistorySyncType.ON_DEMAND, chunkOrder: 1, peerDataRequestSessionId: 'sess-1' };
const recent = { syncType: HistorySyncType.RECENT, chunkOrder: 1 };

/** the pre-fix gate, inlined verbatim from chats.js */
const beforeGate = (historyMsg, shouldSyncHistoryMessage) =>
	historyMsg ? shouldSyncHistoryMessage(historyMsg) && PROCESSABLE_HISTORY_TYPES.includes(historyMsg.syncType) : false;

const syncOff = () => false;

console.log('=== A. gate with shouldSyncHistoryMessage: () => false ===');
for (const [label, msg] of [['ON_DEMAND (explicitly requested)', onDemand], ['RECENT (pushed by server)', recent]]) {
	console.log(
		`${label.padEnd(34)} BEFORE ${String(beforeGate(msg, syncOff)).padEnd(5)} AFTER ${shouldProcessHistorySyncNotification(msg, syncOff)}`
	);
}

console.log('\n=== B. processMessage() with the gate closed vs open ===');
const notification = {
	syncType: HistorySyncType.ON_DEMAND,
	directPath: '/x',
	mediaKey: Buffer.alloc(32),
	fileSha256: Buffer.alloc(32),
	fileEncSha256: Buffer.alloc(32),
	chunkOrder: 1,
	peerDataRequestSessionId: 'sess-1'
};
const mkMsg = () => ({
	key: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: true },
	messageTimestamp: 1,
	message: {
		protocolMessage: {
			type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
			historySyncNotification: notification
		}
	}
});

for (const gate of [false, true]) {
	const events = [];
	let downloaded = false;
	try {
		await processMessage(mkMsg(), {
			shouldProcessHistoryMsg: gate,
			ev: { emit: (e) => events.push(e) },
			creds: { me: { id: '1@s.whatsapp.net' } },
			signalRepository: { lidMapping: { storeLIDPNMappings: async () => {} } },
			keyStore: {},
			options: {},
			getMessage: async () => undefined
		});
	} catch (err) {
		downloaded = /fetch stream/i.test(err.message);
	}

	console.log(`gate=${String(gate).padEnd(5)} download attempted: ${downloaded} | events: ${events.length ? events.join(',') : '(none)'}`);
}

console.log('   BEFORE: with sync disabled the gate was `false` -> the requested chunk was dropped in silence.');
console.log('   AFTER : the gate is `true` for ON_DEMAND -> the chunk is downloaded and emitted.');

console.log('\n=== C. processedHistoryMessages / isLatest bookkeeping is unchanged ===');
console.log('ON_DEMAND recorded?', recordsProcessedHistoryMessage(onDemand), '| RECENT recorded?', recordsProcessedHistoryMessage(recent));
console.log('isOnDemandHistorySync(raw sync type):', isOnDemandHistorySync(HistorySyncType.ON_DEMAND));
