// Minimal harness: run the real getUSyncDevices() out of lib/Socket/messages-send.js against a
// fake USync backend (building a whole socket needs a live connection).
import { readFileSync } from 'node:fs';
import { jidDecode, jidEncode, jidNormalizedUser, isLidUser, isHostedLidUser } from '../../lib/WABinary/index.js';
import { extractDeviceJids, dedupeJidsByUser, dedupeDeviceList } from '../../lib/Utils/index.js';
import { USyncQuery, USyncUser } from '../../lib/WAUSync/index.js';

const src = readFileSync(new URL('../../lib/Socket/messages-send.js', import.meta.url), 'utf8');
const start = src.indexOf('const getUSyncDevices = async');
const end = src.indexOf('\n    };', start) + '\n    };'.length;
const body = src.slice(start, end);

/**
 * @param {object} opts
 * @param {(query:any)=>Promise<any>} opts.executeUSyncQuery returns `{ list }`
 * @param {Map<string, any[]>} [opts.cache] backing store for the device cache
 */
export const makeGetUSyncDevices = ({ executeUSyncQuery, cache = new Map(), me = '1@s.whatsapp.net', meLid = '11@lid' } = {}) => {
	const calls = { usync: 0, assertSessions: [] };
	const userDevicesCache = {
		get: async key => cache.get(key),
		set: async (key, value) => void cache.set(key, value),
	};
	const scope = {
		logger: { debug() {}, trace() {}, warn() {}, info() {} },
		userDevicesCache,
		devicesMutex: { mutex: async fn => fn() },
		authState: { creds: { me: { id: me, lid: meLid } }, keys: { set: async () => {} } },
		signalRepository: { lidMapping: { storeLIDPNMappings: async () => {} } },
		assertSessions: async (jids, force) => {
			calls.assertSessions.push({ jids, force });
		},
		sock: {
			executeUSyncQuery: async query => {
				calls.usync++;
				return executeUSyncQuery(query);
			},
		},
	};

	const fn = new Function(
		'jidDecode', 'jidEncode', 'jidNormalizedUser', 'isLidUser', 'isHostedLidUser',
		'extractDeviceJids', 'dedupeJidsByUser', 'dedupeDeviceList', 'USyncQuery', 'USyncUser',
		'logger', 'userDevicesCache', 'devicesMutex', 'authState', 'signalRepository', 'assertSessions', 'sock',
		`${body}\nreturn getUSyncDevices`
	)(
		jidDecode, jidEncode, jidNormalizedUser, isLidUser, isHostedLidUser,
		extractDeviceJids, dedupeJidsByUser, dedupeDeviceList, USyncQuery, USyncUser,
		scope.logger, scope.userDevicesCache, scope.devicesMutex, scope.authState, scope.signalRepository, scope.assertSessions, scope.sock
	);

	return { getUSyncDevices: fn, calls, cache };
};

/** A USync reply for one PN user that also carries its LID, with `deviceCount` devices. */
export const usyncReply = (pn, lid, deviceCount = 2) => ({
	list: [
		{
			id: `${pn}@s.whatsapp.net`,
			lid: `${lid}@lid`,
			devices: {
				deviceList: Array.from({ length: deviceCount }, (_, i) => ({ id: i, keyIndex: i === 0 ? undefined : i, isHosted: false })),
			},
		},
	],
});
