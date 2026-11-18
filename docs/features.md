# Feature reference

[← back to the README](../README.md)

## 🔥 Features

<table>
<tr>
<th align="center">💬 Interactive Messages</th>
<th align="center">🛒 Commerce & Business</th>
<th align="center">🧩 Utility Features</th>
</tr>
<tr>
<td valign="top">

- Native Flow
- Buttons (V1 / V2 / V3)
- Lists
- Carousel Messages
- Poll & Quiz Messages
- Rich Response Messages (AIRich)
- HTML cards (experimental)
- CTA / Reply / URL Buttons
- Call Buttons
- OTP Buttons
- Authentication Buttons

</td>
<td valign="top">

- Catalog Message
- Order Details
- Order Status
- Review & Pay
- Payment Status
- Payment Method
- Track Order
- Reorder
- Cancel Order

</td>
<td valign="top">

- Group Status Support
- Mention All
- Lottie Sticker Support
- Newsletter Support
- ExternalAdReply Helper
- View Once Support
- Rich Formatting
- Code Highlighting

</td>
</tr>
</table>

<table>
<tr>
<th align="center">🔐 Auth & Storage</th>
<th align="center">📞 Realtime</th>
<th align="center">🛠 Developer Tooling</th>
</tr>
<tr>
<td valign="top">

- Multi-file auth state
- Single-file auth state
- SQLite auth state
- Cache-manager auth state
- In-memory store
- SQLite / MongoDB / MySQL /
  PostgreSQL / Redis store adapters

</td>
<td valign="top">

- Voice calling (VoIP, WASM engine)
- User sync queries (WAUSync)
- Presence / status / device lookup
- Event buffer for high-volume bots

</td>
<td valign="top">

- Full TypeScript definitions (`.d.ts`)
- Anti-delete & anti-edit detection (recover deleted messages, capture pre-edit content)
- Message search helpers
- Auto-reply engine
- Scheduling helpers
- Message retry manager

</td>
</tr>
</table>

---

## ✨ Exclusive J.AP Enhancements

### Audio Group Status Fix
Audio status uses a more compatible implementation to avoid unsupported-version errors on older WhatsApp clients.

### AIRich — the rich-response message builder
A chainable builder (`AIRich`, also exported as `AIJap` / `LeafRich` / `JapAI` / `JapRich`) with 40+ `add*()`/`set*()` methods covering headings, formatted text (hyperlinks/citations/LaTeX), code blocks, tables, image/video/product/post cards, task & progress cards, tip banners, and quick-reply suggestions — the kind of rich card layout you'd normally only see from an official AI/assistant-style bot. See [Usage Examples](#airich--rich-response-cards) below.

### Interactive buttons

`sendMessage()` routes interactive content through the handler set, so all of these send
as the message type they name — no extra helper, no manual `relayMessage`:

```ts
// native-flow shorthands: id = quick_reply, url = cta_url, copy = cta_copy,
// call = cta_call, sections = single_select, webview, flow, catalog, … (~30 of them)
await sock.sendMessage(jid, {
    text: 'Pick one',
    footer: 'powered by JAP',
    nativeFlow: [
        { text: 'Yes', id: '.yes' },
        { text: 'Open', url: 'https://example.com' },
        { text: 'Copy code', copy: 'JAP2026' }
    ]
})

// or hand-built native-flow buttons, for anything the shorthands do not cover
await sock.sendMessage(jid, {
    text: 'Do you agree?',
    title: 'Confirmation',
    interactiveButtons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Yes', id: '.yes' }) }
    ]
})
```

The same path handles `interactiveMessage`, carousels, `requestPaymentMessage`,
`productMessage`, `groupInviteMessage`, `eventMessage`, `pollResultMessage` and
`groupStatusMessage`. Each returns a normal `WAMessage` and is emitted on
`messages.upsert` like any other send. Pass `{ disableJapyea: true }` in the options to
force the core message builder instead.

A button shape that matches no shorthand is now **rejected with an error** rather than
sent as an invisible empty button, so a typo fails loudly at send time.

### Knowing when an app-state sync was only partial

`decodePatches()` no longer pretends a collection is synced when one of its patches could
not be applied. The state it returns is the last patch that actually applied **and**
verified, and the failure is reported instead of swallowed:

```js
const { state, mutationMap, incomplete, synced } = await decodePatches(/* … */)

if (!synced) {
    // incomplete = { version, reason: 'decode-failed' | 'lthash-mismatch', error? }
    console.warn(`app state stopped at v${state.version}, patch v${incomplete.version} failed`)
}
```

