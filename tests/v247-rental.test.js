// v2.4.7 — rental manager: §2.26 fix (paid extend clears the trial flag) plus
// the stats() dashboard and transfer() group-migration upgrades.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRentalManager } from '../lib/Utils/rental.js'

const G = (n) => `${n}@g.us`

test('§2.26: extending a trial is a PAID top-up — it clears the trial flag', () => {
	let t = 1_700_000_000_000
	const r = createRentalManager({ now: () => t })
	r.startTrial(G(7), { days: 3 })
	assert.equal(r.getRental(G(7)).trial, true, 'starts as a trial')

	// customer pays to continue → extend
	r.extend(G(7), { days: 30, by: 'payer@s' })
	const info = r.getRental(G(7))
	assert.equal(info.trial, false, 'no longer a trial after a paid extend')
	assert.ok(r.renderStatus(G(7)).startsWith('✅ Aktif'), 'status shows Aktif, not Trial')
	assert.ok(!r.renderStatus(G(7)).includes('Trial'))
	// payer is recorded, and the time stacked correctly
	assert.equal(r.toJSON().entries.find(([c]) => c === G(7))[1].by, 'payer@s')
	assert.equal(Math.round(info.remainingMs / 86_400_000), 33)
})

test('extend on a paid rental still stacks and stays paid (no regression)', () => {
	let t = 1_700_000_000_000
	const r = createRentalManager({ now: () => t })
	r.add(G(1), { days: 30, by: 'buyer@s' })
	const before = r.getRental(G(1)).expiresAt
	r.extend(G(1), { days: 10 })
	assert.equal(r.getRental(G(1)).expiresAt - before, 10 * 86_400_000, 'stacks +10d')
	assert.equal(r.getRental(G(1)).trial, false)
	// lifetime extend is a no-op that stays lifetime
	r.add(G(2), { lifetime: true })
	assert.deepEqual(r.extend(G(2), { days: 5 }), { chat: G(2), expiresAt: 0 })
	assert.equal(r.getRental(G(2)).lifetime, true)
})

test('stats(): owner dashboard counts across all rentals', () => {
	let t = 1_700_000_000_000
	const r = createRentalManager({ now: () => t, expiringThresholdMs: 24 * 3600e3 })
	r.add(G(1), { days: 10 })          // active, paid, not soon
	r.add(G(2), { hours: 12 })         // active, paid, expiring soon
	r.add(G(3), { lifetime: true })    // active, paid, lifetime
	r.startTrial(G(4), { days: 3 })    // active, trial
	assert.deepEqual(r.stats(), {
		active: 4, trial: 1, paid: 3, lifetime: 1, expiringSoon: 1, trialsEverUsed: 1
	})
	// expired rentals drop out of the counts
	t += 20 * 86_400_000
	r.sweep()
	const s = r.stats()
	assert.equal(s.active, 1, 'only the lifetime rental remains active')
	assert.equal(s.lifetime, 1)
	assert.equal(s.trialsEverUsed, 1, 'trial-burn count is permanent')
})

test('transfer(): migrate a rental to a new group jid, carrying the trial burn', () => {
	let t = 1_700_000_000_000
	const r = createRentalManager({ now: () => t })
	r.startTrial(G(100), { days: 3 })
	r.add(G(100), { days: 30, by: 'u@s' })

	const moved = r.transfer(G(100), G(200))
	assert.equal(moved.from, G(100))
	assert.equal(moved.to, G(200))
	assert.equal(r.isActive(G(100)), false, 'source no longer active')
	assert.equal(r.isActive(G(200)), true, 'destination active')
	assert.equal(r.startTrial(G(200)), false, 'trial-burn marker carried across')

	// guards
	assert.equal(r.transfer(G(999), G(888)), false, 'nothing to move')
	assert.equal(r.transfer(G(200), G(200)), false, 'same jid rejected')
	r.add(G(300), { days: 5 })
	assert.equal(r.transfer(G(200), G(300)), false, 'destination occupied without overwrite')
	assert.ok(r.transfer(G(200), G(300), { overwrite: true }), 'overwrite allowed')
	assert.equal(r.isActive(G(200)), false)
})
