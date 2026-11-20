import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	BUILD_TAG,
	QUORUM_VOTES,
	createQuorum,
	renderQuorum,
	sendQuorum
} from '../lib/Builders/Quorum.js'
import { findAttributionTraces } from '../lib/Utils/provenance.js'

const admins = ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net', 'd@s.whatsapp.net']
const [A, B, C, D] = admins

const base = (overrides = {}) => createQuorum({
	question: 'Remove the spammer?',
	eligible: admins,
	threshold: 3,
	...overrides
})

describe('createQuorum — counting', () => {
	it('approves exactly at the threshold, not before', () => {
		const q = base()
		assert.equal(q.vote(A).status, 'open')
		assert.equal(q.vote(B).status, 'open')
		assert.equal(q.vote(C).status, 'approved')
		assert.equal(q.result.decidedBy, C)
	})

	it('counts one vote per voter, however many times they shout', () => {
		const q = base()
		for (let i = 0; i < 10; i++) {
			q.vote(A, 'approve')
		}
		assert.equal(q.result.approve, 1)
		assert.equal(q.status, 'open')
	})

	it('lets a voter change their mind without double counting', () => {
		const q = base()
		q.vote(A, 'approve')
		q.vote(A, 'reject')
		assert.deepEqual([q.result.approve, q.result.reject], [0, 1])
	})

	it('refuses a changed vote when the rules forbid it', () => {
		const q = base({ allowChangeVote: false })
		q.vote(A, 'approve')
		const second = q.vote(A, 'reject')
		assert.equal(second.counted, false)
		assert.equal(second.reason, 'already-voted')
		assert.equal(q.result.approve, 1)
	})

	it('reports an unchanged vote as a no-op rather than a change', () => {
		const q = base()
		q.vote(A, 'approve')
		assert.equal(q.vote(A, 'approve').reason, 'unchanged')
	})

	it('derives a majority threshold when none is given', () => {
		assert.equal(createQuorum({ question: 'q', eligible: admins }).threshold, 2)
		assert.equal(createQuorum({ question: 'q', eligible: admins.slice(0, 3) }).threshold, 2)
	})

	it('supports a ratio threshold', () => {
		assert.equal(createQuorum({ question: 'q', eligible: admins, thresholdRatio: 0.75 }).threshold, 3)
		assert.equal(createQuorum({ question: 'q', eligible: admins, thresholdRatio: 1 }).threshold, 4)
	})

	it('de-duplicates the eligible list', () => {
		const q = createQuorum({ question: 'q', eligible: [A, A, A, B], threshold: 2 })
		assert.equal(q.voters.length, 2)
	})
})

describe('createQuorum — eligibility', () => {
	it('ignores a vote from outside the eligible list', () => {
		const q = base()
		const outcome = q.vote('stranger@s.whatsapp.net')
		assert.equal(outcome.counted, false)
		assert.equal(outcome.reason, 'not-eligible')
		assert.equal(q.result.approve, 0)
	})

	it('does not let the subject vote on themselves', () => {
		const q = base({ subject: D, threshold: 2 })
		const outcome = q.vote(D, 'reject')
		assert.equal(outcome.reason, 'subject-may-not-vote')
		assert.ok(!q.voters.includes(D))
		assert.equal(q.result.eligible, 3)
	})

	it('lets the subject vote when explicitly allowed', () => {
		const q = base({ subject: D, subjectMayVote: true })
		assert.equal(q.vote(D, 'approve').counted, true)
	})

	it('rejects nonsense input without throwing', () => {
		const q = base()
		for (const bad of [undefined, null, '', 42, {}]) {
			assert.equal(q.vote(bad).counted, false)
		}
		assert.equal(q.vote(A, 'maybe').reason, 'invalid-vote')
		assert.deepEqual(QUORUM_VOTES, ['approve', 'reject', 'abstain'])
	})
})

describe('createQuorum — settling', () => {
	it('latches: votes after the decision are refused, not silently reopening it', () => {
		const q = base()
		q.vote(A)
		q.vote(B)
		q.vote(C)
		assert.equal(q.status, 'approved')

		const late = q.vote(D, 'reject')
		assert.equal(late.counted, false)
		assert.equal(late.reason, 'closed')
		assert.equal(q.status, 'approved')
		assert.equal(q.result.reject, 0)
	})

	it('rejects as soon as approval is arithmetically impossible', () => {
		const q = base() // 3 of 4 needed
		q.vote(A, 'reject')
		assert.equal(q.status, 'open')
		q.vote(B, 'reject')
		// only 2 voters left, 3 approvals can never happen
		assert.equal(q.status, 'rejected')
		assert.equal(q.result.decidedBy, B)
	})

	it('treats an abstention as a used-up vote, not a free one', () => {
		const q = base()
		q.vote(A, 'abstain')
		q.vote(B, 'abstain')
		assert.equal(q.status, 'rejected', 'two abstentions make 3-of-4 unreachable')
		assert.equal(q.result.abstain, 2)
	})

	it('a veto ends it alone', () => {
		const q = base({ veto: [D] })
		q.vote(A)
		q.vote(D, 'reject')
		assert.equal(q.status, 'vetoed')
		assert.equal(q.result.decidedBy, D)
	})

	it('a veto holder approving is just an approval', () => {
		const q = base({ veto: [D] })
		q.vote(D, 'approve')
		assert.equal(q.status, 'open')
	})

	it('expires on its own clock, exactly once', () => {
		let clock = 1000
		const q = base({ ttlMs: 5000, now: () => clock })
		q.vote(A)
		clock = 6001

		assert.equal(q.status, 'expired')
		assert.equal(q.vote(B).reason, 'expired')
		const decidedAt = q.result.decidedAt
		clock = 9999
		assert.equal(q.result.decidedAt, decidedAt, 'the decision time must not drift')
	})

	it('can be cancelled, and cancelling twice changes nothing', () => {
		const q = base()
		q.vote(A)
		q.cancel(A)
		const first = q.result.decidedAt
		q.cancel(B)
		assert.equal(q.status, 'cancelled')
		assert.equal(q.result.decidedBy, A)
		assert.equal(q.result.decidedAt, first)
	})
})

