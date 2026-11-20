export const QUORUM_VOTES: readonly ['approve', 'reject', 'abstain']
export const QUORUM_TERMINAL: readonly string[]

/** Re-exported from `Utils/provenance`: the tag embedded in every minted id. */
export { BUILD_TAG } from '../Utils/provenance.js'

export type QuorumVote = 'approve' | 'reject' | 'abstain'

export type QuorumStatus = 'open' | 'approved' | 'rejected' | 'vetoed' | 'expired' | 'cancelled'

export type QuorumResult = {
	id: string
	status: QuorumStatus
	approve: number
	reject: number
	abstain: number
	threshold: number
	/** Number of eligible voters, after any subject exclusion. */
	eligible: number
	/** Approvals still needed. */
	remaining: number
	/** Eligible voters who have not voted. */
	pending: number
	decidedAt?: number
	decidedBy?: string
	expiresAt?: number
}

export type QuorumVoteOutcome = {
	counted: boolean
	reason:
		| 'counted'
		| 'closed'
		| 'expired'
		| 'invalid-voter'
		| 'invalid-vote'
		| 'not-eligible'
		| 'subject-may-not-vote'
		| 'already-voted'
		| 'unchanged'
	status: QuorumStatus
	result: QuorumResult
}

export type QuorumOptions = {
	question: string
	eligible: string[]
	/** Approvals needed. Defaults to a simple majority of eligible voters. */
	threshold?: number
	/** Alternative to `threshold`: a fraction of eligible voters, in (0, 1]. */
	thresholdRatio?: number
	/** Who the decision is about. Excluded from voting unless `subjectMayVote`. */
	subject?: string
	subjectMayVote?: boolean
	/** Voters who can end it alone with a reject. */
	veto?: string[]
	expiresAt?: number
	ttlMs?: number
	/** Allow a voter to change their mind. Default true. */
	allowChangeVote?: boolean
	id?: string
	now?: () => number
}

export type Quorum = {
	readonly id: string
	readonly question: string
	readonly subject?: string
	readonly threshold: number
	readonly buildTag: string
	readonly voters: string[]
	readonly status: QuorumStatus
	readonly open: boolean
	readonly expiresAt?: number
	readonly result: QuorumResult
	readonly ballots: Record<string, QuorumVote>
	/** Record a vote. Never throws: untrusted input gets a reason, not an exception. */
	vote(voter: string, value?: QuorumVote): QuorumVoteOutcome
	cancel(by?: string): QuorumResult
	/** Re-check expiry. */
	tick(): QuorumStatus
	render(options?: { footer?: string }): string
}

/** A group decision that counts its own votes and locks itself once settled. Pure: no I/O. */
export function createQuorum(options: QuorumOptions): Quorum

/** Render a quorum result as message text. */
export function renderQuorum(
	result: QuorumResult,
	options?: { question?: string; subject?: string; footer?: string }
): string

/** Post a quorum as a self-updating message; `onResolve` fires once, after the final frame. */
export function sendQuorum(
	sock: { sendMessage: Function },
	jid: string,
	options: QuorumOptions & {
		footer?: string
		live?: Record<string, any>
		onResolve?: (result: QuorumResult, quorum: Quorum) => any
	}
): Promise<{
	quorum: Quorum
	live: import('./LiveMessage.js').LiveMessage
	vote(voter: string, value?: QuorumVote): Promise<QuorumVoteOutcome>
	tick(): Promise<boolean>
	cancel(by?: string): Promise<QuorumResult>
}>
