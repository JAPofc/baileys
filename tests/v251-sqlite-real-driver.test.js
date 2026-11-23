import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { useSqliteAuthState } from '../lib/Utils/use-sqlite-auth-state.js'
import { createSqliteStoreAdapter } from '../lib/Utils/PersistentStore.js'
import { SQLiteStore } from '../lib/Framework/Store/SQLiteStore.js'
import { proto } from '../WAProto/index.js'

/**
 * The SQLite paths had tests, but every behavioural one drove an INJECTED FAKE handle,
 * because `better-sqlite3` is an optional peer that nobody installed in development. The
 * real driver had therefore never executed a single line of this code — pattern 38.
 *
 * These tests use the real driver. Where it is absent they skip with a stated reason,
 * never silently; the fake-handle tests in `v2410-batch-cd.test.js` still cover the
 * contract on such machines.
 */

const driver = await (async () => {
	try {
		await import('better-sqlite3')
		return true
	} catch {
		return false
	}
})()
const needsDriver = { skip: driver ? false : 'better-sqlite3 is not installed' }

const freshDir = () => mkdtemp(join(tmpdir(), 'jap-sqlite-real-'))

describe('useSqliteAuthState against the real better-sqlite3', () => {
	it('creates a nested path, 0700 directory and 0600 database', needsDriver, async () => {
		const dir = await freshDir()
		const dbPath = join(dir, 'deep', 'nested', 'auth.db')
		try {
			const auth = await useSqliteAuthState({ dbPath })
			try {
				assert.equal((await stat(join(dir, 'deep', 'nested'))).mode & 0o777, 0o700)
				// §2.165: credentials must not sit at the process umask
				assert.equal((await stat(dbPath)).mode & 0o777, 0o600)
			} finally {
				await auth.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('survives a close and reopen with creds and keys intact', needsDriver, async () => {
		const dir = await freshDir()
		const dbPath = join(dir, 'auth.db')
		try {
			const first = await useSqliteAuthState({ dbPath })
			first.state.creds.me = { id: '628000@s.whatsapp.net', name: 'restart test' }
			await first.saveCreds()
			await first.state.keys.set({
				'pre-key': { 1: { public: Buffer.from('aabb', 'hex'), private: Buffer.from('ccdd', 'hex') } }
			})
			await first.close()

			const second = await useSqliteAuthState({ dbPath })
			try {
				assert.equal(second.state.creds.me?.name, 'restart test')
				const keys = await second.state.keys.get('pre-key', ['1'])
				assert.ok(Buffer.isBuffer(keys['1'].public), 'Buffers must survive the JSON round trip')
				assert.equal(keys['1'].public.toString('hex'), 'aabb')
			} finally {
				await second.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('restores app-state-sync keys as protobuf objects, like the file adapter', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const auth = await useSqliteAuthState({ dbPath: join(dir, 'auth.db') })
			try {
				const keyData = proto.Message.AppStateSyncKeyData.fromObject({
					keyData: Buffer.from('0123456789abcdef'),
					fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 1] },
					timestamp: 1700000000
				})
				await auth.state.keys.set({ 'app-state-sync-key': { AAAAA: keyData } })
				const back = (await auth.state.keys.get('app-state-sync-key', ['AAAAA'])).AAAAA
				assert.ok(back?.keyData?.length, 'keyData survived')
				assert.equal(back.fingerprint.rawId, 7)
			} finally {
				await auth.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('deletes a key when it is set to null, and leaves its neighbour alone', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const auth = await useSqliteAuthState({ dbPath: join(dir, 'auth.db') })
			try {
				await auth.state.keys.set({
					'pre-key': { 1: { public: Buffer.from('01', 'hex') }, 2: { public: Buffer.from('02', 'hex') } }
				})
				await auth.state.keys.set({ 'pre-key': { 1: null } })
				const got = await auth.state.keys.get('pre-key', ['1', '2'])
				assert.ok(got['1'] === undefined || got['1'] === null, 'null means delete')
				assert.ok(got['2'], 'the neighbour must stay')
			} finally {
				await auth.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('handles twenty concurrent writes without losing one', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const auth = await useSqliteAuthState({ dbPath: join(dir, 'auth.db') })
			try {
				await Promise.all(
					Array.from({ length: 20 }, (_, i) => auth.state.keys.set({ session: { ['s' + i]: { v: i } } }))
				)
				const all = await auth.state.keys.get('session', Array.from({ length: 20 }, (_, i) => 's' + i))
				assert.equal(Object.values(all).filter(Boolean).length, 20)
			} finally {
				await auth.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('a caller-owned handle is never closed by us', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const Database = (await import('better-sqlite3')).default
			const db = new Database(join(dir, 'owned.db'))
			const auth = await useSqliteAuthState({ database: db })
			await auth.close()
			assert.equal(db.open, true, 'a handle we did not open must not be closed')
			db.close()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('§2.215 a store adapter used before init() says so', () => {
	it('sqlite: the error names the problem instead of "reading \'get\'"', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const adapter = await createSqliteStoreAdapter({ dbPath: join(dir, 'store.db') })
			await assert.rejects(() => adapter.get('chats', 'x'), err => {
				assert.doesNotMatch(err.message, /Cannot read properties of undefined/)
				assert.match(err.message, /init\(\)/)
				return true
			})
			// and after init it simply works
			await adapter.init()
			await adapter.set('chats', 'c1', { id: 'c1', blob: Buffer.from('ff', 'hex') })
			const got = await adapter.get('chats', 'c1')
			assert.ok(Buffer.isBuffer(got.blob), 'BufferJSON reviver ran')
			assert.deepEqual(await adapter.listDomains(), ['chats'])
			await adapter.delete('chats', 'c1')
			assert.equal(await adapter.get('chats', 'c1'), undefined)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('Framework SQLiteStore against the real driver', () => {
	it('round-trips JSON, deletes, and tolerates a legacy non-JSON row', needsDriver, async () => {
		const dir = await freshDir()
		try {
			const store = await SQLiteStore.create(join(dir, 'kv.db'))
			store.set('a', { x: 1 })
			assert.deepEqual(store.get('a'), { x: 1 })

			// a row written by an older version, before values were JSON
			store.db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('legacy', 'plain-text')
			assert.equal(store.get('legacy'), 'plain-text')

			store.del('a')
			assert.equal(store.get('a'), undefined)
			assert.equal(store.get('missing'), undefined)

			// null/undefined is a delete, not a stored "null"
			store.set('b', { y: 2 })
			store.set('b', null)
			assert.equal(store.get('b'), undefined)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
