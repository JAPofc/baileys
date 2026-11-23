import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	createMongoStoreAdapter,
	createMysqlStoreAdapter,
	createPostgresStoreAdapter,
	createRedisStoreAdapter
} from '../lib/Utils/PersistentStore.js'

/**
 * Live-server integration for the four networked store adapters.
 *
 * `tests/v251-store-adapters.test.js` covers what in-memory doubles can honestly cover.
 * This file covers what they cannot. The difference mattered: `pg-mem` implements neither
 * backslash escapes in LIKE nor the `ESCAPE` clause, so the §2.216 bug was invisible there
 * and the correct fix actually made the mock fail. Against a real Postgres, the pre-fix
 * code answers `listDomains('back\\')` with the domain `back%` — a different row entirely.
 *
 * Each suite is skipped unless its server URL is in the environment, so a laptop without
 * servers stays green while CI, which provides all four as service containers, must run
 * every one of them. CI additionally asserts that nothing here skipped.
 *
 *   JAP_TEST_POSTGRES_URL   e.g. postgres://user@127.0.0.1:5432/wa
 *   JAP_TEST_MYSQL_URL      e.g. mysql://root@127.0.0.1:3306/wa
 *   JAP_TEST_REDIS_URL      e.g. redis://127.0.0.1:6379
 *   JAP_TEST_MONGO_URL      e.g. mongodb://127.0.0.1:27017
 */

const url = name => process.env[`JAP_TEST_${name}_URL`] || ''
const needs = name => ({ skip: url(name) ? false : `JAP_TEST_${name}_URL is not set` })

/** A fresh namespace per run so repeated local runs do not inherit each other's rows. */
const ns = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const BACKSLASH_DOMAIN = 'back\\slash' // exactly one backslash
const BACKSLASH_PREFIX = 'back\\'

/** The behaviour every backend must agree on, run against the real thing. */
const runLiveContract = async (adapter, { likePrefix = true } = {}) => {
	await adapter.init()
	const d = ns()

	await adapter.set(d, 'k1', { id: 'k1', blob: Buffer.from('ff00', 'hex'), n: 1 })
	const got = await adapter.get(d, 'k1')
	assert.ok(Buffer.isBuffer(got.blob), 'Buffers must survive a real round-trip')
	assert.equal(got.blob.toString('hex'), 'ff00')

	await adapter.set(d, 'k1', { id: 'k1', n: 2 })
	assert.equal((await adapter.get(d, 'k1')).n, 2, 'a second set() upserts, it does not duplicate')
	assert.equal((await adapter.list(d)).length, 1)

	assert.equal(await adapter.get(d, 'absent'), undefined, 'a missing key is undefined, not a throw')

	// init() runs migrations; running it twice must not wipe or fail
	await adapter.init()
	assert.equal((await adapter.get(d, 'k1')).n, 2, 'data survived a second init()')

	await Promise.all([...Array(20)].map((_, i) => adapter.set(`${d}par`, `k${i}`, { i })))
	assert.equal((await adapter.list(`${d}par`)).length, 20, '20 concurrent writes all landed')

	if (likePrefix) {
		// §2.216 — the pattern metacharacters must be literal, on the real query planner
		const p = ns()
		await adapter.set(`${p}a%b`, 'x', {})
		await adapter.set(`${p}azzb`, 'y', {})
		assert.deepEqual(await adapter.listDomains(`${p}a%`), [`${p}a%b`], '% in a prefix is a literal %')

		await adapter.set(`${p}u_x`, 'x', {})
		await adapter.set(`${p}uQx`, 'y', {})
		assert.deepEqual(await adapter.listDomains(`${p}u_`), [`${p}u_x`], '_ in a prefix is a literal _')

		await adapter.set(`${p}${BACKSLASH_DOMAIN}`, 'z', {})
		await adapter.set(`${p}back%`, 'q', {})
		assert.deepEqual(
			await adapter.listDomains(`${p}${BACKSLASH_PREFIX}`),
			[`${p}${BACKSLASH_DOMAIN}`],
			'a trailing backslash must not escape the wildcard we append (pre-fix this returned `back%`)'
		)
	}

	await adapter.delete(d, 'k1')
	assert.equal(await adapter.get(d, 'k1'), undefined)

	await adapter.clear(`${d}par`)
	assert.equal((await adapter.list(`${d}par`)).length, 0)
}

describe('postgres store adapter — live server', () => {
	it('satisfies the contract against a real Postgres', needs('POSTGRES'), async () => {
		const adapter = await createPostgresStoreAdapter({ connectionString: url('POSTGRES') })
		try {
			await runLiveContract(adapter)
		} finally {
			await adapter.close?.()
		}
	})
})

describe('mysql store adapter — live server', () => {
	it('satisfies the contract against a real MySQL/MariaDB', needs('MYSQL'), async () => {
		const adapter = await createMysqlStoreAdapter({ uri: url('MYSQL') })
		try {
			await runLiveContract(adapter)
		} finally {
			await adapter.close?.()
		}
	})
})

describe('redis store adapter — live server', () => {
	// redis has no LIKE; listDomains filters keys in the adapter, so the SQL pattern cases
	// do not apply here
	it('satisfies the contract against a real Redis', needs('REDIS'), async () => {
		const adapter = await createRedisStoreAdapter({ url: url('REDIS') })
		try {
			await runLiveContract(adapter, { likePrefix: false })
		} finally {
			await adapter.close?.()
		}
	})
})

describe('mongo store adapter — live server', () => {
	it('satisfies the contract against a real MongoDB', needs('MONGO'), async () => {
		const adapter = await createMongoStoreAdapter({ url: url('MONGO'), dbName: `jap_${ns()}` })
		try {
			await runLiveContract(adapter, { likePrefix: false })
		} finally {
			await adapter.close?.()
		}
	})

	it('§2.215 explains itself when used before init()', needs('MONGO'), async () => {
		const adapter = await createMongoStoreAdapter({ url: url('MONGO'), dbName: `jap_${ns()}` })
		await assert.rejects(() => adapter.get('d', 'i'), /init\(\)/)
		await adapter.close?.()
	})

	it('a regex-special prefix is matched literally, not as a pattern', needs('MONGO'), async () => {
		const adapter = await createMongoStoreAdapter({ url: url('MONGO'), dbName: `jap_${ns()}` })
		try {
			await adapter.init()
			await adapter.set('a.c', 'x', {})
			await adapter.set('abc', 'y', {})
			assert.deepEqual(await adapter.listDomains('a.'), ['a.c'], '. is a literal dot, not "any character"')
		} finally {
			await adapter.close?.()
		}
	})
})
