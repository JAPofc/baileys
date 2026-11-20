# Quorum

A group decision that counts its own votes and locks itself when it is settled.

```js
import { sendQuorum } from '@japofc/baileys'

const session = await sendQuorum(sock, groupJid, {
  question: 'Remove @spammer from the group?',
  eligible: admins,          // only these votes count
  subject: spammerJid,       // and not this one, even if they are an admin
  threshold: 3,
  ttlMs: 10 * 60 * 1000,
  onResolve: async result => {
    if (result.status === 'approved') {
      await sock.groupParticipantsUpdate(groupJid, [spammerJid], 'remove')
    }
  }
})

// wire this to your command handler / poll-update listener
await session.vote(voterJid, 'approve')
```

The tally lives in **one message** that edits itself (see
[LiveMessage](./live-message.md)); fifteen votes do not produce fifteen messages.

## What it gets right that a poll plus a timer does not

| Trap | What this does |
| --- | --- |
| Anyone in the group can vote, including the person being kicked | Only `eligible` votes count, and `subject` is excluded unless `subjectMayVote` |
| Voting twice counts twice | One ballot per voter; a changed vote **replaces**, never adds |
| The tally keeps moving after the decision | It **latches** — later votes return `reason: 'closed'` |
| A hopeless vote runs the full ten minutes | It **rejects early**, the moment the remaining voters cannot reach the threshold |
| An abstention quietly counts as a free pass | An abstention uses the ballot up and counts against reachability |
| The action fires from a timer nobody cancelled | `onResolve` fires **once**, after the final frame is written |
| A typo in `threshold` makes a vote that can never pass | A threshold above the electorate **throws at construction** |

Expiry is a decision, not a leak: a timed-out quorum resolves as `expired`, once, keeping
the tally and the `decidedAt` it had at the moment the clock ran out.

The core (`createQuorum`) is pure — no socket, no timers, no I/O — so you can drive it from
button replies, poll updates, slash commands, or a test, and inject `now` for the clock.

## Reading the result

```js
quorum.result
// {
//   id: 'QRM-ED6652-1A2B3C4D', status: 'open',
//   approve: 2, reject: 0, abstain: 0,
//   threshold: 3, eligible: 4, remaining: 1, pending: 2,
//   decidedAt: undefined, decidedBy: undefined, expiresAt: 1760000000000
// }
```

`status` is `open`, `approved`, `rejected`, `vetoed`, `expired` or `cancelled`.

`vote()` never throws — a vote arriving from a chat is untrusted input, and an ineligible
voter is an ordinary event. It returns `{ counted, reason, status, result }`, where `reason`
is one of `counted`, `unchanged`, `already-voted`, `not-eligible`, `subject-may-not-vote`,
`invalid-voter`, `invalid-vote`, `closed` or `expired`. Use it to reply to the voter.

## Options

| Option | Meaning |
| --- | --- |
| `question` | Required. The thing being decided |
| `eligible` | Required. Voter JIDs; duplicates are ignored |
| `threshold` | Approvals needed. Default: a simple majority of eligible voters |
| `thresholdRatio` | Fraction of eligible voters, `(0, 1]`, as an alternative to `threshold` |
| `subject` | Who the decision is about |
| `subjectMayVote` | Let the subject vote anyway. Default `false` |
| `veto` | Voters who can end it alone with a reject |
| `ttlMs` / `expiresAt` | When it expires |
| `allowChangeVote` | Default `true` |
| `now` | Injectable clock |

## Rendering

`renderQuorum(result, { question, subject, footer })` shows the threshold and the
electorate size, not just the count: "2 approvals" means nothing without "of 3 needed, from
4 admins", and a vote whose rules are invisible is a vote people argue about afterwards.

Pass your own `render` through `live` if you want a different layout.

## A note on the ids

Every quorum id looks like `QRM-ED6652-1A2B3C4D`. The middle group is `BUILD_TAG`, a hash
of this project's name, author and repository — attribution compiled into runtime data
rather than written in a comment. See [Provenance](./provenance.md) for why that matters.