describe('createQuorum — construction', () => {
	it('refuses a threshold nobody could ever reach', () => {
		assert.throws(() => createQuorum({ question: 'q', eligible: [A, B], threshold: 3 }), /cannot be reached/)
	})

	it('refuses an empty electorate', () => {
		assert.throws(() => createQuorum({ question: 'q', eligible: [] }), /eligible voter/)
		assert.throws(() => createQuorum({ question: 'q', eligible: [A], subject: A }), /after excluding the subject/)
	})

	it('refuses a missing question or a nonsense ratio', () => {
		assert.throws(() => createQuorum({ eligible: admins }), /question/)
		assert.throws(() => createQuorum({ question: '   ', eligible: admins }), /question/)
		assert.throws(() => createQuorum({ question: 'q', eligible: admins, thresholdRatio: 0 }), /thresholdRatio/)
		assert.throws(() => createQuorum({ question: 'q', eligible: admins, thresholdRatio: 2 }), /thresholdRatio/)
	})

	it('refuses a threshold below one', () => {
		assert.throws(() => createQuorum({ question: 'q', eligible: admins, threshold: 0 }), /at least 1/)
	})
})

describe('quorum rendering and provenance', () => {
	it('shows the rules, not just the tally', () => {
		const q = base()
		q.vote(A)
		const text = q.render()
		assert.match(text, /approve 1/)
		assert.match(text, /2 more approvals needed \(3 of 4\)/)
	})

	it('names the outcome once settled', () => {
		const q = base({ threshold: 1 })
		q.vote(A)
		assert.match(q.render(), /Approved/)
	})

	it('puts the build tag in every id, where a rebrand will not think to look', () => {
		const q = base()
		assert.match(q.id, /^QRM-[0-9A-F]{6}-[0-9A-F]{8}$/)
		assert.ok(q.id.includes(BUILD_TAG))
		assert.equal(q.buildTag, BUILD_TAG)
	})

	it('the id is a trace the provenance scanner recognises', () => {
		const traces = findAttributionTraces(`a log line: ${base().id}`)
		assert.ok(traces.some(t => t.name === 'build-tag'), JSON.stringify(traces))
	})

	it('ids are unique across many quorums', () => {
		const ids = new Set(Array.from({ length: 500 }, () => base().id))
		assert.equal(ids.size, 500)
	})

	it('renderQuorum works standalone on a result object', () => {
		const q = base()
		q.vote(A)
		assert.match(renderQuorum(q.result, { question: 'Custom?', footer: 'bot' }), /Custom\?[\s\S]*bot/)
	})
})

describe('sendQuorum', () => {
	const fakeSock = () => {
		const sends = []
		let n = 0
		return {
			sends,
			async sendMessage(jid, content) {
				sends.push(content)
				return { key: { id: `M${++n}` } }
			}
		}
	}

	it('posts one message and keeps editing it as votes land', async () => {
		const sock = fakeSock()
		const session = await sendQuorum(sock, 'g@g.us', { question: 'Pin this?', eligible: admins, threshold: 2 })

		await session.vote(A)
		await session.vote(B)

		assert.equal(session.quorum.status, 'approved')
		assert.equal(sock.sends.filter(s => !s.edit).length, 1, 'exactly one new message')
		assert.match(sock.sends.at(-1).text, /Approved/)
	})

	it('resolves exactly once, after the final frame is written', async () => {
		const sock = fakeSock()
		const seen = []
		const session = await sendQuorum(sock, 'g@g.us', {
			question: 'Kick?',
			eligible: admins,
			threshold: 2,
			onResolve: result => {
				// the message must already say the outcome by the time the action runs
				assert.match(sock.sends.at(-1).text, /Approved/)
				seen.push(result.status)
			}
		})

		await session.vote(A)
		await session.vote(B)
		await session.vote(C)
		await session.tick()
		await session.cancel(A)

		assert.deepEqual(seen, ['approved'])
	})

	it('an onResolve that throws does not break the caller', async () => {
		const session = await sendQuorum(fakeSock(), 'g@g.us', {
			question: 'q',
			eligible: admins,
			threshold: 1,
			onResolve: () => {
				throw new Error('handler exploded')
			}
		})
		await assert.doesNotReject(() => session.vote(A))
		assert.equal(session.quorum.status, 'approved')
	})

	it('an ineligible vote does not cost a message edit', async () => {
		const sock = fakeSock()
		const session = await sendQuorum(sock, 'g@g.us', { question: 'q', eligible: admins, threshold: 3 })
		const before = sock.sends.length
		const outcome = await session.vote('nobody@s.whatsapp.net')

		assert.equal(outcome.counted, false)
		assert.equal(sock.sends.length, before)
	})

	it('resolves an expiry through tick()', async () => {
		let clock = 1000
		const sock = fakeSock()
		const session = await sendQuorum(sock, 'g@g.us', {
			question: 'q',
			eligible: admins,
			threshold: 3,
			ttlMs: 1000,
			now: () => clock
		})
		await session.vote(A)
		clock = 5000
		assert.equal(await session.tick(), true)
		assert.match(sock.sends.at(-1).text, /Expired/)
		assert.equal(await session.tick(), false, 'it must not resolve twice')
	})
})