Persist `state` as usual — because it never runs ahead of the mutations it actually
delivered, the next resync re-fetches the missing patches instead of skipping them. The
socket does this for you: an incomplete sync is retried with a full snapshot, the same way
a thrown sync error already was.

### Telling fatal disconnects apart

Not every close deserves a reconnect. `classifyDisconnect()` labels each one and
`autoReconnect()` acts on it:

| close | what happens |
| --- | --- |
| `connectionReplaced` (440) | **stops** — another process owns this session; reconnecting starts a kick-war |
| `forbidden` (403) | **stops** — the number is restricted; retrying can escalate it |
| `multideviceMismatch` (411) | **stops** — re-pair required |
| `loggedOut` (401) | **stops** — credentials are dead |
| `badSession` (500) | retries, and only stops after **3 in a row** (`badSessionStreak`) |
| `connectionLost`, `timedOut`, `restartRequired`, … | retries with backoff, as before |

```ts
const manager = autoReconnect(() => makeWASocket({ auth: state }), {
    badSessionStreak: 3, // default
    onFatal: ({ verdict, message, badSessions }) => {
        console.error(message) // "⚔️ [conflict 440] … ↳ FATAL: STOP this process. …"
        if (verdict.category === 'auth') void wipeAuthFolder()
    }
})
```

`explainDisconnect(code)` gives the same one-liner for any code, and
`explainDisconnect(code, { streak: 2 })` reports `2/3 in a row — retrying` instead of
declaring a corrupt session on the first bad decrypt. Set `reconnectOnFatal: true` to opt
back into the old always-retry behaviour.

### Fetching from your own intranet

The SSRF guard that protects link previews and `getHttpStream()` rejects loopback,
private, link-local and cloud-metadata addresses — including IPv4-mapped IPv6 such as
`[::ffff:169.254.169.254]`. To reach one specific internal host, exempt just that host
instead of disabling the guard:

```ts
await assertSafeHttpUrl(url, { allowHosts: ['media.lan', '127.0.0.1'] })
```

`allowPrivate: true` still exists, but it switches the check off for *every* host — prefer
`allowHosts` when the URL can come from anywhere.

### Checking a rate limit without spending it

`createRateLimiter()` (used by `withPairingGuard`) can be asked for a verdict without
consuming anything:

```ts
const { allowed, retryAfterMs } = limiter.peek(phoneNumber)
if (!allowed) {
    console.log(`try again in ${Math.ceil(retryAfterMs / 1000)}s`)
}

console.log(`${limiter.remaining(phoneNumber)} pairing attempts left this hour`)
```

`peek()` leaves both the window and `stats` untouched — only `check()` spends a slot. The
pairing guard uses exactly this, so a request it refuses no longer costs you budget.

### Keeping a persistent store bounded

`maxMessagesPerChat` only caps what is hydrated into memory — the backend keeps every
message that was ever written through. Trim it yourself:

```ts
const stored = await store.countStoredMessages(jid) // what is really on disk
const removed = await store.pruneStoredMessages(jid, 5_000) // keep the newest 5k
```

`pruneStoredMessages()` deletes oldest-first and returns how many rows went; `keep: 0`
clears the chat. The in-memory view is untouched (it is already capped).

### Which ffmpeg am I using?

```ts
import { inspectFfmpegPath, setFfmpegPath } from '@japofc/baileys'

const { path, source, rejected } = await inspectFfmpegPath()
console.log(path, 'via', source) // e.g. '/usr/bin/ffmpeg via PATH'
for (const r of rejected) {
    console.warn(`skipped ${r.source} "${r.path}": ${r.problem}`)
}
```

A candidate is only accepted if it is an executable regular file, so a path that lost its
`+x` bit — or a typo in `FFMPEG_PATH` — is skipped instead of being handed to `spawn()`,
and auto-detection carries on to `ffmpeg-static` / the system binary. `rejected` tells you
exactly what was passed over and why.

### Waiting for an event

`waitForEvent` awaits the next matching event and detaches its listener on every exit path
— resolve, timeout, abort, or a throwing predicate — so the usual "do something, then wait
for the confirming event" pattern stops leaking listeners.

```ts
import { waitForEvent } from '@japofc/baileys'

// wait for the metadata of one specific group
const update = await waitForEvent(sock.ev, 'groups.update', {
    pick: updates => updates.find(u => u.id === groupJid), // undefined keeps waiting
    timeoutMs: 10_000
})

// or keep the whole payload, with an abort signal instead of a timeout
const upsert = await waitForEvent(sock.ev, 'messages.upsert', {
    filter: up => up.type === 'notify',
    timeoutMs: 0,
    signal: controller.signal
})
```

