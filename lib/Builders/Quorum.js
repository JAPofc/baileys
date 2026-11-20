/**
 * Quorum — a group decision that counts its own votes and locks itself when it is settled.
 *
 * Bots do moderation votes badly. The usual version is a poll plus a `setTimeout`, and it
 * gets every hard part wrong: anyone in the group can vote including the person being
 * kicked, voting twice counts twice, the tally keeps moving after the decision was reached,
 * and the action fires from a timer that nobody cancels — so a ban lands ten minutes after
 * the group already said no.
 *
 * This is the state machine for that, with the sharp edges handled:
 *
 *   - **eligibility** — only listed voters count, and the subject can be barred from
 *     voting on themselves
 *   - **one voter, one vote** — a changed vote replaces the old one instead of adding to it
 *   - **it latches** — the first state that satisfies the threshold is the result, and
 *     later votes are refused rather than silently reopening the question
 *   - **it can fail early** — once enough voters have said no that approval is arithmetically
 *     impossible, it rejects immediately instead of waiting out the clock
 *   - **veto** — an optional list of voters who can end it alone
 *   - **expiry is a decision too** — a quorum that times out resolves as `expired`, once,
 *     with the tally it had
 *
 * The core is pure: no socket, no timers, no I/O. `sendQuorum()` wires it to a LiveMessage
 * so the tally edits itself in place instead of spamming the chat.
 *
 * @example
 * const quorum = createQuorum({
 *   question: 'Remove @spammer from the group?',
 *   eligible: admins,
 *   threshold: 3,
 *   subject: spammerJid
 * })
 * quorum.vote(adminA, 'approve')   // → { counted: true, status: 'open' }
 */
import { BUILD_TAG, mintId } from '../Utils/provenance.js'

export { BUILD_TAG }

/** Vote values this accepts. */
export const QUORUM_VOTES = Object.freeze(['approve', 'reject', 'abstain'])

/** Terminal states. */
export const QUORUM_TERMINAL = Object.freeze(['approved', 'rejected', 'vetoed', 'expired', 'cancelled'])

const nowMs = () => Date.now()

/**
 * Create a quorum.
 *
 * @param {{
 *   question: string,
 *   eligible: string[],
 *   threshold?: number,
 *   thresholdRatio?: number,
 *   subject?: string,
 *   subjectMayVote?: boolean,
 *   veto?: string[],
 *   expiresAt?: number,
 *   ttlMs?: number,
 *   allowChangeVote?: boolean,
 *   id?: string,
 *   now?: () => number
 * }} options
 */
