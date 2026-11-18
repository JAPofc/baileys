// §2.101 repro -- migrateSession() refuses to migrate anything when the `device-list` cache
// entry for the user is missing, even though the very session it was asked to migrate exists.
//
// `device-list` is only ever written by getUSyncDevices() after a *fetch*; a session restored
// from disk, or one whose devices came back from the device cache, has no entry. In that case
// migrateSession() returns early -> the PN session is never moved to the LID address -> the
// next LID-addressed send has no session and has to re-fetch keys.
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'
import { makeCacheableSignalKeyStore } from '../lib/Utils/index.js'
import libsignal from 'libsignal'

const PN = '628111', LID = '99881'

const makeSession = async () => {
	// a serialized, OPEN session record for 628111.0 (shape libsignal.SessionRecord.deserialize wants)
	const b64 = n => Buffer.alloc(n, 7).toString('base64')
	const kp = libsignal.curve.generateKeyPair()
	return {
		version: 'v1',
		_sessions: {
			AAAA: {
				registrationId: 1,
				currentRatchet: {
					ephemeralKeyPair: { pubKey: kp.pubKey.toString('base64'), privKey: kp.privKey.toString('base64') },
					lastRemoteEphemeralKey: b64(33),
					previousCounter: 0,
					rootKey: b64(32)
				},
				indexInfo: { baseKey: b64(33), baseKeyType: 1, closed: -1, used: Date.now(), created: Date.now(), remoteIdentityKey: b64(33) },
				_chains: {}
			}
		}
	}
}

const run = async ({ withDeviceList }) => {
	const store = { session: { [`${PN}.0`]: await makeSession() }, 'device-list': withDeviceList ? { [PN]: ['0'] } : {} }
	const keys = {
		get: async (type, ids) => Object.fromEntries(ids.map(id => [id, store[type]?.[id]])),
		set: async data => { for (const t in data) { store[t] = store[t] || {}; Object.assign(store[t], data[t]) } },
		transaction: async fn => fn(),
		isInTransaction: () => false
	}
	const logger = { debug() {}, info() {}, warn() {}, error() {}, trace() {}, child: () => logger, level: 'silent' }
	const repo = makeLibSignalRepository({ creds: { me: { id: `${PN}@s.whatsapp.net` } }, keys }, logger)
	const res = await repo.migrateSession(`${PN}@s.whatsapp.net`, `${LID}@lid`)
	repo.close?.()
	return { res, hasLidSession: !!store.session[`${LID}_1.0`] || Object.keys(store.session).some(k => k.startsWith(LID)) }
}

console.log('device-list present :', JSON.stringify(await run({ withDeviceList: true })))
console.log('device-list missing :', JSON.stringify(await run({ withDeviceList: false })), ' ← *** nothing migrated, yet the session is right there ***')