`timeoutMs` defaults to 30 s; `0` or a negative value disables it. Remember that buffered
events arrive consolidated, so the payload is whatever the flush produced — that is what
`pick` is for.

### HTML cards — experimental

WhatsApp's rich-response surface also carries an **unshipped** primitive that renders a full
HTML/CSS/JS document inside the chat card, in the client's own sandboxed webview. Its
internal typename is `FOAHtmlPrimitiveDemoDONOTUSE` — the `DemoDONOTUSE` suffix is
WhatsApp's own feature-flag naming, not a warning from this library.

```js
await sock.sendMessage(jid, {
    html: `<!doctype html><html><head><style>
      body { background:#111b21; color:#e9edef; font-family:system-ui; text-align:center; padding:24px }
      button { background:#00a884; color:#0b141a; border:0; border-radius:10px; padding:12px 24px; font-weight:bold }
    </style></head><body>
      <h2>Mini Clicker</h2><div id="n" style="font-size:36px">0</div>
      <button onclick="document.getElementById('n').textContent = ++c">TAP ME</button>
      <script>let c = 0</script>
    </body></html>`
})
```

- Several cards at once: `{ html: [docA, docB] }`.
- Mix it with the other primitives: `{ richResponse: [{ text: 'play:' }, { html: doc }] }`.
- Allow-list origins the document may reach with `{ html: doc, trustedSources: ['https://example.com'] }`.
- Socket-free helpers: `assessHtmlCard(html)` / `assertHtmlCard(html)` (non-empty string, 256 KiB
  default ceiling, byte-accurate), plus `buildHtmlPrimitiveSection()` and
  `buildHtmlUnifiedResponse()` if you assemble the payload yourself.

> **Treat this as experimental.** It is not a documented, stable message type: rendering
> depends on the recipient's client build and may disappear without notice. Markup is sent
> verbatim — never interpolate untrusted input into it.

### Native Flow Expansion

Every shorthand below is a key you put on a button object in `nativeFlow: [...]`; the
right-hand column is the native-flow `name` that goes on the wire. `text` sets the label
on all of them, `icon` is optional.

| shorthand | native-flow name | | shorthand | native-flow name |
| --- | --- | --- | --- | --- |
| `id` | `quick_reply` | | `card` | `card_message` |
| `reply` | `quick_reply` | | `orderDetails` | `order_details` |
| `url` (or `urlBtn`) | `cta_url` | | `orderStatus` | `order_status` |
| `copy` | `cta_copy` | | `reviewAndPay` | `review_and_pay` |
| `call` (or `phoneNumber`) | `cta_call` | | `paymentStatus` | `payment_status` |
| `sections` | `single_select` | | `paymentMethod` | `payment_method` |
| `webview` / `openWebview` | `open_webview` | | `trackOrder` | `track_order` |
| `reminder` | `cta_reminder` | | `reorder` | `reorder` |
| `cancelReminder` | `cta_cancel_reminder` | | `cancelOrder` | `cancel_order` |
| `address` | `address_message` | | `clearChat: true` | `clear_chat` |
| `location: true` | `send_location` | | `screen` | `navigateToScreen` |
| `catalog` | `catalog_message` | | `flow` | `flow` |
| `products` | `mpm` | | `voiceCall` / `videoCall` | `voice_call` / `video_call_button` |

```js
await sock.sendMessage(jid, {
    text: 'Order #1234',
    nativeFlow: [
        { text: 'Track', trackOrder: 'ORD-1234' },
        { text: 'Open app', webview: { url: 'https://shop.example/track', inAppWebview: true } },
        { text: 'Menu', sections: [{ title: 'Help', rows: [{ title: 'Contact us', id: '.cs' }] }] }
    ]
})
```

**`open_webview` is a real in-app WebView button** and is its own native-flow name — it is
not the same thing as `cta_url`'s `webview_interaction` flag, which modern WhatsApp clients
ignore. Pass a url string or `{ url, title?, inAppWebview? }`.

**Not supported, on purpose:** `otp_button` / `authentication_button` are WhatsApp Business
Platform (Cloud API) template buttons gated behind Meta template approval — no MD-protocol
library can produce them. The old `call_button` / `url_button` / `reply_button` names come
from the deprecated `buttonsMessage` system and are silently ignored by current clients;
`phoneNumber`, `urlBtn` and `reply` above are their working equivalents. Commerce buttons
(`card_message`, `order_*`, `review_and_pay`, `payment_*`) only render when the ids resolve
to a real Commerce order on your catalog/business account; `flow` needs a published Flow ID.

### System Notification Filter

Messages include:

```js
message.isSystemNotification
```

Useful for filtering:

- E2E notices
- Meta service notices
- Other system-generated messages

---
