// Minimal harness: run the real appStateSyncStatus implementation against a fake auth store
// by extracting it from lib/Socket/chats.js (building a whole socket needs a live connection).
import { readFileSync } from 'node:fs'
import { Boom } from '@hapi/boom'
import { ALL_WA_PATCH_NAMES } from '../../lib/index.js'
import { ensureLTHashStateVersion } from '../../lib/Utils/index.js'

const src = readFileSync(new URL('../../lib/Socket/chats.js', import.meta.url), 'utf8')
const start = src.indexOf('const appStateSyncStatus = async')
const end = src.indexOf('\n    };', start) + '\n    };'.length
const body = src.slice(start, end)

export const makeAppStateSyncStatus = authState =>
	new Function('Boom', 'ALL_WA_PATCH_NAMES', 'ensureLTHashStateVersion', 'authState',
		`${body}\nreturn appStateSyncStatus`)(Boom, ALL_WA_PATCH_NAMES, ensureLTHashStateVersion, authState)

export const makeChatsSocketStatus = async () => {
	const stored = {
		regular_high: { version: 41, hash: Buffer.alloc(128), indexValueMap: { a: 1, b: 2 } }
	}
	const authState = { keys: { get: async (_type, names) => Object.fromEntries(names.map(n => [n, stored[n]])) } }
	return makeAppStateSyncStatus(authState)()
}
