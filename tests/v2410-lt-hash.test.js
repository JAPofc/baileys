/**
 * tests/v2410-lt-hash.test.js — the app-state integrity hash.
 *
 * `lt-hash.js` had no test at all, which is an uncomfortable place for it to be: every
 * app-state sync (chat mutations, contacts, settings) is checked against this hash, and a
 * wrong answer here does not throw — it silently desynchronises the client's view of the
 * account.
 *
 * These tests pin the *properties* the algorithm has to have, not an implementation:
 * commutativity, inverse, and determinism. Those are the guarantees `chat-utils.js` relies
 * on when it replays mutations in whatever order they arrived.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LT_HASH_ANTI_TAMPERING } from '../lib/Utils/lt-hash.js'

/**
 * `whatsapp-rust-bridge` is an optionalDependency: on a platform with no prebuilt binary
 * the module installs a Proxy that throws a clear message instead. Both outcomes are real,
 * supported behaviour, so both are tested — this is not a quiet skip. The property suite
 * runs where the native module exists; where it does not, the contract under test is that
 * the failure is loud and explains itself.
 */
const bridgeAvailable = (() => {
	try {
		LT_HASH_ANTI_TAMPERING.subtractThenAdd(Buffer.alloc(128), [], [])
		return true
	} catch {
		return false
	}
})()

const EMPTY = () => Buffer.alloc(128)
const buf = s => Buffer.from(s, 'utf8')

/** `subtractThenAdd(hash, removals, additions)`. */
const apply = (hash, removals, additions) =>
	Buffer.from(LT_HASH_ANTI_TAMPERING.subtractThenAdd(hash, removals, additions))

describe('LT hash — the module contract on every platform', () => {
	it('always exports something, so importing it never crashes a bot', () => {
		assert.ok(LT_HASH_ANTI_TAMPERING)
	})

	it('without the native bridge, using it fails loudly and says why', { skip: bridgeAvailable }, () => {
		// the whole point of the fallback Proxy: importing must not crash a bot that never
		// touches app-state sync, but actually using it must not fail mysteriously either
		assert.throws(
			() => LT_HASH_ANTI_TAMPERING.subtractThenAdd(EMPTY(), [], []),
			/whatsapp-rust-bridge|App-state sync/
		)
	})
})

describe('LT hash — the properties app-state sync depends on', { skip: !bridgeAvailable }, () => {
	it('leaves the hash alone when nothing changes', () => {
		assert.deepEqual(apply(EMPTY(), [], []), EMPTY())
	})

	it('is deterministic: the same mutation gives the same hash', () => {
		const a = apply(EMPTY(), [], [buf('alpha')])
		const b = apply(EMPTY(), [], [buf('alpha')])
		assert.deepEqual(a, b)
	})

	it('actually changes the hash when something is added', () => {
		assert.notDeepEqual(apply(EMPTY(), [], [buf('alpha')]), EMPTY())
	})

	it('is order independent — the whole point of a summation hash', () => {
		// mutations arrive out of order all the time; the hash must not care
		const forward = apply(EMPTY(), [], [buf('alpha'), buf('beta'), buf('gamma')])
		const reverse = apply(EMPTY(), [], [buf('gamma'), buf('beta'), buf('alpha')])
		assert.deepEqual(forward, reverse)
	})

	it('one mutation at a time equals all of them at once', () => {
		let stepwise = EMPTY()
		for (const value of ['alpha', 'beta', 'gamma']) {
			stepwise = apply(stepwise, [], [buf(value)])
		}
		const atOnce = apply(EMPTY(), [], [buf('alpha'), buf('beta'), buf('gamma')])
		assert.deepEqual(stepwise, atOnce)
	})

	it('removing what was added returns to the starting hash', () => {
		const added = apply(EMPTY(), [], [buf('alpha'), buf('beta')])
		const removed = apply(added, [buf('alpha'), buf('beta')], [])
		assert.deepEqual(removed, EMPTY())
	})

	it('a replacement is a removal and an addition in one step', () => {
		const before = apply(EMPTY(), [], [buf('old'), buf('keep')])
		const replaced = apply(before, [buf('old')], [buf('new')])
		const direct = apply(EMPTY(), [], [buf('keep'), buf('new')])
		assert.deepEqual(replaced, direct)
	})

	it('different data gives different hashes', () => {
		const a = apply(EMPTY(), [], [buf('alpha')])
		const b = apply(EMPTY(), [], [buf('alphb')])
		assert.notDeepEqual(a, b)
	})

	it('keeps the hash 128 bytes wide', () => {
		const hash = apply(EMPTY(), [], [buf('alpha'), buf('beta')])
		assert.equal(hash.length, 128)
	})

	it('does not mutate the hash it was given', () => {
		const original = EMPTY()
		apply(original, [], [buf('alpha')])
		assert.deepEqual(original, EMPTY(), 'the input buffer must not be written through')
	})

	it('handles an empty value without corrupting the hash', () => {
		const withEmpty = apply(EMPTY(), [], [Buffer.alloc(0)])
		assert.equal(withEmpty.length, 128)
		assert.deepEqual(apply(withEmpty, [Buffer.alloc(0)], []), EMPTY())
	})

	it('survives a long run of mutations and still inverts', () => {
		const values = Array.from({ length: 200 }, (_, i) => buf(`mutation-${i}`))
		const built = apply(EMPTY(), [], values)
		assert.notDeepEqual(built, EMPTY())
		assert.deepEqual(apply(built, values, []), EMPTY())
	})
})