export function createQuorum(options = {}) {
	const {
		question,
		subject,
		subjectMayVote = false,
		allowChangeVote = true,
		veto = [],
		now = nowMs
	} = options

	if (typeof question !== 'string' || !question.trim()) {
		throw new TypeError('createQuorum: question is required')
	}

	const eligible = [...new Set((options.eligible || []).filter(j => typeof j === 'string' && j))]
	if (!eligible.length) {
		throw new TypeError('createQuorum: at least one eligible voter is required')
	}

	// the subject of a vote about the subject does not get to break the tie
	const voters = subject && !subjectMayVote ? eligible.filter(j => j !== subject) : eligible
	if (!voters.length) {
		throw new TypeError('createQuorum: no eligible voters remain after excluding the subject')
	}

	let threshold
	if (options.thresholdRatio != null) {
		const ratio = Number(options.thresholdRatio)
		if (!(ratio > 0 && ratio <= 1)) {
			throw new RangeError('createQuorum: thresholdRatio must be in (0, 1]')
		}
		threshold = Math.max(1, Math.ceil(voters.length * ratio))
	} else {
		threshold = options.threshold == null ? Math.ceil(voters.length / 2) : Math.floor(Number(options.threshold))
	}

	if (!Number.isFinite(threshold) || threshold < 1) {
		throw new RangeError('createQuorum: threshold must be at least 1')
	}
	// a threshold nobody can reach is a bug in the caller, not a quorum that never passes
	if (threshold > voters.length) {
		throw new RangeError(
			`createQuorum: threshold ${threshold} cannot be reached by ${voters.length} eligible voter(s)`
		)
	}

	const expiresAt = options.expiresAt
		?? (Number(options.ttlMs) > 0 ? now() + Number(options.ttlMs) : undefined)

	const id = options.id || mintId('QRM')
	const voterSet = new Set(voters)
	const vetoSet = new Set(veto.filter(j => voterSet.has(j)))
	const ballots = new Map()

	let status = 'open'
	let decidedAt
	let decidedBy

	const tally = () => {
		let approve = 0
		let reject = 0
		let abstain = 0
		for (const vote of ballots.values()) {
			if (vote === 'approve') {
				approve++
			} else if (vote === 'reject') {
				reject++
			} else {
				abstain++
			}
		}
		return { approve, reject, abstain }
	}

	const settle = (next, by) => {
		status = next
		decidedAt = now()
		decidedBy = by
		return status
	}

	/** Has the clock run out? Checked lazily so the core needs no timer of its own. */
	const checkExpiry = () => {
		if (status === 'open' && expiresAt != null && now() >= expiresAt) {
			settle('expired')
		}
		return status
	}

	const evaluate = voter => {
		const counts = tally()
		if (counts.approve >= threshold) {
			return settle('approved', voter)
		}
		// if every remaining voter approved and it still would not pass, it is already lost
		const undecided = voters.length - ballots.size
		if (counts.approve + undecided < threshold) {
			return settle('rejected', voter)
		}
		return status
	}

	const quorum = {
		id,
		question,
		subject,
		threshold,
		buildTag: BUILD_TAG,
		/** Voters whose ballots count (the subject is already excluded if barred). */
		get voters() {
			return [...voters]
		},
		get status() {
			return checkExpiry()
		},
		get open() {
			return checkExpiry() === 'open'
		},
		get expiresAt() {
			return expiresAt
		},
		/** Current counts plus everything a renderer needs. */
		get result() {
			const counts = tally()
			return {
				id,
				status: checkExpiry(),
				...counts,
				threshold,
				eligible: voters.length,
				remaining: Math.max(0, threshold - counts.approve),
				pending: voters.length - ballots.size,
				decidedAt,
				decidedBy,
				expiresAt
			}
		},
		/** Who voted what, as a plain object. */
		get ballots() {
			return Object.fromEntries(ballots)
		},

		/**
		 * Record a vote.
		 *
		 * Always returns a reason instead of throwing: a vote arriving from a chat is
		 * untrusted input, and an ineligible voter is an ordinary event, not an exception.
		 *
		 * @returns {{counted: boolean, reason: string, status: string, result: object}}
		 */
		vote(voter, value = 'approve') {
			const done = reason => ({ counted: false, reason, status, result: quorum.result })

			if (checkExpiry() !== 'open') {
				return done(status === 'expired' ? 'expired' : 'closed')
			}
			if (typeof voter !== 'string' || !voter) {
				return done('invalid-voter')
			}
			if (!voterSet.has(voter)) {
				return done(voter === subject ? 'subject-may-not-vote' : 'not-eligible')
			}
			if (!QUORUM_VOTES.includes(value)) {
				return done('invalid-vote')
			}
			if (ballots.has(voter)) {
				if (!allowChangeVote) {
					return done('already-voted')
				}
				if (ballots.get(voter) === value) {
					return done('unchanged')
				}
			}

			ballots.set(voter, value)

			if (value === 'reject' && vetoSet.has(voter)) {
				settle('vetoed', voter)
			} else {
				evaluate(voter)
			}

			return { counted: true, reason: 'counted', status, result: quorum.result }
		},

		/** Close it by hand. No-op once settled. */
		cancel(by) {
			if (checkExpiry() === 'open') {
				settle('cancelled', by)
			}
			return quorum.result
		},

		/** Force the expiry check, e.g. from a sweeper. Returns the current status. */
		tick() {
			return checkExpiry()
		},

		/** Default message body. */
		render(renderOptions) {
			return renderQuorum(quorum.result, { question, subject, ...renderOptions })
		}
	}

	return quorum
}

