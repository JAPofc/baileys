import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
	createMysqlStoreAdapter,
	createPostgresStoreAdapter,
	createRedisStoreAdapter,
	createSqliteStoreAdapter
} from '../lib/Utils/PersistentStore.js'

/**
 * The five store adapters are public exports, and before this file none of them had ever
 * run against its real driver — `pg`, `mysql2`, `ioredis` and `mongodb` were optional
 * peers nobody installed (pattern 38). What that uncovered: §2.215 (cryptic error before
 * `init()`) and §2.216 (the three SQL adapters escaped LIKE prefixes differently).
 *
 * How each backend is exercised, stated plainly so nobody mistakes the coverage:
 *   sqlite   — the real driver, real SQL, on a temp file. Full end-to-end.
 *   postgres — `pg-mem`, a real SQL engine in memory. NOTE: pg-mem does not implement
 *              backslash escapes in LIKE, so prefix escaping is asserted on the generated
 *              SQL and parameters instead of on query results. Saying so matters: an
 *              assertion against pg-mem's LIKE would be testing the mock, not Postgres.
 *   mysql    — an injected fake pool that records SQL and parameters. The driver is real
 *              but no server exists, so only statement construction is covered.
 *   redis    — `ioredis-mock`, which implements the command semantics we use.
 */

const load = async name => {
	try {
		return await import(name)
	} catch {
		return null
	}
}

const pgMem = await load('pg-mem')
const redisMock = await load('ioredis-mock')
const sqliteDriver = await load('better-sqlite3')
const mysqlDriver = await load('mysql2/promise')
const pgDriver = await load('pg')

const needs = (mod, name) => ({ skip: mod ? false : `${name} is not installed` })

const freshDir = () => mkdtemp(join(tmpdir(), 'jap-store-'))

/** The shared contract every adapter must satisfy, whatever it stores into. */
const runContract = async (adapter, { supportsLikeEscape = true, supportsLikePrefix = true } = {}) => {
	await adapter.init()

	await adapter.set('chats', 'c1', { id: 'c1', blob: Buffer.from('ff00', 'hex'), n: 1 })
	const got = await adapter.get('chats', 'c1')
	assert.equal(got.id, 'c1')
	assert.ok(Buffer.isBuffer(got.blob), 'Buffers must survive serialisation')
	assert.equal(got.blob.toString('hex'), 'ff00')

	// upsert, not a duplicate row
	await adapter.set('chats', 'c1', { id: 'c1', n: 2 })
	assert.equal((await adapter.get('chats', 'c1')).n, 2)

	await adapter.set('chats', 'c2', { id: 'c2' })
	assert.equal((await adapter.list('chats')).length, 2)

	await adapter.set('messages', 'm1', { id: 'm1' })
	assert.deepEqual((await adapter.listDomains()).sort(), ['chats', 'messages'])
	if (supportsLikePrefix) {
		assert.deepEqual(await adapter.listDomains('cha'), ['chats'])
	}

	if (supportsLikeEscape) {
		// §2.216: a prefix full of pattern metacharacters must match literally
		await adapter.set('a%b', 'x', {})
		await adapter.set('azzb', 'y', {})
		await adapter.set('back\\slash', 'z', {})
		assert.deepEqual(await adapter.listDomains('a%'), ['a%b'], '% in a prefix is literal')
		assert.deepEqual(await adapter.listDomains('back\\'), ['back\\slash'], 'a trailing backslash must not eat the wildcard')
	}

	await adapter.delete('chats', 'c1')
	assert.equal(await adapter.get('chats', 'c1'), undefined)

	await adapter.clear('chats')
	assert.equal((await adapter.list('chats')).length, 0)
	assert.equal(await adapter.get('chats', 'nope'), undefined, 'a missing key is undefined, not a throw')
}

