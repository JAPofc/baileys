# LiveMessage

One message that keeps itself up to date, instead of a chat full of `10%… 20%… 30%…`.

```js
import { startProgressMessage } from '@japofc/baileys'

const live = await startProgressMessage(sock, jid, { total: files.length, title: 'Uploading' })

try {
  for (const file of files) {
    await upload(file)
    live.set({ done: live.state.done + 1 })   // call this as often as you like
  }
  await live.finish({ label: 'Upload complete' })
} catch (error) {
  await live.finish({ label: 'Upload failed', note: error.message })
}
```

Two hundred `set()` calls in that loop produce **two or three** actual sends.

## Why it is a builder and not four lines of your own code

Editing a message is easy; editing it *safely* is not, and the failure modes all look fine
in testing and bite in production:

| Trap | What this does |
| --- | --- |
| A loop that edits on every step spams the server and burns rate limit | Updates inside one throttle window **coalesce** into a single edit |
| The percentage has not visibly changed, but you send anyway | An identical render is **not sent at all** |
| A runaway loop edits forever | A hard **`maxEdits`** budget (default 60) |
| Two edits race and the older one lands last | An update during an in-flight edit is **queued, not raced** |
| The task throws and the interval keeps editing a dead job | `finish()`, `stop()`, `ttlMs` and the budget all **clear the timer**, and the timer is `unref`'d |
| A background edit rejects and takes the process down | Failures go to **`onError`**; nothing is thrown asynchronously, ever |
| The server keeps rejecting and the bot keeps retrying | It **gives up** after 3 consecutive failures |

The throttle has a floor of one second. A shorter one is not a preference, it is a mistake,
so it is clamped rather than honoured.

## Custom renders

`render` is any function of state. Return a string, or a full message content object if you
need mentions or formatting.

```js
import { createLiveMessage } from '@japofc/baileys'

const live = createLiveMessage(sock, jid, {
  state: { scores: {}, minute: 0 },
  throttleMs: 5000,
  maxEdits: 120,
  ttlMs: 2 * 60 * 60 * 1000,
  onError: (error, phase) => logger.warn({ error, phase }, 'live message'),
  render: s => [
    `*Match — minute ${s.minute}*`,
    ...Object.entries(s.scores).map(([team, goals]) => `${team}: ${goals}`)
  ].join('\n')
})

await live.start()
```

`start()` is the one call that throws on failure: if the first message never appeared there
is nothing to edit and the caller needs to know. Every later send reports through `onError`
instead.

## API

| Member | Behaviour |
| --- | --- |
| `start(initialState?)` | Sends the first message. Throws on failure. Returns the sent message |
| `set(patch)` | Merge state, schedule an edit. Returns `false` once inactive |
| `update(fn)` | `set()` computed from the current state |
| `flush(patch?)` | Edit now, ignoring the throttle. Still skips no-ops |
| `finish(patch?)` | Final render, then stop. Idempotent, never throws, safe in `finally` |
| `stop()` | Stop with no final edit |
| `key` `state` `status` `active` `stats` `remainingEdits` | Read-only state |

`status` is one of `idle`, `live`, `finished`, `stopped`, `exhausted` (budget spent) or
`failed` (gave up after repeated send errors). `stats` counts `edits`, `skipped`,
`coalesced` and `errors` — useful for checking that your throttle is actually set sensibly.

The final `finish()` frame is allowed one edit past the budget. A progress message that is
stuck at 94% forever because it ran out of edits is worse than useless, so the result always
lands.

## Helpers

- `progressRenderer({ title, barSize, showEta, footer })` — the standard progress layout:
  title, bar, counts, elapsed, and an ETA that only appears once there is enough progress
  for the estimate to mean anything. A confidently wrong ETA is worse than no ETA.
- `startProgressMessage(sock, jid, options)` — create it, start it, hand it back live.

## Correlation id

Every live message carries `live.id`, of the form `LVM-ED6652-1A2B3C4D`. Log it next to your
own errors — `onError(error, phase, id)` receives it — so a failed edit can be traced back
to the job that owned it.

The middle group is `BUILD_TAG` (see [Provenance](./provenance.md)): attribution compiled
into runtime data rather than written in a comment. It is **never written into the message
body**. Putting marks in content that gets sent to somebody's chat is not ours to do, and a
test asserts it does not happen.

Pass `id` yourself if you have your own scheme.