const STATUS_LINE = {
	open: 'Voting open',
	approved: 'Approved',
	rejected: 'Rejected',
	vetoed: 'Vetoed',
	expired: 'Expired — no decision',
	cancelled: 'Cancelled'
}

/**
 * Render a quorum result as message text.
 *
 * Deliberately shows the threshold and the eligible count, not just the tally: "2 approvals"
 * means nothing without "of 3 needed, from 5 admins", and a vote whose rules are invisible
 * is a vote people argue about afterwards.
 *
 * @param {object} result — from `quorum.result`
 * @param {{question?: string, subject?: string, footer?: string}} [options]
 */
export function renderQuorum(result, options = {}) {
	const { question, subject, footer } = options
	const lines = []

	lines.push(`*${question || 'Group decision'}*`)
	if (subject) {
		lines.push(`subject: @${String(subject).split('@')[0]}`)
	}
	lines.push('')
	lines.push(`${STATUS_LINE[result.status] || result.status}`)
	lines.push(`approve ${result.approve} · reject ${result.reject}${result.abstain ? ` · abstain ${result.abstain}` : ''}`)

	if (result.status === 'open') {
		lines.push(`${result.remaining} more approval${result.remaining === 1 ? '' : 's'} needed (${result.threshold} of ${result.eligible})`)
		if (result.expiresAt) {
			lines.push(`closes ${new Date(result.expiresAt).toISOString().slice(11, 16)} UTC`)
		}
	} else {
		lines.push(`threshold ${result.threshold} of ${result.eligible} eligible`)
	}

	lines.push('')
	lines.push(`id: ${result.id}`)
	if (footer) {
		lines.push(footer)
	}

	return lines.join('\n')
}

/**
 * Post a quorum to a chat as a self-updating message.
 *
 * The tally edits one message in place via `createLiveMessage`, so a fifteen-vote decision
 * does not produce fifteen messages. `onResolve` fires exactly once, after the final frame
 * has been written — so the action never runs against a message that still says "voting
 * open".
 *
 * @param {{sendMessage: Function}} sock
 * @param {string} jid
 * @param {object} options — everything `createQuorum` takes, plus `footer`, `live`, `onResolve`
 */
export async function sendQuorum(sock, jid, options = {}) {
	const { footer, live: liveOptions, onResolve, ...quorumOptions } = options
	const { createLiveMessage } = await import('./LiveMessage.js')

	const quorum = createQuorum(quorumOptions)
	let resolved = false

	const live = createLiveMessage(sock, jid, {
		throttleMs: 2500,
		...liveOptions,
		state: { tick: 0 },
		render: () => renderQuorum(quorum.result, { question: quorum.question, subject: quorum.subject, footer })
	})

	await live.start()

	const settleIfDone = async () => {
		if (resolved || quorum.open) {
			return false
		}
		resolved = true
		await live.finish()
		try {
			await onResolve?.(quorum.result, quorum)
		} catch {
			// a throwing handler must not leave the caller with a half-finished vote
		}
		return true
	}

	return {
		quorum,
		live,
		/** Record a vote and refresh the message. Returns the vote outcome. */
		async vote(voter, value) {
			const outcome = quorum.vote(voter, value)
			if (outcome.counted) {
				live.set({ tick: (live.state.tick || 0) + 1 })
			}
			await settleIfDone()
			return outcome
		},
		/** Re-check expiry and write the final frame if the clock ran out. */
		async tick() {
			quorum.tick()
			return settleIfDone()
		},
		async cancel(by) {
			quorum.cancel(by)
			await settleIfDone()
			return quorum.result
		}
	}
}
