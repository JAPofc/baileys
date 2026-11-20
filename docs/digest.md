# Digest

Collect many small events and post **one** summary instead of many messages.

```js
import { startDigest } from '@japofc/baileys'

const activity = startDigest(sock, groupJid, {
  every: 'hourly',
  title: 'Group activity',
  groupBy: e => e.type,
  dedupeKey: e => `${e.type}:${e.actor}`,
  format: e => e.text
})

sock.ev.on('group-participants.update', ({ participants, action }) => {
  for (const actor of participants) {
    activity.add({ type: action, actor, text: `${actor.split('@')[0]} ${action}` })
  }
})

setInterval(() => activity.tick(), 60_000)   // or pass autoTickMs
```

Two hundred joins and leaves become one message:

```
*Group activity*
200 events in the last 60 min

*add* (143)
• 62811… add x143

*remove* (57)
• 62877… remove x57
```

## What it gets right

| Trap | What this does |
| --- | --- |
| An unbounded buffer dies on the busiest day | `maxEvents` caps stored **bodies**; the **counts** keep going, so a flood is still reported |
| Silent truncation tells you a quiet lie | Overflow is stated: `… and 17 more lines`, `(48 events … counted but not listed)` |
| Seven identical lines | `dedupeKey` collapses them into one line with `x7` |
| "Nothing happened" posted every day at 9am | An empty window says nothing (`quietIfEmpty`) |
| Events arriving mid-send are lost or doubled | `flush()` **reopens the buffer before rendering**; late events land in the next window |
| The digest resets on every deploy and never fires | `toJSON()` / `restoreDigest()` persist the open window |
| "Daily" means 24h after whatever time the process booted | `align: true` + `atHour` pins it to a real time of day |
| A missed window leaves the schedule in the past | The release time rolls forward to the next future boundary |

The core is pure — no socket, no timers, no I/O, injectable `now` — so you can drive it from
anything and test it without waiting.

## Persisting across restarts

Bots restart constantly. A digest that loses its window on deploy effectively never fires.

```js
// on shutdown
await fs.writeFile('digest.json', JSON.stringify(activity.stop()))

// on boot
const state = JSON.parse(await fs.readFile('digest.json', 'utf8'))
const digest = restoreDigest(state, { every: 'hourly', dedupeKey: e => e.id })
```

Broken or half-written state is ignored rather than thrown, because a corrupt state file
should cost you one window, not the whole bot.

## API

| Member | Behaviour |
| --- | --- |
| `add(event)` | Buffer one event. Returns `{ accepted, reason, total }` where reason is `counted`, `merged` or `dropped` |
| `due(at?)` | Is the window over? |
| `peek(at?)` | Current summary without closing |
| `flush(at?)` | Close, reopen, return `{ text, summary, released }` |
| `reset(at?)` | Discard the window without releasing |
| `toJSON()` / `load(state)` | Persistence |
| `size` `unique` `dropped` `releases` `empty` `openedAt` `releaseAt` | Read-only state |

Options: `every` (`'hourly'`, `'daily'`, `'weekly'` or ms), `title`, `maxEvents`,
`maxLines`, `groupBy`, `dedupeKey`, `format`, `render`, `quietIfEmpty`, `align`, `atHour`,
`releaseAt`, `now`.

`startDigest(sock, jid, options)` adds `autoTickMs` (internal `unref`'d timer), `onError`,
and gives you `add`, `tick()`, `release()`, `stop()`. Releases never overlap: a slow send
cannot be re-entered by the next tick.

## Ids

Each digest carries `DGST-<BUILD_TAG>-<random>` for logs — see
[Provenance](./provenance.md). It is never written into the posted text.