describe('sqlite store adapter — real driver, real SQL', () => {
	it('satisfies the whole adapter contract', needs(sqliteDriver, 'better-sqlite3'), async () => {
		const dir = await freshDir()
		try {
			const adapter = await createSqliteStoreAdapter({ dbPath: join(dir, 'store.db') })
			await runContract(adapter)
			await adapter.close?.()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('init() is idempotent — a second call does not re-run the migration', needs(sqliteDriver, 'better-sqlite3'), async () => {
		const dir = await freshDir()
		try {
			const adapter = await createSqliteStoreAdapter({ dbPath: join(dir, 'twice.db') })
			await adapter.init()
			await adapter.set('d', 'i', { keep: true })
			await adapter.init()
			assert.deepEqual(await adapter.get('d', 'i'), { keep: true }, 'data survived a second init()')
			await adapter.close?.()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('postgres store adapter — pg-mem', () => {
	it('satisfies the contract (LIKE escaping checked separately, see below)', needs(pgMem && pgDriver, 'pg-mem/pg'), async () => {
		const pool = new (pgMem.newDb().adapters.createPg()).Pool()
		const adapter = await createPostgresStoreAdapter({ pool })
		// pg-mem implements neither backslash escapes in LIKE nor the ESCAPE clause itself
		// (`LIKE $1 ESCAPE '\'` fails to parse), both of which real Postgres supports. So
		// prefix queries are covered by the SQL-construction test below instead; asserting
		// them here would be testing the mock's gaps, not our adapter.
		await runContract(adapter, { supportsLikeEscape: false, supportsLikePrefix: false })
	})

	it('§2.216 builds an escaped pattern and states ESCAPE in the SQL', needs(pgDriver, 'pg'), async () => {
		const seen = []
		const adapter = await createPostgresStoreAdapter({
			pool: { query: async (sql, args) => (seen.push({ sql, args }), { rows: [] }), end: async () => {} }
		})
		await adapter.listDomains('back\\')
		const { sql, args } = seen.at(-1)
		assert.match(sql, /ESCAPE '\\'/, 'the escape character must be explicit, not assumed')
		assert.equal(args[0], 'back\\\\%', 'the backslash is escaped, so our wildcard survives')
	})
})

describe('mysql store adapter — statement construction', () => {
	it('§2.216 escapes the prefix and states ESCAPE, like the other two', needs(mysqlDriver, 'mysql2'), async () => {
		const seen = []
		const adapter = await createMysqlStoreAdapter({
			pool: { query: async (sql, args) => (seen.push({ sql, args }), [[]]), end: async () => {} }
		})
		await adapter.listDomains('back\\')
		const { sql, args } = seen.at(-1)
		assert.match(sql, /ESCAPE '\\\\'/, "MySQL needs a doubled backslash inside the literal")
		assert.equal(args[0], 'back\\\\%')
	})

	it('a prefix-less listDomains asks no LIKE at all', needs(mysqlDriver, 'mysql2'), async () => {
		const seen = []
		const adapter = await createMysqlStoreAdapter({
			pool: { query: async (sql, args) => (seen.push({ sql, args }), [[]]), end: async () => {} }
		})
		await adapter.listDomains()
		assert.doesNotMatch(seen.at(-1).sql, /LIKE/)
	})
})

describe('redis store adapter — ioredis-mock', () => {
	it('satisfies the contract', needs(redisMock, 'ioredis-mock'), async () => {
		const adapter = await createRedisStoreAdapter({ client: new redisMock.default() })
		// redis has no LIKE; listDomains filters keys itself, and the prefix is used as a
		// plain string there, so the metacharacter cases do not apply
		await runContract(adapter, { supportsLikeEscape: false })
	})

	it('a caller-owned client is not disconnected by close()', needs(redisMock, 'ioredis-mock'), async () => {
		const client = new redisMock.default()
		const adapter = await createRedisStoreAdapter({ client })
		await adapter.init()
		await adapter.close?.()
		await client.set('still', 'alive')
		assert.equal(await client.get('still'), 'alive')
	})
})

describe('§2.215 every lazily-initialised adapter explains itself', () => {
	it('sqlite rejects with a message naming init()', needs(sqliteDriver, 'better-sqlite3'), async () => {
		const dir = await freshDir()
		try {
			const adapter = await createSqliteStoreAdapter({ dbPath: join(dir, 'lazy.db') })
			await assert.rejects(() => adapter.get('d', 'i'), /init\(\)/)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
