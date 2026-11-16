<div align="center" id="top">

<img src="./Media/japofc-logo.png" width="140" alt="JAPofc logo" />

# @japofc/baileys

### ⚡ The maintained WhatsApp Web API for Node.js

<em>Typed ESM&nbsp;·&nbsp;always-current WA&nbsp;Web versioning&nbsp;·&nbsp;protocol-safe tooling&nbsp;·&nbsp;140+ production bot utilities</em>

<br/>

<!-- identity -->
<p>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/v/@japofc/baileys?color=25D366&label=npm&logo=npm&logoColor=white&style=for-the-badge" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/dt/@japofc/baileys?color=128C7E&label=downloads&logo=npm&logoColor=white&style=for-the-badge" alt="npm downloads" /></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-555?style=for-the-badge" alt="GPL-3.0-or-later license" /></a>
</p>

<!-- quality -->
<p>
<img src="https://img.shields.io/badge/node-%E2%89%A5%2020-3C873A?style=flat-square&logo=node.js&logoColor=white" alt="Node >=20" />
<img src="https://img.shields.io/badge/module-ESM-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="ESM only" />
<img src="https://img.shields.io/badge/types-bundled%20.d.ts-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript types" />
<img src="https://img.shields.io/badge/tests-1804%20passing-2ecc71?style=flat-square&logo=nodedotjs&logoColor=white" alt="tests passing" />
<img src="https://img.shields.io/badge/audit-0%20vulnerabilities-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="npm audit clean" />
</p>

<p>
<a href="https://whatsapp.com/channel/0029VbEVFrILtOjAOu4FXa3r"><img src="https://img.shields.io/badge/Follow%20on%20WhatsApp-JAPofc%20Channel-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="JAPofc WhatsApp Channel" /></a>
</p>

<h4>

[📦 Install](#install)&nbsp;·&nbsp;[🚀 Quick start](#quick-start)&nbsp;·&nbsp;[🔥 Features](#-features)&nbsp;·&nbsp;[💡 Examples](#-usage-examples)&nbsp;·&nbsp;[📘 TypeScript](#-typescript-support)&nbsp;·&nbsp;[❓ FAQ](#-faq--troubleshooting)&nbsp;·&nbsp;[🇮🇩 Bahasa Indonesia](./README.id.md)

</h4>

</div>

---

<table>
<tr>
<td width="33%" valign="top" align="center">

### 🔌 Reliable core

Predictable socket, auto WA-Web version resolution, reconnect + anti-ban toolkit — **no hidden side effects**.

</td>
<td width="33%" valign="top" align="center">

### 🧩 Batteries included

Buttons, native flows, carousel, AIRich cards, polls, channels, VoIP, and **140+ bot utilities**.

</td>
<td width="33%" valign="top" align="center">

### 🛡️ Production-ready

Bundled `.d.ts`, multi-backend auth, credential redaction, session tools — **1804 tests, 0 vulns**.

</td>
</tr>
</table>

<details>
<summary><b>📑 Table of contents</b> — click to expand</summary>

<br/>

> **Getting started** &nbsp;›&nbsp; [Install](#install) · [Quick start](#quick-start) · [Overview](#overview) · [Installation](#-installation) · [Authentication](#-authentication) · [Store backends](#️-store-backends)
>
> **What's inside** &nbsp;›&nbsp; [Comparison](#-comparison) · [Built with](#-built-with) · [Features](#-features) · [Exclusive J.AP enhancements](#-exclusive-jap-enhancements) · [New in v2.4.5](#-new-in-v245)
>
> **Messaging** &nbsp;›&nbsp; [Usage examples](#-usage-examples) · [Message helpers](#-message-helpers) · [Channels, history & transcripts](#-channels-history--transcripts) · [WA 2026 catch-up](#-wa-2026-catch-up)
>
> **Calls & sync** &nbsp;›&nbsp; [Voice & video calls](#-voice--video-calls) · [User sync queries](#-user-sync-queries) · [Username management](#-username-management)
>
> **Toolkit** &nbsp;›&nbsp; [Everyday utilities](#-everyday-utilities) · [Security pack](#-security-pack) · [Bot framework](#-bot-framework) · [Utility modules](#-utility-modules)
>
> **Reference** &nbsp;›&nbsp; [Recommended environment](#-recommended-environment) · [TypeScript support](#-typescript-support) · [FAQ & troubleshooting](#-faq--troubleshooting) · [Contributing](#-contributing) · [Credits](#-credits) · [Maintainer](#-maintainer)

</details>

---

## Install

```bash
npm i @japofc/baileys
```

Node.js 20+ is required. The package is ESM-only and has no install/postinstall scripts.

## Quick start

```js
import makeWASocket, { useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state, printQRInTerminal: true })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg?.message || msg.key.fromMe) return
  await sock.sendMessage(msg.key.remoteJid, { text: 'pong' }, { quoted: msg })
})
```

## Overview

`@japofc/baileys` is a production-oriented WhatsApp Web library for bot builders who need predictable socket behavior, complete TypeScript declarations, and maintained utilities without hidden side effects.

- Current WA Web fallback version plus `makeWASocketAuto()` for live version resolution.
- Full WAProto declarations and deep package exports for installed-package consumers.
- Auth backends for files, SQLite, Redis, MongoDB, MySQL, and PostgreSQL.
- Interactive messages, native flows, carousel, AIRich cards, channels/newsletters, status helpers, and bot modules.
- Hardened media/link fetching, credential redaction, session tools, reconnect helpers, and protocol-capture tooling.
- **No implicit group/channel join or follow.** Join/follow helpers remain available, but they only run when your code explicitly calls them.

---

## 🆚 Comparison

How `@japofc/baileys` stacks up against other Baileys libraries:

| Capability | `@japofc/baileys` | Other forks (typical) |
|---|:---:|:---:|
| Native Flow buttons (V1/V2/V3) | ✅ | ⚠️ partial |
| Carousel messages | ✅ | ❌ |
| Rich response cards (AIRich) | ✅ | ❌ |
| Commerce flow (catalog/order/payment) | ✅ | ⚠️ partial |
| Voice calling (VoIP) | ✅ experimental | ❌ |
| Multi-backend store (SQL/Mongo/Redis) | ✅ | ⚠️ partial |
| Full `.d.ts` TypeScript definitions | ✅ | ⚠️ partial |
| User sync queries (WAUSync) | ✅ | ✅ |
| Username management (check/set/pin/recommend) | ✅ | ❌ |
| Bot framework (middleware, session, stats) | ✅ | ❌ |
| Built-in QR render (terminal/SVG/PNG, zero deps) | ✅ | ❌ needs `qrcode-terminal` |
| Auto WA Web version resolution | ✅ | ❌ hardcoded |
| Status mentions (notify users/groups of your status) | ✅ | ❌ |
| Anti-ban toolkit (warmup ramps, group-op ceilings, disconnect classifier, Gaussian jitter) | ✅ | ❌ |
| Crash-message shield (mention bombs, zalgo, RTLO spoofing) | ✅ | ❌ |
| Session doctor + portable/encrypted session strings | ✅ | ❌ |
| Community/bot modules (economy, games, rental, moderation — 140+ utils) | ✅ | ❌ |
| Sticker EXIF branding | ✅ pure JS | ⚠️ needs `node-webpmux` |
| CLI (`doctor` / `session` / `sticker` / `export` / `wa`) | ✅ | ❌ |
| Credential-redacting logger | ✅ | ❌ |

> This table describes package-level features, not performance benchmarks. PRs to update or correct it are welcome via [Contributing](#-contributing).

---

## 🧰 Built With

<p>
<img src="https://img.shields.io/badge/node.js-%2343853D.svg?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
<img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E" alt="JavaScript"/>
<img src="https://img.shields.io/badge/esm-%23F7DF1E.svg?style=for-the-badge&logo=javascript&logoColor=black" alt="ESM"/>
<img src="https://img.shields.io/badge/websocket-%23000000.svg?style=for-the-badge&logo=socket.io&logoColor=white" alt="WebSocket"/>
<img src="https://img.shields.io/badge/signal%20protocol-%233A76F0.svg?style=for-the-badge&logo=signal&logoColor=white" alt="Signal Protocol"/>
<img src="https://img.shields.io/badge/protobuf-%23345?style=for-the-badge&logo=google&logoColor=white" alt="Protobuf"/>
<img src="https://img.shields.io/badge/npm-%23CB3837.svg?style=for-the-badge&logo=npm&logoColor=white" alt="npm"/>
</p>

<p>
<a href="https://skillicons.dev">
  <img src="https://skillicons.dev/icons?i=nodejs,js,ts,npm,docker,redis,mongodb,mysql,postgresql,sqlite" alt="Tech stack icons"/>
</a>
</p>

---

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

## 📦 Installation

```bash
npm install @japofc/baileys
```

Directly from GitHub:

```bash
npm install github:JAPofc/baileys
```

> Requires **Node.js 20+** — enforced at import time with a clear error (no install scripts: this package deliberately ships **zero** `preinstall`/`postinstall` hooks, so `npm ci --ignore-scripts` and strict supply-chain policies work out of the box).

> **Coming from `@whiskeysockets/baileys`?** Migration is usually a one-line import change — see [MIGRATION.md](./MIGRATION.md).

### Optional peer dependencies

Everything below is **optional** — the socket works without any of them. Install only what the features you use need; missing ones fail with a clear install hint instead of a silent crash.

| Package | Compatible versions | Unlocks |
|---|---|---|
| `sharp` | any | Fast image resizing/processing (used by the message builders' `Toolkit.resize`) |
| `@napi-rs/image` | `~1.12.x` | Lighter native alternative to `sharp` for image ops |
| `jimp` | bundled (`^1.6.x`) | Pure-JS image fallback when neither of the above is installed — ships as a regular dependency, nothing to install |
| `fluent-ffmpeg` | `^2.1.3` | Audio/video conversion for media messages |
| `ffmpeg-static` | `>=5.0.0` | Bundled ffmpeg **binary** — auto-detected, zero config (~80MB; not available for Termux/Android, use `pkg install ffmpeg` there) |
| `@ffmpeg-installer/ffmpeg` | `>=1.1.0` | Alternative bundled ffmpeg binary — also auto-detected |
| `audio-decode` | `^2.2.3` | Audio waveform/duration extraction (voice notes, VoIP capture) |
| `link-preview-js` | `^3.x` | Rich link previews for URLs in outgoing text messages |
| `better-sqlite3` | `^11.x` (Node 20 ABI) | SQLite auth state, SQLite store adapter, **and** the [Bot Framework](#-bot-framework)'s `SQLiteStore`/`StatsManager` |
| `mongodb` | `^6.10+` | MongoDB store adapter |
| `mysql2` | `^3.11+` | MySQL store adapter |
| `pg` | `^8.13+` | PostgreSQL store adapter |
| `ioredis` | `^5.4+` | Redis store adapter |
| `@roamhq/wrtc` | any (platform-dependent native bindings) | Native WebRTC bindings for [voice calling](#-voice--video-calls) |
| `axios` | any (optional) | Fallback HTTP client for URL thumbnails in button messages — **not required**: the built-in `fetch` (Node 18+) is used first |

The version column mirrors this package's `peerDependencies` ranges — those are the ranges the test suite runs against. Newer majors usually work but aren't verified; `npm ls <pkg>` + `printEnvironmentReport()` (below) will tell you what you actually have.

#### ffmpeg: how it's found

Every feature that shells out to ffmpeg (video thumbnails, sticker conversion, voice-note conversion, VoIP audio feeding) resolves the binary through one central resolver, in this order:

1. **Your override** — `setFfmpegPath('/path/to/ffmpeg')` (exported from the package) or the `FFMPEG_PATH` env var
2. **`ffmpeg-static`** — if installed, its bundled binary is used automatically
3. **`@ffmpeg-installer/ffmpeg`** — same, as an alternative
4. **System `ffmpeg`** on your `PATH`

So on a normal server you can just `npm i ffmpeg-static` and never think about it. On **Termux/Android** (where neither npm package ships a binary) install the system one instead — it's picked up automatically:

```sh
pkg install ffmpeg
```

If nothing is found, the feature fails with a per-platform install hint instead of a cryptic `spawn ffmpeg ENOENT`.

#### Check your environment (doctor)

Wondering why some feature doesn't work? One call diagnoses everything — Node version, which optional deps are installed, where ffmpeg was found, the active image backend:

```js
import { printEnvironmentReport } from '@japofc/baileys'
await printEnvironmentReport() // prints a full report + returns the snapshot
// or the raw-data version without printing:
import { checkEnvironment } from '@japofc/baileys'
const env = await checkEnvironment() // { ok, platform, node, ffmpeg, imageBackend, optionalDeps, warnings }
```

Or straight from the terminal, no code needed:

```sh
npx @japofc/baileys doctor    # exit code 0 = all good, 1 = warnings
npx @japofc/baileys version
npx @japofc/baileys export dump.json --format csv --out chat.csv   # WAMessage JSON → transcript
```

---

## 🚀 Quick Start

```js
import { makeWASocketAuto, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')

// makeWASocketAuto resolves the freshest WA Web version before connecting
// (WA sw.js -> fork -> fallback), preventing stale-version pairing 405s.
// Prefer sync? `makeWASocket({ auth: state })` still works exactly as before.
const sock = await makeWASocketAuto({
    auth: state
})

// persist credentials whenever Baileys updates them
sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update

    // Easiest: pass `printQRInTerminal: true` to makeWASocket and the QR is
    // drawn automatically with the built-in zero-dependency renderer.
    // Manual/custom rendering from the event also works:
    //   import { renderQRToTerminal, qrToSVG, qrToPNG } from '@japofc/baileys'
    //   if (qr) console.log(renderQRToTerminal(qr))          // terminal (▀▄█)
    //   if (qr) fs.writeFileSync('qr.svg', qrToSVG(qr))      // for a web UI
    //   if (qr) fs.writeFileSync('qr.png', qrToPNG(qr))      // raster (send anywhere)
    if (qr) console.log('Got a pairing QR')

    if (connection === 'open') console.log('🍃 Connected!')
})

sock.ev.on('messages.upsert', ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    console.log('New message from', msg.key.remoteJid)
})
```

**Production tip** — wrap the socket in `autoReconnect()` and disconnect handling is done for you (exponential backoff, never reconnects on `loggedOut`, immediate reconnect after pairing):

```js
import { makeWASocketAuto, autoReconnect, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const manager = autoReconnect(() => makeWASocketAuto({ auth: state, printQRInTerminal: true }), {
    onSocket: sock => {
        sock.ev.on('creds.update', saveCreds)
        sock.ev.on('messages.upsert', handler) // re-attached on every reconnect
    },
    onLoggedOut: () => console.log('delete auth_info/ and re-pair'),
})
await manager.start()
```

Full runnable version: [`examples/auto-reconnect-bot.js`](./examples/auto-reconnect-bot.js).

**Observability** — attach `createDebugMonitor()` for a safe, structured snapshot
(connection state, disconnect reason, uptime, message latency percentiles, send-retry
counts, Signal error tallies, VoIP/WASM state, memory). It **never** contains QR
payloads, pairing codes, auth keys, tokens, or private keys — the whole snapshot is
passed through `redactSecrets()` before it is returned, so it's safe to log or attach
to bug reports as-is:

```js
import { createDebugMonitor } from '@japofc/baileys'

const monitor = createDebugMonitor(sock)
// later — in a health endpoint, cron log, or crash handler:
console.log(JSON.stringify(monitor.getDebugInfo(), null, 2))
// { connection: { state, uptimeMs, lastDisconnect: { code, reason } },
//   messages: { received, decryptFailed, latencyMs: { p50, p90, p99 } },
//   sendRetries, signalErrors: { noSession, badMac, ... }, voip, memory }
```

**Experimental protocol capture** — new WhatsApp features should not be faked from
wishful thinking; first capture the consenting test account's BinaryNode shape, redact
secrets, then add a high-level wrapper once the wire contract is known:

```js
import { bindProtocolCapture } from '@japofc/baileys'

const capture = bindProtocolCapture(sock, { file: './wa-protocol.ndjson' })
// trigger the feature on a paired official client/test account
// each line is redacted JSON: { direction, summary, node }
await capture.close()
```

---

## 🔐 Authentication

Four auth-state backends ship out of the box. All return the same `{ state, saveCreds }` shape expected by `makeWASocket({ auth })`, so they're drop-in interchangeable.

| Function | Storage | Best for |
|---|---|---|
| `useMultiFileAuthState(folder)` | One JSON file per key, on disk | Default choice — simple, debuggable, works everywhere |
| `useSingleFileAuthState(fileName)` | One JSON file, on disk | Small bots where a single file is easier to manage/back up |
| `useSqliteAuthState(opts)` | SQLite (`better-sqlite3`) | Bots that already use SQLite, or want auth in one embedded DB file |
| `useCacheManagerAuthState(store, sessionKey)` | Any [`cacheable`](https://www.npmjs.com/package/@cacheable/node-cache)-compatible store | Multi-session hosting panels, Redis-backed setups |
| `useRedisAuthState(opts)` | Redis (`ioredis` **or** node-redis client) | Multi-instance bots, fast shared session storage |
| `useMongoAuthState(opts)` | MongoDB (`mongodb` collection) | Bots already on Mongo; one document per key |
| `usePostgresAuthState(opts)` | Postgres (`pg` Pool/Client) | Production deployments on Postgres; table auto-created |
| `useMySQLAuthState(opts)` | MySQL/MariaDB (`mysql2/promise`) | Shared-hosting setups; table auto-created |
| `makeAuthStateFromStore(store)` | **Any** key-value backend you implement | Custom databases — implement 5 small methods and you're done |

```js
import { makeWASocket, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

### Pairing code login (no QR)

```js
import { makeWASocket, useMultiFileAuthState, formatPairingCode } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state, printQRInTerminal: false })
sock.ev.on('creds.update', saveCreds)

if (!state.creds.registered) {
    const code = await sock.requestPairingCode('628123456789') // full international number
    console.log('Pairing code:', formatPairingCode(code))      // "ABCD-EFGH"
}

// custom 8-char code (Crockford base32: 1-9, A-Z minus I/O/U)
await sock.requestPairingCode('628123456789', 'JAPJAP12')
```

Input is validated up front with clear errors instead of the classic silent server-side failures: formatting noise (`+`, spaces, dashes) is stripped, a leading `00` international call prefix is removed automatically, and the two big footguns throw immediately — **local-format numbers** (`08123...` instead of `628123...`, the #1 cause of "the pairing code never arrives") and numbers over the 15-digit E.164 maximum. The same check is exported standalone as `normalizePairingPhone(phone)`. For public-facing bots, rate-limit pairing attempts with [`withPairingGuard`](#-security-pack).

```js
// SQLite variant
import { makeWASocket, useSqliteAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useSqliteAuthState({ database: './auth.db' })
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

All four database adapters accept either an **existing client/collection** (recommended — you control pooling and lifecycle) or a `uri` (the driver is lazily imported only then; none are hard dependencies):

```js
// Redis variant — works with ioredis AND node-redis
import { makeWASocket, useRedisAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useRedisAuthState({ client: myRedis, session: 'bot-1' })
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

`useMultiFileAuthState` also exports `pruneStaleAuthFiles(folder, options)` to clean up old sender-key files on a schedule — useful for long-running bots that accumulate thousands of stale key files.

---

## 🗄️ Store Backends

`makeInMemoryStore()` from `lib/Store` gives you the classic in-memory chat/contact/message cache. For anything that needs to survive a restart, `makePersistentStore()` (from `PersistentStore.js`) wraps one of five backends behind the same interface:

| Backend | Function |
|---|---|
| SQLite | `createSqliteStoreAdapter(opts)` |
| MongoDB | `createMongoStoreAdapter(opts)` |
| MySQL | `createMysqlStoreAdapter(opts)` |
| PostgreSQL | `createPostgresStoreAdapter(opts)` |
| Redis | `createRedisStoreAdapter(opts)` |

```js
import { makeWASocket, makeInMemoryStore } from '@japofc/baileys'

const store = makeInMemoryStore({})
store.readFromFile('./baileys_store.json')
setInterval(() => store.writeToFile('./baileys_store.json'), 10_000)

const sock = makeWASocket({ /* ...auth etc */ })
store.bind(sock.ev)
```

---

## 💡 Usage Examples

### Buttons & Native Flow

```js
import { Button } from '@japofc/baileys'

await new Button(sock)
    .setTitle('Promo Spesial')
    .setBody('Diskon 20% cuma hari ini')
    .setFooter('@japofc/baileys')
    .addReply('Klaim Sekarang', 'claim_promo')
    .addUrl('Lihat Katalog', 'https://example.com/catalog')
    .addCall('Hubungi Kami', '628123456789')
    .send(jid)
```

### Poll

```js
import { Poll } from '@japofc/baileys'

await new Poll(sock)
    .setName('Mau makan apa hari ini?')
    .addOptions(['Fried Rice', 'Chicken Noodles', 'Meatballs'])
    .setSelectable(1)
    .send(jid)
```

> **v2.4.7** — the poll builder now validates before it sends. Duplicate options are
> rejected (poll results are bucketed by option text, so duplicates used to merge into
> one result), `setEndDate()` throws on an unparseable date instead of wiring
> `endTime: NaN`, and `setQuiz()` can no longer be combined with
> `setAnnouncementGroup()` (that path emits `pollCreationMessageV2`, which has no
> `correctAnswer` field, so the quiz was silently dropped). Quiz polls are also finally
> readable: `getAggregateVotesInPollMessage()` now recognises `pollCreationMessageV5`.

```js
const poll = new Poll(sock)
    .setName('Quiz: ibu kota Indonesia?')
    .addOptions(['Jakarta', 'Bandung', 'Surabaya'])
    .setQuiz('Jakarta')

poll.validate()        // [] when safe to send — collects every problem at once
poll.assertValid()     // throws the first problem (build()/send() run this for you)
poll.countOptions()    // 3
poll.getOptions()      // ['Jakarta', 'Bandung', 'Surabaya'] (a copy)
poll.removeOption('Surabaya')
Poll.MAX_OPTIONS       // 12 — enforced, like MAX_NAME_LENGTH (255) / MAX_OPTION_LENGTH (100)

await poll.send(jid)
```

### Carousel

> Cards are usually built with `Button(...).toCard()` first. Media cards work as before, and v2.4.7 also allows valid text/button-only carousel cards (WhatsApp renders them) via `addTextCard()` or a `Button(...).toCard()` card with no media header.

```js
import { Button, Carousel } from '@japofc/baileys'

const cardA = await new Button(sock)
    .setImage('https://example.com/a.jpg')
    .setTitle('Produk A')
    .addUrl('Lihat', 'https://example.com/a')
    .toCard()

const cardB = await new Button(sock)
    .setImage('https://example.com/b.jpg')
    .setTitle('Produk B')
    .addUrl('Lihat', 'https://example.com/b')
    .toCard()

await new Carousel(sock)
    .setBody('Pilih salah satu produk di bawah ini')
    .addCard([cardA, cardB])
    .send(jid)

// Text/button-only card, no image required:
await new Carousel(sock)
    .setBody('Quick actions')
    .addTextCard({
        title: 'Support',
        text: 'Choose an action',
        buttons: [
            { id: 'faq', text: 'FAQ' },
            { webview: 'https://example.com/help', text: 'Open Help' }
        ]
    })
    .send(jid)
```

### AIRich — rich response cards

```js
import { AIRich } from '@japofc/baileys'

await new AIRich(sock)
    .addHeading('Order Summary')
    .addText('Your order is being processed.')
    .addTable([
        ['Item', 'Qty'],
        ['Iced Latte', '2']
    ])
    .addTip('Orders are usually ready in 15 minutes')
    .addSuggest('Track Order')
    .send(jid)
```

For the common case, v2.4.7 also exports a one-liner wrapper around the same builder:

```js
import { sendJapRich, jap } from '@japofc/baileys'

await sendJapRich(sock, jid, {
    title: 'Order Summary',
    markdown: '# Paid\nYour order is being processed.',
    actions: { text: 'Track', url: 'https://example.com/order/123' },
    suggestions: ['Track Order', 'Contact Support']
})

// Or keep chaining after the shortcut builds the card:
await jap(sock, '# Quick Report').addTip('Generated now').send(jid)
```

Neutral aliases (`sendRich`, `Rich`, `createRich`, `buildRich`) remain available, but the JAP-branded helpers (`jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich`) are the preferred names for new code.

**Since v2.4.8 the socket speaks rich directly** — no free function, no passing `sock` around:

```js
await sock.sendJapRich(jid, { title: 'Order Summary', markdown: '# Paid', suggestions: ['Track'] })
await sock.sendJapTable(jid, [['Item', 'Qty'], ['Coffee', '2']], { title: 'Cart' })
await sock.sendJapLatex(jid, 'E = mc^2')

// sendMessage() routes these shapes too
await sock.sendMessage(jid, { table: [['Item', 'Qty'], ['Coffee', '2']], title: 'Cart' })
await sock.sendMessage(jid, { latex: '\\frac{a}{b}' })
await sock.sendMessage(jid, { jap: { markdown: '# Hi', suggestions: ['More'] } })
```

`sendRich` / `sendTable` / `sendLatex` are neutral aliases of the three socket methods, and
`{ disableJapyea: true }` opts a call out of the auto-routing layer entirely.

The one-liner now covers **every** AIRich primitive — `latex`, `task(s)`, `widget(s)`,
`progressStatus`, `thinking`, `quotaUpsell`, `bloks`, `reels`, `post(s)`, `product(s)`,
`socialEntity`, `inlineVideo`, `contentItems`, `generating` — and a key it does not recognise
is now an error with a suggestion (`unknown key 'tabel' (did you mean 'table'?)`) instead of
a silently blank card. Pass `{ allowUnknown: true }` to carry your own extra fields through,
and import `ONE_LINER_KEYS` if you want to validate input yourself.

`AIRich` supports `{ id, insertAt }` on every `add*()`/`set*()` call, so you can insert a block relative to one you added earlier instead of always appending to the end — handy for streaming/edit-in-place style responses combined with `sendEdit(jid, id)`.

**`streamText()` — the "AI typing" effect.** One bubble that grows via in-place edits (exactly how Meta AI streams its answers), instead of flooding the chat:

```js
// sends once, then patches the same bubble until the full text is out
await new AIRich(sock).streamText(jid, longAnswer, {
    chunkSize: 120,  // ~chars per reveal (split at word boundaries)
    intervalMs: 900, // pause between edits (min 300)
    cursor: ' ▍'     // shown while streaming, removed at the end ('' disables)
})
// works alongside other blocks too: addHeading()/addTable() first, then streamText()
```

**`readRichMessage()` — the reader half.** Parse a received rich card (from any AI/assistant-style bot) back into structured blocks instead of staring at opaque proto:

```js
import { readRichMessage } from '@japofc/baileys'

sock.ev.on('messages.upsert', ({ messages }) => {
    const rich = readRichMessage(messages[0])
    if (!rich.found) return
    rich.blocks      // [{ type: 'heading', text }, { type: 'code', language, code },
                     //  { type: 'table', rows, headerRows }, { type: 'text', text, entities }, …]
    rich.suggestions // every suggestion-pill text
    rich.text        // flat text rendering of the whole card
})
```

Handles both wire forms (unified-response payload + proto submessages fallback), resolves inline link entities back to `[label](url)`, re-joins syntax-highlighted code spans, never throws — non-rich input returns `{ found: false }`. Round-trip tested against the AIRich builder itself.

Other builders worth knowing about: **`ButtonV2`** (simpler quick-reply-only buttons), **`ButtonV3`** (`loadFrom(msg)` to edit an existing template message in place), and **`Toolkit`** (static helpers: `Toolkit.resize()`, `Toolkit.fetchBuffer()`, `Toolkit.waitAllPromises()`, `Toolkit.extractIE()` for parsing `[label](url)` links/citations/LaTeX out of plain text).

### 📁 Builders Folder Map (`lib/Builders/`)

Every message builder lives in its own file under `lib/Builders/`, so you can trace exactly where a class comes from instead of digging through one giant `MessageBuilder.js`. `index.js` is just the barrel file that re-exports everything below (plus their aliases) for the top-level `import { ... } from '@japofc/baileys'` syntax.

| File | Exports | What it's for |
|---|---|---|
| `shared.js` | `Toolkit`, `BaseBuilder`, `RowBuilder` | The shared foundation every other builder is built on. `BaseBuilder` holds the common chainable `send()`/context-info plumbing, `RowBuilder` is the shared row/section helper, and `Toolkit` is the static-helper grab bag (`resize`, `fetchBuffer`, `waitAllPromises`, `extractIE`, media-duration/preview helpers). Nothing here is meant to be instantiated directly in bot code — it exists so `Button`, `Poll`, `Carousel`, etc. don't each reimplement the same plumbing. |
| `Button.js` | `Button`, `CardBuilder` | The main interactive/native-flow button builder — headers (image/video/document), CTA helpers (`addUrl`, `addCall`, `addReply`, and the wider native-flow set), and `.toCard()` to turn a button message into a `Carousel` card. |
| `ButtonV2.js` | `ButtonV2` | A lighter-weight legacy `buttonsMessage` variant limited to up to 3 quick-reply buttons — includes `validate()`/`assertValid()`, `countButtons()`/`getButtons()`/`clearButtons()`, and relays with the same canonical `getBizBinaryNode()` envelope as the socket path. |
| `ButtonV3.js` | `ButtonV3` | Built around `loadFrom(msg)` — loads an existing `templateMessage` (e.g. one you fetched or that was quoted) so you can edit it in place. Also validates hydrated quick-reply/url/call buttons and relays with the canonical biz node. |
| `Carousel.js` | `Carousel` | Chains `Button(...).toCard()` results into a swipeable card carousel. Accepts media cards and text/button-only cards (`addTextCard()`), validates before send, and is capped at `Carousel.MAX_CARDS` (10) since WhatsApp silently truncates anything beyond that. |
| `Poll.js` | `Poll` | Poll/vote message builder — question, options, single/multi-select, hidden-voter mode, correct-answer marking, expiry. |
| `AIRich.js` | `AIRich` (+ aliases `ORich`, `AIJap`, `LeafRich`, `JapAI`, `JapRich`, `RichJap`) | The rich AI-assistant-style response builder described above — headings, formatted text, tables, media/product/post cards, task/progress cards, tip banners, quick-reply suggestions. |
| `Rich.js` | `jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich` (+ neutral aliases `Rich`, `createRich`, `buildRich`, `sendRich`) | One-liner convenience wrapper over `AIRich` for common cards (`markdown`, `text`, `actions`, `suggestions`, media, etc.) without replacing the full chainable builder. |
| `A2UI.js` | `A2UI`, `sendA2UIWidget` | Lower-level A2UI/Bloks widget builder. Builds the flat `components` tree (Column/Row → `children`, Card/Button → `child`, Modal → `trigger`/`content`) that Bloks widgets expect and sends it through the same `getBizBinaryNode()` path as `Button`/`ButtonV2`, so the wire-level node always matches the button names actually sent. |
| `JapBaileys.js` | `JapBaileys` | A unified builder **hub** — one object that wraps all the builders above behind short method names (`.button()`, `.buttonV2()`, `.buttonV3()`, `.carousel()`, `.poll()`, `.airich()`, `.rich()`, `.a2ui()`), plus PascalCase aliases (`.Button()`, `.Carousel()`, `.Poll()`, `.AIRich()`, `.Rich()`, `.A2UI()`) for developers who prefer that naming style. |
| `index.js` | everything above, plus `MESSAGE_BUILDER_VERSION` | The barrel file — re-exports every builder and its aliases so `import { Button, Poll, AIRich, JapBaileys } from '@japofc/baileys'` works without reaching into individual files. `MESSAGE_BUILDER_VERSION` tracks the builder API surface's own version, independent of the package version. |

**Unified hub example** — useful if you'd rather carry one object around than import each builder individually:

```js
import { JapBaileys } from '@japofc/baileys'

const vx = new JapBaileys(sock)

await vx.button()
    .setTitle('Promo Spesial')
    .addReply('Klaim Sekarang', 'claim_promo')
    .send(jid)

await vx.poll()
    .setName('Mau makan apa hari ini?')
    .addOptions(['Fried Rice', 'Chicken Noodles'])
    .send(jid)
```

---

### 📌 Pin / Keep in Chat

```js
// Pin a message for 7 days (default 24h), unpin, keep / unkeep in disappearing chats
await sock.sendPin(jid, msg.key, { durationSec: 7 * 86400 })
await sock.sendUnpin(jid, msg.key)
await sock.sendKeep(jid, msg.key)
await sock.sendUnkeep(jid, msg.key)
```

### 📅 Event

```js
await sock.sendEvent(jid, {
    name: 'Weekly Meeting',
    description: 'Bahas progres bot',
    startDate: new Date('2026-09-15T10:00:00+07:00'),
    endDate: new Date('2026-09-15T11:00:00+07:00'),
    location: { name: 'Office', address: 'Jakarta' },
    extraGuestsAllowed: true
})
```

### 📞 Scheduled Call

Native scheduled-call message (the "Schedule call" card with a join reminder):

```js
// 'voice' (default) or 'video'
await sock.sendScheduledCall(jid, {
    title: 'Daily standup',
    scheduledAt: new Date('2026-09-15T09:00:00+07:00'),
    callType: 'video'
})

// Cancel it later (needs the creation message's key)
await sock.cancelScheduledCall(jid, creationMsg.key)
```

### 📱 Mini App

Two modes — pass `url`, `flow`, or both (two buttons):

```js
import { sendMiniApp } from '@japofc/baileys'

await sendMiniApp(sock, jid, {
    title: 'My Mini App',
    body: 'Tap the button to open the app 👇',
    // 1) webview mode: rich card + CTA opening your web app
    //    (in-app webview when supported, else the browser)
    url: 'https://myapp.example.com',
    params: { ref: 'wa-bot' }, // → appended as ?ref=wa-bot
    buttonText: '🚀 Open App',
    // 2) Flows mode: TRUE native in-chat mini app (forms/screens inside
    //    WhatsApp, no browser). Needs a published Flow ID from Flows Manager.
    flow: { id: '123456789', cta: '📝 Isi Form', screen: 'WELCOME' },
    thumbnail: 'https://myapp.example.com/icon.png' // url or Buffer
})
// or as a socket method: await sock.sendMiniApp(jid, { ... })
```

---

## 📨 Message Helpers

High-level one-liners for modern message types — validated, with friendly aliases:

```js
await sock.sendLocation(jid, { lat: -6.2, lng: 106.8, name: 'Jakarta' });
await sock.sendContact(jid, { name: 'John', vcard: 'BEGIN:VCARD\n...' });
await sock.sendGroupInvite(jid, { code: 'AbC123', jid: groupJid, subject: 'Community' });
await sock.sendPaymentRequest(jid, { currency: 'IDR', amount: 50000, note: 'coffee ☕' });
await sock.sendInvoice(jid, { note: 'INV-001' });
await sock.sendPollOption(jid, pollKey, ['New option']);
await sock.sendEventInvite(jid, { eventTitle: 'Party', startTime: new Date(...) });
await sock.sendNewsletterInvite(jid, { newsletterJid, newsletterName: 'News' });

// Poll upgrades (already wired end-to-end):
await sock.sendPoll(jid, {
  name: 'Jam berapa?', values: ['Pagi', 'Sore'],
  endDate: new Date('2026-09-16T00:00:00Z'), // auto-close
  hideVoter: true,      // anonymous poll
  canAddOption: true,   // voters may add options
});
```

Music messages are experimental — the proto is correct but interop with official
clients is unverified (see [Honestly not implemented](#honestly-not-implemented-and-why)):

```js
await sock.sendMusic(jid, { songUri, artworkUri, embeddedMusic: { songId, title, author } });
```

**Escape hatch:** every content key also works inline via `sendMessage`, and `{ raw: true, <AnyMessageField>: {...} }`
passes any proto field through untouched — full `WAProto` coverage with zero wrapper lag:

```js
await sock.sendMessage(jid, { raw: true, musicMessage: { songUri } });
```

TypeScript consumers get a typed `AnyMessageContent` (`import type { AnyMessageContent } from '@japofc/baileys'`).

## 🧰 Channels, History & Transcripts

**Channel management** (live queries):

```js
await sock.newsletterDelete(channelJid)
await sock.newsletterAdminCount(channelJid)
await sock.newsletterJoinInvite('invite-code')
await sock.newsletterChangeOwner(channelJid, newOwnerJid) // experimental
await sock.communityGetInviteCode(communityJid)
// ...plus existing follow/unfollow/mute/react/fetch + full community CRUD
```

**Group history sharing** for new members (forwards recent messages to their DM):

```js
import { getGroupHistoryFromStore } from '@japofc/baileys'
const messages = getGroupHistoryFromStore(store, groupJid, 10)
await sock.shareGroupHistory({ groupJid, members: newMemberJid, messages, greeting: true })
```

**Voice-note transcription** (pluggable provider — cloud Whisper or your own):

```js
import { openAIWhisperProvider } from '@japofc/baileys'
const provider = openAIWhisperProvider({ apiKey: process.env.OPENAI_API_KEY })
const { text } = await sock.transcribeMessage(voiceNoteMsg, { provider })
```

**Mini-app deep links** (HMAC-signed params your web app can verify):

```js
import { createMiniAppLink, parseMiniAppParams, buildFlowDataExchange } from '@japofc/baileys'
const link = createMiniAppLink('https://app.example.com/', { uid: '123' }, { secret: 's3cr3t' })
parseMiniAppParams(link, { secret: 's3cr3t' }) // → { uid: '123' } (throws if tampered)
buildFlowDataExchange('navigate', { screen: 'HOME' }) // Flows data_exchange payload
```

**A2UI widgets** now include `Slider`, `Switch`, `List`, `ProgressBar`, `Avatar`,
`Badge`, `Spacer`, and `Tabs` alongside the existing Text/Image/Video/Button/Card/Modal
set (all ref-validated at `build()`).

## 🔐 Security Pack

Drop-in hardening for auth state, secrets, and abuse — all in
`lib/Utils/auth-secure.js`, covered by `tests/security.test.js` (incl. fuzzing).

```js
import {
  useEncryptedFileAuthState, secureLogger, withPairingGuard,
  createQRGuard, backupAuthState, writeAuthIntegrity, repairAuthState, secureLogout
} from '@japofc/baileys'

// 1. AES-256-GCM encrypted auth state (reads legacy plaintext, migrates on save)
const { state, saveCreds } = await useEncryptedFileAuthState('./auth', { password: process.env.AUTH_PW })

// A damaged creds.json (wrong password, truncated, empty, not JSON) throws instead of
// silently minting a new identity on top of your session — since v2.4.8 that guard covers
// legacy plaintext files too. Recover with restoreAuthState()/repairAuthState(), or delete
// the folder on purpose to reset.
const sock = makeWASocket({
  auth: state,
  logger: secureLogger(pino({ level: 'info' })), // 7. redacts qr/tokens/keys in every log line
})

// 2. pairing-code rate limit: 5/hour per number, 30s between attempts
withPairingGuard(sock, { maxPerHour: 5, minIntervalMs: 30_000 })

// 3. QR fist-guard: handle the first QR, swallow re-emits for 60s
const qrGuard = createQRGuard({ ttlMs: 60_000 })
sock.ev.on('connection.update', ({ qr }) => { qr = qrGuard.handle(qr); if (qr) show(qr) })

// 6/8. encrypted backup + integrity snapshot
await backupAuthState('./auth', './auth.jabackup', { password: process.env.BACKUP_PW })
await writeAuthIntegrity('./auth', { secret: process.env.INT_PW })

// 9. repair corrupt stores (quarantines + restores creds from backup)
await repairAuthState('./auth', { password: process.env.AUTH_PW, backupFile: './auth.jabackup', backupPassword: process.env.BACKUP_PW })

// 4. logout + overwrite/unlink every auth file + scrub in-memory creds
await secureLogout(sock, { authFolder: './auth' })
```

Single-file variant: `useEncryptedSingleFileAuthState(file, { password })`.

## 🆕 WA 2026 catch-up

WhatsApp 2026 features, wired into JAP-Baileys. Everything here was audited against the
latest official clients — only gaps were added; what already worked is just documented.

### Usernames (chat without phone numbers)

```js
await sock.checkUsername('japstore');            // availability
await sock.setUsername('japstore');              // claim it
await sock.reserveUsername('japstore');          // reserve it (2026 reservation flow)
await sock.findUserByUsername('japstore');       // USync lookup → JID
const u = await sock.fetchContactUsernames(['62812@s.whatsapp.net']);
```

### Editable polls (`editPoll`)

Polls are editable for ~15 minutes after creation (server-side rule):

```js
const sent = await sock.sendPoll(jid, { name: 'Jam berapa?', values: ['Pagi', 'Sore'] });
await sock.editPoll(jid, sent.key, { name: 'Jam berapa?', values: ['Pagi', 'Siang', 'Sore'] });
```

### Mass mention (`sendMentionAll`)

```js
await sock.sendMentionAll(groupJid, 'Announcement: meeting at 9!');
```

> In groups with 32+ members `@all` is admin-only and the rule is enforced
> server-side — non-admin calls are silently dropped by WhatsApp.

### Status mentions (`sendStatusMention`)

Post a status and notify specific users or whole groups — they get the
"mentioned you in their status" bubble linking to your status:

```js
// text status, mention two users
await sock.sendStatusMention({ text: 'Big announcement! 🎉' }, [
    '62812xxx@s.whatsapp.net',
    '62813xxx@s.whatsapp.net',
])

// image status, mention an entire group (every member is notified)
await sock.sendStatusMention({ image: buffer, caption: 'New drop 🔥' }, [groupJid])
```

Works with any status content (`text`, `image`, `video`, `audio`). Pace the
notification fan-out with `{ delayMs }` in options (default 1500 ms per jid).

### Event reminders

```js
await sock.sendMessage(jid, {
  event: {
    title: 'Meeting', description: 'Q3', startDate: new Date('2026-09-15T09:00:00+07:00'),
    reminder: true, reminderOffsetSec: 1800, // remind 30 min before start
  }
});
```

### Sender phone from LID events (`resolveSenderPn`)

Fixes LID-only payloads (e.g. call offers where `caller_pn` is missing):

```js
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const m of messages) console.log(await sock.resolveSenderPn(m)); // '62812…' | null
});
```

### View-once voice notes

`sendVoiceNote()` content composes with `viewOnce`:

```js
await sock.sendMessage(jid, { ...(await buildVoiceNoteContent('./a.ogg')), viewOnce: true });
```

### Member tags (groups)

Already exposed — no new code, documented here:

```js
await sock.updateMemberLabel({ groupJid, lid, label: 'Admin' });
```

### Honestly not implemented (and why)

- **Voice message transcripts** — generated on-device by official clients only; there is
  no transcript API on the wire.
- **Group message history sharing (native)** — WhatsApp began rolling out the official
  "Group Message History" feature (share the last 25–100 messages with a newly added
  member, E2EE, admin-controlled) in Feb 2026. Its wire format still hasn't been captured
  by any public library (re-verified 28 Sep 2026 by downloading and API-diffing upstream
  Baileys 7.0.0-rc14 plus the 8 largest living forks — none carry it). Until it is, this repo ships an honest *workaround* —
  `shareGroupHistory()` forwards recent messages into the new member's DM — which is NOT
  the native flow (no in-group history bubble, no "history shared" notice). If you need
  native behaviour, the only path today is an official client.
- **Music messages (interoperability)** — the `MusicMessage` proto struct round-trips
  fine and `sendMusic()` emits it, but real interop needs provider catalog IDs
  (Spotify/Apple) plus an artwork upload flow that official clients negotiate privately;
  no public capture exists (re-verified Sep 2026). Messages built with made-up IDs render
  as a plain preview or nothing at all on official clients — treat `sendMusic()` as
  experimental and test against a real device before shipping. What v2.4.1 *does* fix:
  unknown `embeddedMusic` fields used to be silently dropped by the proto encoder
  (a typo'd key just vanished from the wire) — they now throw a clear 400 listing the
  supported field names. For the modern music-on-status surface, see
  `withMusicAttribution()` below.
- ~~`mediaKeyDomain`~~ — **now IMPLEMENTED** (kept here for history). Backported from rc14 onto all 5 media types
  (`Audio/Document/Image/Sticker/VideoMessage`, enum `UNSET/E2EE_CHAT/STATUS/CAPI/BOT`)
  with a send passthrough: `sendMessage(jid, { image: buf, mediaKeyDomain: 1 })`.
  Unset by default (recommended — the server labels it). Skipped only on
  `MMSThumbnailMetadata`, where upstream's field number 8 collides with the newer
  `messageHistoryMetadata` in our proto.

## 🆕 Everyday Utilities

One-liners for daily bot work (also usable standalone — see `examples/`):

```js
// 📊 Poll (chats/groups) + Quiz (channels only)
await sock.sendPoll(jid, { name: 'What to eat?', options: ['Rice', 'Noodles'] })
await sock.sendQuiz(channelJid, { name: 'Quiz', options: ['A', 'B'], correctAnswer: 'A' })

// 🎙️ Voice note — auto-converts mp3/wav/… to Opus PTT (needs fluent-ffmpeg)
await sock.sendVoiceNote(jid, './hello.mp3') // path | Buffer | { url }

// 📞 Tag everyone (visible @list vs hidden)
await sock.tagAll(groupJid, 'Meeting at 10!')
await sock.hideTag(groupJid, 'Announcement 📢')

// 🔍 LID → phone number (best-effort, null when unknown)
await sock.getPhoneNumber('12345@lid') // → '62812…'
await sock.getLidForPhone('62812…')    // reverse lookup

// 🧍 Humanized send — typing… + natural delay + per-chat queue
await sock.sendHumanized(jid, { text: 'Hello!' })

// 🛡️ Send Guard — global anti-ban pacing baked into sendMessage()
const sock = makeWASocket({
    sendRateLimit: {
        messagesPerMinute: 20, // global token-bucket ceiling (0 = off)
        perChatDelayMs: 1500,  // minimum gap between sends to the same chat
        jitterRatio: 0.2       // ±20% randomness so timing never looks robotic
    }
})
await sock.sendMessage(jid, { text: 'auto-paced 🛡️' })            // paced
await sock.sendMessage(jid, { text: 'now!' }, { skipRateLimit: true }) // bypass

// ✅ Delivery tracking — await the server ack of an outgoing message
const msg = await sock.sendMessage(jid, { text: 'important!' })
await sock.waitForMessageAck(msg.key.id) // resolves on ack, rejects on
                                         // server error / 60s timeout

// ✅ One-call variant — send + await the ack, race-free (waiter registered
// BEFORE the send goes out, so a fast ack can never slip through)
const { message, ack } = await sock.sendMessageAcked(jid, { text: 'critical!' }, { ackTimeoutMs: 30_000 })

// 📣 Broadcast to many jids — paced, per-jid outcomes, never dies mid-run
const report = await sock.sendBroadcast(jids, { text: 'promo!' }, { delayMs: 1500 })
// { sent: [...], failed: [{ jid, error }], total }

// 🔗 Group invite links
extractGroupInviteCode('https://chat.whatsapp.com/AbCdEf…') // 'AbCdEf…'
await sock.joinGroupViaLink('https://chat.whatsapp.com/AbCdEf…')

// 🏷️ Parse @mentions out of text → ready for sendMessage
const mentions = parseMentions(text) // ['62812…@s.whatsapp.net', …]
await sock.sendMessage(jid, { text, mentions })

// 🤖 Meta AI chat (experimental — needs Meta AI on the account/region)
const { text } = await sock.askMetaAI('Explain black holes!')
```

**Command router** for prefix bots (`!menu`, `.sticker`) with middleware + auto-help:

```js
import { createRouter } from '@japofc/baileys'
const router = createRouter({ prefix: '!' })
router.command('ping', async (ctx) => ctx.reply('pong! 🏓'), { desc: 'Check bot' })
router.attach(sock) // → detach()
```

**Status / channel schedulers** (in-memory):

```js
import { StatusScheduler, ChannelScheduler, StatusHelper } from '@japofc/baileys'
new StatusScheduler(sock).schedule(StatusHelper.text('Pagi! ☀️'), new Date('2026-09-11T06:00:00+07:00'))
new ChannelScheduler(sock).schedule(channelJid, { text: 'Update' }, Date.now() + 3600_000)
```

**Music attribution on statuses** (`StatusAttribution.Type.MUSIC` — the official
Dec-2025 "add music to your status" surface, wire-verified against WAProto):

```js
import { StatusHelper, withMusicAttribution } from '@japofc/baileys'

const status = withMusicAttribution(
  StatusHelper.text('vibes 🎵'),
  { title: 'Song Name', authorName: 'Artist', songId: '<catalog-id>' }
)
await StatusHelper.send(sock, status, jidList)
```

> Official clients resolve the song via Meta's licensed catalog, so `songId`
> must be a real catalog id for the music chip to render there. The attribution
> struct itself is wire-correct either way (round-trip covered by tests).

**Chat export & statistics** (offline — official "Export chat" format, JSON, CSV):

```js
import { exportChatAsText, exportChatAsCSV, chatStatistics } from '@japofc/baileys'

// messages: WAMessage[] from your store / anti-delete cache / messages.upsert
console.log(exportChatAsText(messages))
// 14/09/2026, 10.32 - J.AP: halo!
// 14/09/2026, 10.33 - Rina: <Media omitted>

fs.writeFileSync('chat.csv', exportChatAsCSV(messages))

const stats = chatStatistics(messages)
// { total, bySender, byKind, byHour[24], byWeekday[7], topWords, ... }
```

Also available with zero code: `npx @japofc/baileys export dump.json --format text|json|csv`.

**Offline bot testing (`createMockSocket`)** — test your bot logic in CI with
zero WhatsApp account, zero network, zero ban risk:

```js
import { createMockSocket, createRouter } from '@japofc/baileys'
import assert from 'assert'

const mock = createMockSocket()
myBotSetup(mock.sock)              // your real bot code, unchanged

await mock.receiveText('628xx@s.whatsapp.net', '!ping')
const reply = await mock.waitForReply()
assert.equal(reply.content.text, 'pong! 🏓')
```

Same `ev` surface and `sendMessage()` signature as the live socket; outgoing
messages are REAL `proto.WebMessageInfo` objects built through the same
`generateWAMessage()` pipeline. Supports group injection, quoted replies,
connection lifecycle simulation, read-receipt/presence capture, and
`reset()` between tests. Honest scope: it does not emulate WhatsApp servers —
rate limits, sessions, and encryption are out of scope by design.

`npm test` runs the offline suite (`tests/`, 1226 tests, no network needed).

---

## 🆕 New in v2.4.5

Fresh helpers added this release. All are exported from the package root and fully typed.

### 🗳️ Poll manager — track who voted what (`createPollManager`)

`getAggregateVotesInPollMessage` is stateless and double-counts a voter who changes their mind (WhatsApp re-sends the voter's *full* selection on every change). `createPollManager` keeps that state — each voter counts once, latest choice wins:

```js
import { createPollManager } from '@japofc/baileys'

const polls = createPollManager()
const sent = await sock.sendMessage(jid, { poll: { name: 'Lunch?', values: ['Pizza', 'Sushi'], selectableCount: 1 } })
polls.register(sent) // remembers options + key

// feed it decrypted votes (option names, sha256 hex, or the raw hash Buffers WA sends):
polls.applyVote(sent.key.id, voterJid, ['Pizza'])

polls.tally(sent.key.id)   // [{ name:'Pizza', count, voters:[] }, ...]
polls.winner(sent.key.id)  // { winners:['Pizza'], count } (tie-aware)
console.log(polls.render(sent.key.id)) // live bar chart
```

### ❤️‍🩹 Session-health monitor (`createSessionHealthMonitor`)

Detects bursts of undecryptable messages (a dead Signal session / Bad-MAC drift) per contact and alerts you — purely observational, never throws into your event loop:

```js
import { createSessionHealthMonitor } from '@japofc/baileys'

const health = createSessionHealthMonitor({ badMacThreshold: 3, windowMs: 60_000 })
health.bind(sock)
health.onUnhealthy(({ jid, failures }) => console.warn(`${jid} session looks broken (${failures} decrypt fails)`))
health.onRecover(({ jid }) => console.log(`${jid} recovered`))
```

Ships with `canonicalizeJid()` and `makeJidCanonicalizer(sock)` to key a contact by one identity across the PN/LID split.

### 🔁 Message de-dupe / idempotency (`createMessageDedupe`)

Stops double-replies when WhatsApp re-delivers a message (reconnect, history sync, placeholder resend, retries):

```js
import { createMessageDedupe } from '@japofc/baileys'

const dedupe = createMessageDedupe({ maxSize: 5000 }) // optional ttlMs
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    if (dedupe.seen(m.key)) continue // already handled → skip
    // ...handle exactly once
  }
})
```

### 🔗 LID ↔ PN helpers on the socket

The mapping helpers are now first-class socket methods (no more reaching into `signalRepository`):

```js
await sock.getLIDForPN('62812…@s.whatsapp.net') // → '…@lid' | null
await sock.getPNForLID('123…@lid')              // → '…@s.whatsapp.net' | null
await sock.getLIDsForPNs([...])                  // batch
await sock.getPNsForLIDs([...])                  // batch
await sock.storeLIDPNMappings([{ lid, pn }])     // seed the cache
```

### 🧩 Small toolkit helpers

Ten new pure, typed helpers exported from the root:

```js
import { partition, zip, formatCountdown, wordCount, ellipsisMiddle,
         jidType, randomString, isNumeric, firstEmoji, maskJid } from '@japofc/baileys'

partition([1, 2, 3, 4], n => n % 2 === 0) // [[2,4],[1,3]]
zip([1, 2], ['a', 'b'])                    // [[1,'a'],[2,'b']]
formatCountdown(90_061_000)                // '1d 01:01:01'
ellipsisMiddle('abcdefgh', 5)             // 'ab…gh'
jidType('123@g.us')                        // 'group'
maskJid('628123456789@s.whatsapp.net')     // '628******89@s.whatsapp.net'
```

---

## 🆕 New in v2.4.8 — release summary

**37 reproduced bugs fixed · 58 additions · 1804 tests green · `tsc --strict` clean · 1299 exports.**

Every fix below began as a reproduction script in `scripts/` and is locked by a regression
test; every addition is implemented against the real protobuf, not stubbed. Full detail:
[`CHANGELOG.md`](./CHANGELOG.md) and [`BUGREPORT.md`](./BUGREPORT.md) §2.44–§2.97.

**The fixes that matter most**

| What was broken | Why it hurt |
|---|---|
| A failed group send persisted "everyone has the sender key" **before** the stanza was sent | the retry distributed nothing — the whole group saw *waiting for this message* until the key rotated |
| Read receipts shipped `null` ids and duplicates | WhatsApp drops the whole receipt, so *valid* ids in the same stanza were never acknowledged either |
| Call audio frames were windows into live WASM memory | anything that did not consume a frame synchronously recorded later audio, or silence |
| A corrupt/empty **plaintext** `creds.json` read as "fresh install" | a new identity was minted and the next `saveCreds()` overwrote the real session |
| A non-pino logger crashed the Noise handshake | `console`, bunyan/winston, pino v8 or `{}` all died with `logger.child is not a function` |
| Messages wrapped more than 5 deep stayed wrapped | `getContentType()` answered with a wrapper name and bots missed the message entirely |
| Accepting an invite forwarded into a group credited the **group** as the inviter | the server was told `admin: <group jid>` and the join stub was filed against it |
| A stale `cachedGroupMetadata` made PN groups claim LID addressing | every message to that group went out addressed the wrong way |
| An unreadable tc-token timestamp meant "never refresh" | that contact silently stopped getting privacy tokens |
| The group-invite icon cache existed but was never wired up | five invites = five profile-picture queries (and a failing 404 each time for an iconless group) |

**The big additions**

- **Albums** (`sendAlbumMessage`), **Newsletter Status API** (post/react/revoke/fetch as a channel), **Status & story** helpers, **Scheduled messages** (+ conditional reveal), **Polls & quizzes**, **Money & split payments**, **HTML apps**, the rest of **A2UI / AI-rich**, **bot-signature verification**, **VoIP** (`makeVoipClient`, `VideoFeeder`, `bindVoiceRecognition`, `call.audioStream()`).
- **Quality-of-life**: any logger via `ensureLogger()`, pino is optional, `MessageBuilder.bind(sock)`, refreshable native-flow definitions, `TTLCache`, strict JID tooling, read-receipt blocking, and the startup banner is finally opt-out (`printBanner: false` / `JAP_NO_BANNER`).

## 🆕 New in v2.4.6

The v2.4.6 release added a lot that never made it into this file. Here it is, grouped. All
of it is exported from the package root and typed.

### ✨ AIRich — stacks, raw primitives, profile cards

`addHStack(...)` / `addVStack(...)` lay primitives out side by side or top to bottom
(SwiftUI-style), and `addProfileCard(profile)` renders an avatar + name + subtitle card:

```js
import { AIRich } from '@japofc/baileys' // RichAI is the same class, under its brand name

await new AIRich(sock)
    .addHStack(['**Today**', '12 orders', 'Rp 1.4jt'])
    .addProfileCard({ username: 'tokojap', full_name: 'Toko JAP', subtitle: 'Online store', picture_url: 'https://…/logo.jpg', is_verified: true })
    .send(jid)
```

Meta ships new unified-response primitives constantly, so there are two escape hatches for
the ones we have no helper for yet:

```js
// any view_model by name — the GenAI prefix is added for you
rich.addViewModel('HStackLayoutViewModel', ['**left**', '**right**'], { fallback: 'left / right' })
// a single primitive, wrapped in a SingleLayoutViewModel
rich.addRawPrimitive('SomeBrandNewUXPrimitive', { title: 'hi' })
```

`META_RICH_PREFIX` (`'GenAI'`) is exported so you can build those names yourself.

### 🚨 Seeing decryption failures instead of scraping logs

A dead Signal session used to be visible only as log spam. Now it's an event, and the log
spam is capped by default:

```js
sock.ev.on('messages.decrypt-failed', ({ key, error, willRetry }) => {
    if (!willRetry) metrics.increment('decrypt.dead', { jid: key.remoteJid })
})
```

Log-flood protection is **on by default** (`decryptFailureLog: { windowMs: 60000, maxPerWindow: 5 }`);
pass `decryptFailureLog: false` to the socket for unlimited logging, or build your own
limiter with `createDecryptFailureTracker({ windowMs, maxPerWindow, max })` — `hit(key)`
returns `{ log, occurrences, suppressedSincePrevWindow }`, so you log only when `log` is
true and can still report how many were swallowed.

### 🤖 Bot framework — command router, broadcaster, scheduler

`CommandRouter` is a dispatcher with prefixes, aliases, parsed args, per-user cooldowns,
owner/admin/group gates and generated help:

```js
import { CommandRouter, createGroupAdminResolver } from '@japofc/baileys'

const router = new CommandRouter({
    prefixes: ['.', '!'],
    ownerJids: ['628111@s.whatsapp.net'],
    isAdmin: createGroupAdminResolver(sock)
})

router.command({
    name: 'kick', aliases: ['remove'], category: 'Group',
    groupOnly: true, adminOnly: true, botAdmin: true, cooldownMs: 3000,
    handler: async ctx => ctx.reply(`kicking ${ctx.args._[0]}`)
})

console.log(router.help())      // grouped, formatted help text
await router.handle(ctx)        // { matched, executed, outcome, … }
```

`createBroadcaster({ send, throttleMs, maxRetries, onProgress })` fans one message out to
many chats at a safe pace, with retries, progress and a `cancel()`:

```js
const caster = createBroadcaster({ send: (jid, msg) => sock.sendMessage(jid, msg), throttleMs: 1500 })
const run = caster.broadcast(jids, { text: 'Promo hari ini!' })
const summary = await run.done  // { total, sent, failed, cancelled, results }
```

`createScheduler()` runs things later without leaking timers — `scheduleAt(date, fn)`,
`scheduleAfter(ms, fn)`, `cancel(id)`, `cancelAll()`, `list()`, `size`.

### 🔐 Mini App links that cannot be replayed

Deep links can now be signed and expiring, and inbound requests verified:

```js
const nonceStore = createNonceStore({ ttlMs: 10 * 60_000 })

const link = createMiniAppLink('https://app.example/order', { orderId: 42 }, {
    secret: process.env.MINIAPP_SECRET,
    expiresIn: 5 * 60_000,       // link dies after 5 minutes
    audience: jid,               // only this chat may open it
    nonce: nonceStore.issue()    // and only once
})

// on your web side
const params = verifyMiniAppRequest(req.url, {
    secret: process.env.MINIAPP_SECRET, audience: jid, nonceStore
})
```

`createNonceStore({ ttlMs, max })` makes each signed link single-use, so a forwarded link
cannot be replayed by someone else. `parseMiniAppParams` reads params without verifying,
for links you issued unsigned.

### 🧰 Everyday utilities

```js
import {
    unstyleText, parseArgs, paginate, textTable,
    compactNumber, ordinal, formatIDR, detectCountry, countryFlagOf,
    mimeToExtension, extensionToMime, mediaKindFromMime, retryWithBackoff
} from '@japofc/baileys'

unstyleText('𝓙𝓸𝓱𝓷')                    // 'John' — fancy Unicode back to ASCII, so your
                                        //  word filter and search actually match

parseArgs('ban @x --days 3 "two words"') // { _: ['ban','@x','two words'], days: '3' }

paginate(items, { page: 2, perPage: 10 }) // { items, page, pages, hasPrev, hasNext, … }

console.log(textTable([['Item', 'Qty'], ['Kopi', '12']])) // aligned monospace table

compactNumber(1234567)  // '1.2M'
ordinal(23)             // '23rd'
formatIDR(15000)        // 'Rp15.000'

detectCountry('6281234567890') // { dialCode: '62', iso2: 'ID', name: 'Indonesia' }
countryFlagOf('6281234567890') // '🇮🇩'

mimeToExtension('image/webp')  // 'webp'
extensionToMime('mp3')         // 'audio/mpeg'
mediaKindFromMime('audio/ogg') // 'audio'
```

`retryWithBackoff(fn, { retries, signal })` is now cancelable — the signal aborts before
the first attempt if already aborted, and interrupts a backoff wait mid-flight.

`createInviteTracker()` gained cross-chat totals: `getGlobalCount(inviter)` returns
`{ total, active }` across every tracked group and `getGlobalLeaderboard(limit)` ranks
inviters globally, so "who brought the most people" works for a bot in many groups.

### 📞 VoIP — a full WhatsApp ⇆ RTP/SIP audio bridge

`createCallBridge()` ties the G.711 codecs, the RTP packetizer and the jitter buffer into
one transport-agnostic object, so you can wire a WhatsApp call to a SIP/PBX leg:

```js
const bridge = createCallBridge({
    codec: 'pcmu',
    onRtp: (rtp) => sipSocket.send(rtp),            // WA → SIP
    onPcm: (pcm) => waCall.sendAudio(pcm)           // SIP → WA
})

bridge.sendAudio(pcmFromWhatsApp)   // transcodes + emits RTP packets
bridge.receiveRtp(packetFromSip)    // buffers for in-order playout
bridge.drainAudio()                 // decodes what's ready, calls onPcm
bridge.stats()                      // codec, ssrc, frames, jitter stats
```

The pieces are also exported on their own: `encodeMulaw`/`encodeAlaw` (+ decoders),
`createRtpPacketizer`, `createJitterBuffer`, `rtpSequenceNext`/`rtpTimestampNext`, and the
PCM helpers.

### 🎨 Startup banner

The banner picks a fresh theme and tagline every run. Pin one with
`JAP_BANNER_THEME=leaf|ocean|sunset|violet|aurora|ember` (or `=daily` for once-a-day
rotation). Colour follows the usual conventions, read at call time: `NO_COLOR` /
`FORCE_COLOR=0` turns colour off (the banner still prints), `FORCE_COLOR=1|2|3` forces it
on even off a TTY — useful in CI and pm2 dashboards.

## 🗂️ Albums, channel status, status interactions & scheduling (v2.4.8)

```js
// Albums — 2+ images/videos as one gallery (validated up front, paced between items)
await sock.sendAlbumMessage(jid, [{ image: { url: './1.jpg' } }, { video: { url: './2.mp4' } }], {
    caption: 'Weekend dump',   // goes on the first item
    delayMs: 1500              // pacing BETWEEN items (never after the last one)
})
await sock.sendAlbum(jid, medias)                       // same thing, neutral name

// Who sees a status — contacts, an allowlist, or everyone except a few
const audience = makeStatusAudienceMetadata({ contacts, except: ['628x@s.whatsapp.net'] })
// → { type: 'denylist', statusJidList, excluded, truncated, limit }
await sock.sendMessage('status@broadcast', { image }, { statusJidList: audience.statusJidList })

// Post a status AS a channel (renders "from <channel>" on the recipient's phone)
await sock.sendNewsletterStatus('1234@newsletter', { image: { url: './promo.jpg' } }, {
    statusJidList: audience.statusJidList, newsletterName: 'JAP News'
})
await sock.fetchNewsletterStatus('1234@newsletter', { count: 20 })
// → [{ serverId, timestamp, views, reactions: [{ code, count }] }, …]
await sock.sendNewsletterAdminInvite(jid, { newsletterJid: '1234@newsletter', newsletterName: 'JAP News' })

// Status interactions — reshare a mention, answer a question sticker, react to a sticker
await sock.sendStatusReshare(statusMsg, { statusJidList: audience.statusJidList })
await sock.sendStatusQuestionAnswer(jid, statusMsg.key, 'Nasi goreng, obviously')
await sock.sendStatusStickerInteraction(jid, statusMsg.key, stickerKey)

// Scheduled messages — encode/decode the envelope, or let the socket hold the timer
const handle = sock.scheduleMessage(jid, { text: 'Happy new year!' }, { at: new Date('2027-01-01T00:00:00Z') })
handle.scheduleId; handle.scheduledAt; handle.status   // 'pending' → 'sent' | 'cancelled'
handle.cancel()                                        // true if it had not fired yet
await sock.unscheduleMessage(jid, key, { scheduleId }) // tell the other side to drop it
const { content } = encodeScheduledMessage({ text: 'later' }, { at: Date.now() + 60_000 })
decodeScheduledMessage(content)                        // { scheduleId, scheduledAt, isDue(), content }
```

The standalone pieces are all exported too — `makeStatusAudienceMetadata`,
`makeStatusMentionMessage`, `makeStatusQuestionAnswerMessage`,
`makeStatusStickerInteractionMessage`, `STATUS_AUDIENCE_*`; `withNewsletterStatusAttribution`,
`buildNewsletterStatusNode`, `makeNewsletterAdminInviteMessage`, `makeNewsletterStatusSender`,
`makeNewsletterStatusFetcher`; `encodeScheduledMessage`, `decodeScheduledMessage`,
`buildUnscheduleProtocolMessage`, `SCHEDULED_MSG_*` — so you can build the payload in one
process and send it in another.

### A2UI / Bloks, declaratively

```js
import { a2uiSurface, a2uiCard, a2uiColumn, a2uiRow, a2uiText, a2uiButton,
         bloksWidget, embeddedScreen, sendA2UI } from '@japofc/baileys'

const surface = a2uiSurface([
    a2uiCard(a2uiColumn([
        a2uiText('Order #1234', { variant: 'title' }),
        a2uiText('Out for delivery')
    ])),
    a2uiRow([a2uiButton(a2uiText('Track'), { action: { name: 'cta_url', url: 'https://…' } })])
])

await sendA2UI(sock, jid, surface)       // send it
bloksWidget(surface)                     // or just the { uuid, data, type } payload
embeddedScreen(surface, { title: 'Checkout' })   // full-screen embedded surface
```

The imperative `A2UI` builder and `sendA2UIWidget()` are unchanged — these helpers produce the
exact same wire format, so the two styles mix freely.

### AI rich extras

```js
import { chainOfThoughtSection, decodeAIRich, forwardRichResponse,
         AI_RICH_RESPONSE_TYPE_STANDARD, AI_RICH_SUBMESSAGE_TYPE } from '@japofc/baileys'

await jap(sock, { ...chainOfThoughtSection(['looked it up', 'checked the docs']),
                  markdown: '# Answer\nYes.' }).send(jid)

decodeAIRich(msg)                        // structured blocks (alias of readRichMessage)
await forwardRichResponse(sock, otherJid, msg)   // forward a card, intact
```

`MessageBuilder` / `MB` are aliases of the `JapBaileys` builder hub, for code written against
that naming.

## 🧾 Polls, money, status & scheduling parity (v2.4.8)

```js
// Polls & quizzes
getPollOptionHash('Nasi goreng', 'hex')          // the bucket votes aggregate into
makePollAddOptionMessage(pollMsg, ['Soto'])      // → { values, optionHashes, content } to re-send
makeQuestionMessage('Pilih', { answers: ['a', 'b'], allowMultiple: true })
makeQuestionReplyMessage(questionKey, 'baik')
makeQuestionResponseMessage(questionKey, 1, { answers: ['a', 'b'] })
quizQuestion('Ibukota Indonesia?', ['Bandung', 'Jakarta'], { correct: 1 })
quizSection('Geografi', [q1, q2]); sideBySideSurveyItem('Kopi atau teh?', 'Kopi', 'Teh')

// Money — integers + offset, never floats
money(25.5, 'USD')              // { value: 25500, offset: 1000, currencyCode: 'USD' }
money(15000, 'IDR')             // zero-decimal currencies get offset 1
readMoney(value)                // → { amount, currencyCode, offset }
const split = buildSplitPayment({ total: 100000, currencyCode: 'IDR', note: 'Dinner',
                                  participants: [a, b, c] })   // remainder-safe even split
buildSplitPaymentUpdate(split, { jid: a })      // → status pending → partial → settled
readSplitPayment(split)                          // who still owes what
buildPaymentReminder({ jid, amount: 50, currencyCode: 'USD', dueAt })
quotaUpsellButton('Upgrade', { url, price: 5, currencyCode: 'USD' }); quotaUpsellSection({ buttons })

// Status, the rest of it
makeStatusQuotedMessage(statusKey, { text: 'nice' })
makeStatusAddYoursAssociation(content, originalStatusKey)
makeStatusNotificationMessage(originalKey, responseKey, { type: STATUS_NOTIFICATION_TYPES.STATUS_RESHARE })
makeGroupStatusAttribution(content, '123@g.us', { subject: 'Squad' })
makeGroupStatusReactionMessage(statusKey, '🔥', { groupJid })
StatusFont.BEBASNEUE; StatusLinkType.PREVIEW

// Channel status, the rest of it
await sock.reactToNewsletterStatus('1234@newsletter', serverId, '👍')
await sock.revokeNewsletterStatus('1234@newsletter', serverId)
await sock.fetchNewsletterStatusUpdates('1234@newsletter', { since })   // only what changed
const serverId = await waitForNewsletterStatusServerId(sock, key.id)
makeNewsletterFollowerInviteMessage({ newsletterJid, newsletterName })
buildNewsletterAdminProfileStatusMessage({ newsletterJid, text: 'hi' })

// Scheduling + conditional reveal
isScheduledTimeValid(when)      // { valid, reason: 'in the past' | 'too soon' | 'too far ahead' | null }
buildScheduledMsgMetaNode({ scheduleId, scheduledAt })
const key = generateRevealKey()
const locked = buildConditionalRevealMessage({ text: 'Surprise!' }, key, { revealAt: tomorrow })
await sock.sendMessage(jid, locked.content)   // ciphertext only — nothing leaks early
locked.reveal(key)                            // → { text: 'Surprise!' }
```

### Silencing the startup banner

```js
makeWASocket({ ...config, printBanner: false })   // per socket
setBannerEnabled(false)                            // programmatically
JAP_NO_BANNER=1 node bot.js                        // or NO_BANNER=1
```

## 🤖 Verified bots, video feeds & refreshable button names (v2.4.8)

```js
// VoIP: build the client first, feed video, transcribe the call
const voip = makeVoipClient({ autoAccept: false })
await voip.connectWithSocket(sock)

const feeder = new VideoFeeder(640, 480, 15, frame => call.sendVideo(frame), 'lavfi:testsrc')
feeder.start()                       // I420 frames at 15 fps; black frames when idle
i420FrameSize(640, 480)              // 460800 — throws on odd dimensions
feeder.getStats()                    // { framesEmitted, droppedFrames, underflowFrames, … }

const rec = bindVoiceRecognition(call, async pcm => (await transcribeAudio(pcm)).text, {
    chunkMs: 3000, onText: t => console.log('heard:', t)
})
await rec.stop()                     // → the full transcript

// Verify a bot message instead of trusting it
const root = loadBotSignatureRoot(process.env.BOT_TRUST_ROOT_PEM)
verifyBotSignature(msg, { root })    // { verified, reason, useCase, version, chainLength }
readSignedRichResponse(msg, { root })// `rich` is null unless the proof checks out
verifyRichResponseSignature(msg, { root })
isParsableCertificateChain(chain)    // structural DER check before any crypto
```

Without a trust root `verifyBotSignature()` returns `{ verified: false, reason: 'no trust root' }`
— it never reports an unchecked message as verified.

```js
// Native-flow button names, refreshable at runtime
getExports()                          // { buttonNames, source, version, updatedAt }
isKnownButtonName('quick_reply')      // what the validator accepts right now
await update(['brand_new_flow'])      // merge a name WhatsApp just started accepting
await update({ url: 'https://…/nativeflow.json' })
enableAutoUpdate({ url, intervalMs: 3600_000 })   // unref'd timer
disableAutoUpdate(); reloadExports()  // back to what this build shipped with
```

`sendMessage({ interactiveButtons })` validates against that live table, so a new button name
no longer needs a library release.

```js
// The rest of the A2UI / AI-rich surface
a2uiWidget([{ id: 't', component: 'Text', text: 'hi' }])  // free-form components
decodeBloksWidget(widget)             // → { components, byId, text, surfaceId, … }
await sendBloksWidget(sock, jid, widget, { body, footer })
bloksSection('Details', [a2uiText('…')])
embeddedTabbedContent([embeddedTab('Overview', tree), embeddedTab('Specs', tree2)])
thinkingSection(['looked it up', 'checked the docs'])
searchPlannerSection('kopi', [plannerStep('search', { status: 'done' })], { sources })
multipleResponseSection(['draft A', 'draft B'], { selected: 1 })
fusedComparisonSection(['Phone A', 'Phone B'], [{ label: 'Price', values: ['$1', '$2'] }], { recommend: 1 })
```

## 🧰 HTML apps, usernames, stickers & compatibility switches (v2.4.8)

```js
// HTML apps — a document on any account, a webview card when you host the bundle
checkHtmlApp(html)                     // { ok, bytes, errors, warnings, hasScript, externalRefs }
await sock.sendHtmlDocument(jid, html, { fileName: 'invoice.html', caption: 'Your invoice' })
await sock.sendHtmlApp(jid, html, { url: 'https://you.host/app', title: 'Dashboard' })
await sock.sendHtmlApp(jid, html)      // no url → { mode: 'document' } instead of a dead card
await sock.sendHtmlArtifact(jid, csvBuffer, { fileName: 'report.csv', title: 'Report' })

const { html: shared, sessionId } = withHtmlMultiplayer(html, { participants: [a, b], maxPlayers: 4 })
// the bundle can read window.__JAP_MULTIPLAYER__ — injection is idempotent

htmlSection('Report', html); htmlMedia(pngBuffer, { mimetype: 'image/png', name: 'chart' })
prepareFileArtifact(buffer, { fileName: 'app.html' })   // { mimetype, fileLength, sha256, document }
```

```js
// Soft dependencies, caching, thumbnails
const sharp = await loadSharp()        // null when not installed — never throws by default
await loadFfmpeg({ required: true })   // …unless you ask it to
const cache = new TTLCache({ ttlMs: 60_000, max: 500 })
await cache.wrap('user:1', () => fetchUser(1))          // memoised + de-duplicated
await prepareLinkThumbnail(url, { size: 192 })          // cached 10 min, works without sharp

// Usernames
validateUsername('@ja.p_official')     // { valid, username, reason }  ← says *why* it failed
displayUsername(value, { fallback: pushName })
isUsernamePin('123456'); stripUsernamePrefix('628…@s.whatsapp.net')

// Stickers, music, social previews, comments, events, associations
normalizeStickers([linkSticker(url), locationSticker({ latitude, longitude }), musicSticker({ title })])
buildMusicMessage({ title, artist, songUri })           // host-checked against MUSIC_ALLOWED_HOSTS
buildSocialPreview({ url, title }); readSocialPreview(msg)
makeCommentMessage(targetKey, 'mantap'); makeEventInviteMessage({ eventTitle, startTime })
makeMessageAssociation(parentKey, { type: MESSAGE_ASSOCIATION_TYPES.MEDIA_ALBUM })

// Card sections
mapSection([placeItem({ name, latitude, longitude })]); sportsSection({ home, away, status: 'live' })
reminderSection('Bayar listrik', when); taskSection(['a', { title: 'b', status: 'done' }])
transparencySection({ sources, model: 'jap-1' })

// Auth extras
const { state, saveCreds } = await useJAPDBAuth({ file: './auth.json' })   // or { client }
countAuthFileLocks({ detail: true })   // { count, paths } — watch the mutex table stay bounded
```

### Compatibility switches

```js
makeWASocket({ textAsConversation: true })          // plain text goes out as { conversation }
await sock.sendMessage(jid, { text: 'hi', asConversation: true })   // or per message
```

Only *plain* text degrades: a link preview, a quote or a font keeps `extendedTextMessage`, so
nothing is silently dropped. The default is unchanged.

## 🔌 Any logger, bound builders & JAPDB auth (v2.4.8)

```js
// A logger that is not this build's pino no longer crashes the handshake
makeWASocket({ logger: console })                 // works
makeWASocket({ logger: ensureLogger(pinoV8) })    // any pino major
makeWASocket({ logger: ensureLogger(false) })     // silence
ensureLogger(myLogger).child({ class: 'ns' })     // child bindings merged pino-style
```

```js
// Bind every sender onto the socket (mbuilder-style)
const unbind = MessageBuilder.bind(sock)          // or MB.bind(sock)
await sock.sendButtons(jid, { text: 'Hi', buttons })
await sock.sendRich(jid, { markdown: '# Hi' })
sock.mb.carousel().addCard(…)
unbind.skipped                                     // names already on the socket — never shadowed
unbind()                                           // restores exactly what was there before
MessageBuilder.bind(sock, { prefix: 'jap' })       // → sock.japSendButtons(…)
```

```js
// Key-value auth for simple document stores, or a plain JSON file
const { state, saveCreds } = await useJAPDBAuth({ file: './auth.json' })
const { state, saveCreds } = await useJAPDBAuth({ client: db, session: 'bot-1' })
// `useNekoDBAuth` is kept as a drop-in alias — same storage layout
```

### pino is optional

```bash
npm i @japofc/baileys            # no pino pulled in
npm i @japofc/baileys pino@8     # your pino, your version — no second copy
```

With pino installed (v8, v9 or v10) it is used exactly as before. Without it, a built-in
JSON-lines logger takes over, so nothing in the library breaks:

```js
import logger, { usingPino, createFallbackLogger } from '@japofc/baileys'
usingPino                                   // false when pino is absent
createFallbackLogger({ level: 'debug' })    // same shape: levels, child(), level filtering
```

### Channel posts arrive with their real timestamp — and a server id

```js
sock.ev.on('newsletter.message', post => {
    post.server_id      // the handle react/revoke/fetch need (messages.upsert drops it)
    post.fromMe         // true when the notification says the author is you
    post.timestamp      // seconds, from the notification (used to be 0 → 1 Jan 1970)
    post.message        // the decoded Message
})
```

### Envelopes we cannot decrypt are visible now

```js
sock.ev.on('messages.decrypt-failed', failures => {
    for (const f of failures) {
        f.error      // 'Unsupported encrypted envelope: msmsg' — used to vanish entirely
        f.willRetry  // false: retrying something we cannot decrypt would just loop
    }
})

makeWASocket({ unsupportedEnvelopeTypes: [] })   // or push them down the normal decrypt path
```

### Read receipts are validated and batched

```js
await sock.readMessages(keys)                      // id-less keys skipped, ids de-duplicated
await sock.readMessages(keys, { batchSize: 25 })   // ...and split into stanzas of 25
aggregateMessageKeysNotFromMe(keys)                // → [{ jid, participant, messageIds }]
```

A key without an id used to go out as `<item id=null/>`, which makes WhatsApp drop the whole
receipt — including the valid ids sitting next to it in the same stanza.

### Group invites stop re-querying the group icon

```js
sock.groupInviteThumbnailCache          // one per socket, inspect/clear it
makeWASocket({ groupInviteThumbnailCache: createGroupInviteThumbnailCache({ ttlMs, max }) })
makeWASocket({ groupInviteThumbnailCache: false })   // opt out entirely

// both spellings work now — the proto-matching ones used to be dropped silently
await sock.sendMessage(jid, { groupInvite: { jid: group, inviteCode, inviteExpiration, subject, text } })
await sock.sendMessage(jid, { groupInvite: { jid: group, inviteCode, inviteExpiration, groupName, caption } })
```

Five invites to the same group now cost **one** profile-picture query instead of five — and a
group with no icon no longer pays a failing 404 round-trip every single time.

### A failed group send no longer poisons the sender key

```js
await sock.readSenderKeyMemory(groupJid)          // { [group]: { [deviceJid]: true } }
await sock.clearSenderKeyMemory(groupJid)         // → { cleared, devices }; next send re-distributes
await sock.forgetSenderKeyDevices(groupJid, [deviceJid])   // just one stuck participant
```

The memory is written only after the stanza is actually on the wire, so a send that dies
mid-flight can no longer leave a group permanently unable to decrypt you.

### Invites credit the right person, and group addressing stops guessing

```js
// §2.94 — accepting an invite that was forwarded into a group
await sock.groupAcceptInviteV4(key, inviteMessage)       // admin/participant = key.participant
await sock.communityAcceptInviteV4(key, inviteMessage)   // (used to be the group jid)

// §2.95 — what addressing mode is this group on?
resolveGroupAddressingMode(metadata)
// → { mode: 'pn' | 'lid', source: 'metadata' | 'participants' | 'default', confident }
isUsableGroupMetadata(cached, { requireAddressingMode: true })
// → { usable, reason: 'no addressingMode (cache predates LID)' }
```

A `cachedGroupMetadata` written before `addressingMode` existed used to make every message to
a **PN** group go out addressed as LID; the mode is now read off the participant jids before
anything is defaulted, and an unusable cache is re-fetched with the reason logged.

### Fork-parity helpers: JID/LID, native flow, read receipts

```js
// JID / LID — resolution goes through the session's mapping store, never by guessing
await lidToJid('111@lid', sock)      // → '628…@s.whatsapp.net' | null  (null = genuinely unknown)
await jidToLid('628…@s.whatsapp.net', sock)
normalizeJid('628:12@c.us')          // '628@s.whatsapp.net'
parseJid(jid); encodeJid('628', 'lid')
phoneToJid('0812-3456-7890', { defaultCountry: '62' })   // local numbers, opt-in
isJidLid(jid); isJidMetaAi(jid); isJidUserLike(jid)

// Reading any message shape
getTextFromMessage(msg)        // caption, button reply, list reply, poll name, event title…
getInteractiveResponse(msg)    // { type: 'button'|'template'|'list'|'native_flow', id, text, params }
getStatusMediaType(msg)        // 'text' | 'image' | 'video' | 'audio' | null
getSenderJid(msg); getSenderLid(msg); getSenderPn(msg)

// Native-flow buttons
checkNativeFlowButtons(buttons)          // { ok, errors, warnings: ['… does not render on WhatsApp Web'] }
validateAndNormalizeButtons(buttons)     // loose input → [{ name, buttonParamsJson }]
validateAndNormalizeSections(sections)   // flat rows accepted, ids filled, limits enforced

// Read receipts, locally
setBlockReadReceipts(true)                             // whole session
setBlockReadReceipts(true, { chats: [jid] })           // just these chats
getBlockReadReceipts(); clearBlockReadReceipts()
```

`sock.readMessages()` consults that switch, so a scraper can run without marking anything
read — without touching the account's real privacy setting.

### More parity: strict JIDs, member labels, scheduled calls, media helpers

```js
validateJid('12@s.whatsapp.net')   // { valid: false, reason: 'phone JIDs must be 5–16 digits' }
assertJid(jid); assertLid(lid); toJid('+62 812…'); jidKind(jid)   // 'group' | 'lid' | 'location' | …
isJidLocationBroadcast(jid)        // the live-location pseudo-chat

await sock.sendMessage(groupJid, buildMemberLabelMessage('Admin'))      // or '' to clear
await sock.sendMessage(groupJid, makeScheduledCallCreationMessage({ title: 'Standup', at, callType: 'video' }))
await sock.sendMessage(groupJid, makeScheduledCallEditMessage(callKey)) // cancel
readScheduledCall(msg)             // { title, at, callType }

await videoToJpeg('./clip.mp4', { at: '00:00:02' })        // one frame, as a Buffer
await convertToOpusBuffer('./note.m4a')                    // → { buffer, mimetype, ptt: true }
```

`processContactAction`, `emitSyncActionResults`, `readTcTokenIndex`, `shouldSendNewTcToken`,
`isTcTokenExpired` and `toTcTokenSeconds` are exported from the package root now — they
existed, but nothing re-exported them, so no app could reach them.

## 📞 Voice & Video Calls

Experimental audio-call support via a bundled WASM call stack + WebRTC relay. Requires the optional `@roamhq/wrtc` peer dependency.

> Since v2.4.8 a missing `@roamhq/wrtc` (or any relay connect failure) is reported through
> `onTransportError` / your logger instead of escaping as an unhandled promise rejection —
> which on Node 15+ took the whole bot process down. Pass `logger` to `new VoipClient({ … })`
> to see those warnings, and inspect the relay with:
>
> ```js
> relay.getStats()            // { sentPackets, receivedPackets, droppedPackets, openConnections, … }
> relay.getConnectionStats()  // per relay: state, bufferedPackets, bufferedBytes, lastIceRttMs, drops
> ```
>
> `droppedPackets` in `getStats()` genuinely counts drops now; before v2.4.8 it was always `0`.
>
> Reconnecting is also safe now: the signaling bridge patches the shared auth state **once**
> and detaches itself on reconnect and on `voip.disconnect()`. Before v2.4.8 every reconnect
> left another wrapper (and the whole discarded bridge) attached to `authState.keys.set`
> forever. `bridge.dispose()` / `bridge.isDisposed` are public if you drive the bridge directly.

```js
import { VoipClient } from '@japofc/baileys'

const voip = new VoipClient({ resourcesPath: './voip-resources' })
await voip.connectWithSocket(sock)

const call = await voip.call('628123456789')

call.on('ringing', () => console.log('Ringing...'))
call.on('connected', () => console.log('Call connected'))
call.on('ended', (reason) => console.log('Call ended:', reason))
```

`ActiveCall` (returned by `.call()`) and `CallState` are also exported directly if you need finer-grained control over call state.

**Answering inbound calls** — offers are tracked, so the bot can pick up (1:1) or join (group):

```js
import { attachVoip } from '@japofc/baileys'
const voip = await attachVoip(sock) // also stored as sock.voip

voip.on('incoming-call', async ({ callId, from, isGroupCall, busy }) => {
    if (busy) return
    if (isGroupCall) await voip.joinGroupCall(callId, { audioSource: './greeting.mp3' })
    else await voip.answerCall(callId, { audioSource: './greeting.mp3' })
})

// ...or fully automatic:
await attachVoip(sock, { autoAnswer: true })   // pick up 1:1 calls
await attachVoip(sock, { autoJoinGroup: true }) // join group calls
await attachVoip(sock, { autoReject: true, autoRejectText: 'Bot cannot take calls 🙏' })

// still-pending offers (answer before `offerTtlMs`, default 45s):
voip.getPendingCalls() // → [{ callId, from, isGroupCall, ... }]
```

**Group / multi-party calls:**

```js
const gcall = await voip.startGroupCall(groupJid, ['62812…', '62813…'], { chatName: 'Meeting' })
await voip.inviteToGroupCall('62814…')
await voip.removeGroupParticipant('62813@s.whatsapp.net')
await voip.rejoinGroupCall() // recovery after a drop

voip.on('group-call-started', console.log)
voip.on('group-call-joined', console.log)
```

Calls also support reactions, hand-raise, recording, and call links:

```js
const call = await voip.call('628123456789', { audioSource: './greeting.mp3' })
call.react('👍')
call.setHandRaised(true)
const stopRecording = call.recordToFile('./call.wav') // remote peer → .wav

// or take the inbound audio as a stream (frames are independent copies since v2.4.8):
const pcm = call.audioStream({ encoding: 'pcm16' })   // 16-bit LE, pipe it anywhere
pcm.pipe(createWriteStream('./peer.raw'))
call.audioStream()                                    // objectMode Float32Array frames
await voip.previewCallLink('call-link-token')

// 🔀 switch what the call plays WITHOUT hanging up (IVR-style flows)
call.setAudioSource('./menu.mp3')                    // file/URL
call.setAudioSource({ data: buffer, ext: 'mp3' })    // in-memory audio
call.setAudioSource('lavfi:sine=frequency=440')      // generated tone
call.setAudioSource('silence')                       // stop playing, stay on the call
```

**Reconnect & recovery** — a watchdog monitors the relay transport during every call
(`watchdogIntervalMs`/`watchdogMaxSilent`); on a dead relay it emits `call-degraded`
and automatically re-sends the crypto rekey + offer. Manual controls:

```js
voip.on('call-degraded', ({ callId }) => console.log('relay dead, recovering', callId))
voip.on('call-recovery', (r) => console.log('recovery result', r))
await voip.recoverCall({}) // manual: { rekey: true, offer: true }
voip.getStats()            // { busy, callId, call, relay }
sock.ev.on('call', (calls) => { /* standard offer/reject path still works */ })
```

**Refreshing the WASM stack** — if calls break after a WA Web update, re-fetch the official VoIP build directly from WhatsApp Web's bootloader endpoint:

```bash
npm run voip:fetch-wasm
```

No browser is needed in the default path. If WhatsApp changes the public bootloader response, the script can still fall back to a logged-in Chrome session with `CALL_WASM_FETCH_MODE=browser` and `--remote-debugging-port=9222`.

---

## 🔎 User Sync Queries

`WAUSync` (`USyncQuery` / `USyncUser` + protocols) lets you check things like WhatsApp registration, device lists, status, and username info for a JID before you message it — the same mechanism behind `sock.onWhatsApp()`.

```js
import { USyncQuery, USyncUser, USyncContactProtocol } from '@japofc/baileys'

const query = new USyncQuery()
    .withContext('interactive')
    .withMode('query')
    .withUser(new USyncUser().withPhone('628123456789'))

query.protocols.push(new USyncContactProtocol())

const result = await sock.executeUSyncQuery(query)
```

Available protocols: `USyncContactProtocol`, `USyncDeviceProtocol`, `USyncStatusProtocol`, `USyncUsernameProtocol`, `USyncDisappearingModeProtocol`, `UsyncBotProfileProtocol`, `UsyncLIDProtocol`.

---

## 👤 Username Management

High-level wrappers around WhatsApp's username feature (the `@username` handle you can set instead of exposing your phone number), sitting on top of `USyncUsernameProtocol`.

> ⚠️ **Query-ID rotation.** The GraphQL query IDs behind these calls are captured from live WA Web sessions and WhatsApp rotates them from time to time. When that happens calls fail with `GraphQL server error: Bad Request` (or `unexpected response structure`). You don't have to wait for a package update — hot-patch the rotated ID at runtime:
>
> ```js
> const sock = makeWASocket({
>     usernameQueryIds: { CHECK: '<fresh-id>', SET: '<fresh-id>' } // override any of:
>     // CHECK, CHECK_MULTI, SET, GET, GET_RECOMMENDATIONS, PIN_SET
> })
> ```
>
> Fresh IDs can be captured from a live WA Web session (DevTools → Network → WS frames → look for `xmlns="w:mex"` queries).

```js
// Check availability + get suggestions if taken
const check = await sock.checkUsername('J.AP')
// { available: true, username: 'J.AP' }
// or: { available: false, suggestions: [...], rejectionReasons: [...] }

// Claim a username
await sock.setUsername('J.AP', { source: sock.USERNAME_SOURCE.USER_INPUT })

// Lock it behind a PIN so it can't be changed without one
await sock.setUsernamePin('123456')

// Read your own username / drop it
const mine = await sock.getMyUsername()
await sock.deleteUsername()

// Resolve a username to a JID (USync-based, like onWhatsApp() but by username)
const user = await sock.findUserByUsername('someone')
// { jid: '628...@s.whatsapp.net', contact: false }

// Batch-resolve usernames for a list of known contacts
const usernames = await sock.fetchContactUsernames(jid1, jid2, jid3)

// Get WA's own suggestions (e.g. for onboarding flows)
const recs = await sock.getUsernameRecommendations()
```

> Requires a Community/Contact-tier account in good standing — accounts under WA's usual restrictions for new/unverified numbers may see `INVALID` or empty suggestions regardless of the username's actual availability.

---

## 🤖 Bot Framework

An optional, higher-level layer on top of the raw socket: middleware routing, a `!command` dispatcher, a message queue that survives disconnects, exponential-backoff auto-reconnect, per-JID session storage, group activity stats, and media (sticker/voice-note) conversion helpers — so a new bot project doesn't have to hand-roll session/context management every time.

Needs the `better-sqlite3` peer dependency (session + stats storage) and `fluent-ffmpeg` (sticker/voice-note conversion, already listed above) — both fail with an install hint rather than crashing if you use a Framework feature that needs them without installing them first.

```js
import { Bot } from '@japofc/baileys'

const bot = new Bot({
    socketConfig: { printQRInTerminal: true },
    dbPath: './bot.db',   // sessions + stats, defaults to 'baileys_store.db'
    enableStats: true     // group message/sticker leaderboards + ghost detection
})

bot.command('!ping', async (ctx) => {
    await ctx.reply({ text: 'pong' })
})

bot.command('!sticker', async (ctx) => {
    if (!ctx.quoted?.imageMessage) return ctx.reply({ text: 'Reply to an image with !sticker' })
    // ctx.replySticker() handles the WebP conversion for you
    await ctx.replySticker(imageBuffer, { packname: 'J.AP Pack', author: 'you' })
})

bot.onText(async (ctx) => {
    // ctx.session() / ctx.setSession() / ctx.updateSession() / ctx.clearSession()
    // persist small per-chat state (e.g. multi-step flows) to SQLite automatically
    const state = ctx.session()
    if (state?.awaitingReply) {
        ctx.updateSession((s) => ({ ...s, awaitingReply: false }))
    }
})

await bot.start()
```

`Context`, `SessionManager`, `StatsManager`, `MediaManager`, and `SQLiteStore` are also exported individually if you only need one piece rather than the full `Bot` class.

> These files ship as plain `.js` for now — hand-written `.d.ts` declarations for the Framework module haven't been added yet, unlike the rest of this fork's fully-typed surface.

---

## 🧩 Utility Modules

<details>
<summary><b>📖 Show the full utility-module reference</b> — 140+ helpers across <code>lib/Utils</code></summary>

<br/>

A sample of the utilities exported from `lib/Utils` beyond the message builders above:

| Module | What it does |
|---|---|
| `anti-delete` | Detect and recover messages the sender deleted for everyone |
| `anti-edit` | Capture what a message said BEFORE it was edited — before/after text, full revision history, chained edits |
| `trackers` | Reaction / receipt / presence trackers — who reacted what, who read your group message, who's online/typing |
| `serialize` | `serializeMessage` — flat bot-friendly message object with `.reply()`, `.react()`, `.download()`, quoted unwrap |
| `call-guard` | Track incoming calls, auto-reject with an optional text, per-caller counters, allowlist |
| `group-events` | Welcome/goodbye/promote/demote callbacks + per-group event log from group updates |
| `view-once` | Detect, unwrap and capture view-once messages before they disappear |
| `anti-link` | Detect (and auto-delete) group-invite/any links in groups — allowlists for chats & domains |
| `auto-read` | Auto blue-tick incoming messages — group/DM/status filters, allow/deny lists, pause/resume |
| `afk` | AFK manager — mark users away, catch @mentions & replies while away, auto welcome-back |
| `pairing-tools` | Pairing code lifecycle — validate/normalize custom codes, expiry countdown, `pairWithCode` one-call flow |
| `flood-guard` | Per-user burst detection — N messages in a window fires one alert per burst |
| `word-filter` | Keyword/regex moderation over full extracted text (captions too), auto-delete, runtime word list |
| `warn-manager` | Strike system — warns per user per chat, thresholds, pardon, persistence |
| `gatekeeper` | Ban users/chats from the bot; wrap any handler so banned traffic never reaches it |
| `level-system` | XP & levels per user, level-up events, global + per-chat leaderboards, persistence |
| `sticker-exif` | Read/write sticker pack-name/author EXIF on WebP in pure JS — no native deps, Termux-friendly |
| `economy` | Balances, transfers with fees, daily rewards with streak bonuses, leaderboard, persistence |
| `group-scheduler` | Open/close groups on a daily schedule ("night mode"), weekday filters |
| `verifier` | Captcha-gate new group members — auto challenge on join, timeout/attempt kick hooks |
| `command-stats` | Command analytics — top commands/users, hourly histogram, router middleware, persistence |
| `anti-tagall` | Catch mass-mention & invisible hidetag spam from members — threshold, exemptions, auto-delete |
| `shop` | Shop & inventory on top of the economy — stock, consumables, sell-back, gifting |
| `group-backup` | Snapshot group settings + members to JSON, diff against live, restore settings |
| `menfess` | Anonymous two-way DM relay sessions ("menfess" bot) — aliases, stop words, TTL |
| `notes` | Named snippets per chat (`#save` / `#get`) — search, rename, limits, persistence |
| `birthday` | Birthday book — today/upcoming lists, auto-congratulate once per year |
| `guess-game` | "Tebak-tebakan" engine — one round per chat, first correct wins, rewards, timeout reveal |
| `i18n` | Tiny translation layer — dictionaries, per-chat language, `{var}` interpolation |
| `fancy-text` | Unicode restyling for menus — 𝗯𝗼𝗹𝗱, 𝚖𝚘𝚗𝚘, ⓒⓘⓡⓒⓛⓔⓓ, ｆｕｌｌｗｉｄｔｈ, ꜱᴍᴀʟʟᴄᴀᴘꜱ (12 styles) |
| `join-requests` | Auto approve/reject group join requests — allow/deny lists, manual routing, pending sweep |
| `session-tools` | Session doctor — analyze/repair auth folders, portable session-string export/import, cross-backend migration |
| `shutdown` | Graceful shutdown manager — creds flushed first, ordered hooks, signal handling, run-once |
| `conversation-flow` | Multi-step wizards per user — prompts, validation, cancel words, timeouts |
| `webhook-bridge` | POST socket events to any HTTP endpoint — HMAC signatures, retries with backoff |
| `wa-links` | Build/parse wa.me, group-invite & channel URLs; extract URLs from text |
| `media-probe` | Pure-JS image format + dimensions (PNG/JPEG/GIF/WebP/BMP) — no image library |
| `media-guard` | Block media types per chat ("no stickers here") — per-chat rules, auto-delete |
| `health-monitor` | Process health — memory, event-loop lag, custom probes, threshold alerts |
| `text-extras` | Read-more collapse, progress bars, human durations/sizes, chunking, markdown escape, fuzzy distance |
| `reminders` | "!remind 10m …" — parseDuration, timers, restart-safe persistence (overdue fire late) |
| `quota` | Daily usage limits per user with tiers — midnight reset, bonuses, exhausted events |
| `tiers` | Premium/VIP memberships with expiry — extend/stack, lifetime, expiry sweeper |
| `todo` | Shared task lists per chat — assignees, ☐/☑ render, mentions, persistence |
| `url-watcher` | Poll any URL, alert on content change — extract views, SHA-256 diffing |
| `bug-shield` | Detect crash/"bug" messages — mention bombs, zalgo, invisible floods, RTL spoofing; sanitizeText |
| `crash-guard` | Survive uncaught exceptions/rejections — owner alerts, counters, safeStringify |
| `connection-watchdog` | Catch silent half-open sockets — stale alerts fire once, re-armed by activity |
| `secure-logger` | Credential-redacting pino logger + redactSensitive() for any object |
| `call-log` | Call history + per-caller stats from the `call` event — outcomes, durations, persistence |
| `always-online` | Keep the green dot lit — presence refresher with live switching and failure counters |
| `status-watcher` | Receive-side stories — per-contact filters, media type, download hook |
| `button-extras` | quickButtons, sendConfirm (yes/no), sendMenuButtons one-liners |
| `random-tools` | Dice notation, coins, weighted picks, deterministic rate/"jodoh" meters |
| `jid-extras` | phone↔jid conversions, device-insensitive compare, pretty phone printing |
| `time-tools` | Relative times ('5m ago'), clocks, next-occurrence, overnight windows, greetings |
| `group-tools` | Pure groupMetadata helpers — admins, owner, stats, participant diffs, info card |
| `msg-tools` | messageTypeOf, quoted info, timestamps, one-line message previews |
| `kv-store` | Tiny JSON key-value DB — namespaces, counters, debounced atomic saves |
| `warmup` | Account warmup — ramp daily send volume on fresh numbers (20→50→…→unlimited) |
| `disconnect-classifier` | Close errors → category + recommended action (reconnect / re-pair / stop) |
| `group-op-guard` | Stay under WhatsApp's group-action ceilings (~3 adds & 2 creates per 10 min) |
| `giveaway` | Keyword-entry raffles — fair draws, multi-winner, deadlines, status cards |
| `attendance` | Daily roll-call ("absen") — check-in times, missing list, numbered render |
| `auction` | Timed bidding ("lelang") — min increments, anti-snipe extensions, outbid alerts |
| `text-poll` | Vote-by-number polls that work in every client — tallies, bars, tie handling |
| `tictactoe` | XO duels — challenge/accept, emoji boards, win/draw/forfeit |
| `rps` | Rock-paper-scissors ("suit") — hidden picks, batu/gunting/kertas aliases, bets |
| `word-games` | scrambleWord, math-problem generator, "sambung kata" word-chain engine |
| `rental` | Per-chat bot rentals ("sewa") — trials, expiry warnings, unrented-group filter |
| `message-counter` | Daily per-user activity — top chatters, 🥇 digests, day history |
| `command-lock` | Disable commands per chat/globally + maintenance mode with owner bypass |
| `status-tools` | Status auto-styling — random font/colors for text statuses, media/audio normalization (wired into status sends) |
| `newsletter-tools` | Paced batch channel ops — follow/unfollow/mute many with per-jid verdicts |
| `emoji-tools` | Detect/count/extract/strip emoji, themed randomEmoji |
| `array-tools` | chunk, unique-by, groupBy, sortBy, distinct sample, range |
| `validate-tools` | isUrl/isEmail, id/en parseBool, clamp, ensureArray, pickFields |
| `timing-tools` | debounce, throttle, lap stopwatch, measureTime |
| `task-queue` | Bounded-concurrency async jobs with retries — mass DM safe |
| `mask-tools` | maskPhone/maskEmail, boundary-aware censorText |
| `math-eval` | SAFE !calc parser (no eval) + terbilang (Indonesian spelling) + Roman numerals |
| `chat-settings` | Per-chat feature toggles with defaults — the !settings backbone, ✅/❌ cards |
| `voucher` | Generate & redeem codes (JAP-X7K2-9QMD) — max uses, expiry, once-per-user |
| `quiz` | Multi-question quiz sessions — running scores, skips, rankings |
| `socket-preflight` | validateSocketConfig — catch broken configs before cryptic 405s (auto-wired into makeWASocket) |
| `group-cache` | createGroupMetadataCache — TTL-LRU for `cachedGroupMetadata` with event-driven invalidation |
| `reputation` | +rep/-rep with per-giver cooldowns, leaderboards, rep cards |
| `invite-tracker` | Who invited whom — active-vs-total counts (join/leave loops don't pay), top-inviter boards |
| `level-rewards` | attachLevelRewards — auto payouts (balance/tier/custom) on level thresholds, once each |
| `marriage` | Propose/accept/divorce registry — strictly monogamous, anniversaries, couples list |
| `ai-groups` | ⚠️ EXPERIMENTAL: add/remove Meta AI in groups, createAiGroup — server-gated by Meta's per-account rollout (no flag = server rejects; nothing to verify manually) |
| `auto-reply` | Simple keyword/pattern-based auto-responder engine |
| `message-search` | Search cached/stored messages, peeling off ephemeral/view-once wrappers first |
| `message-retry-manager` | Handles WhatsApp's retry-receipt protocol for undecryptable messages |
| `scheduling` | Schedule messages/actions for later delivery |
| `business` | Business-profile & catalog helpers |
| `chat-control` | Pin, mute, archive, and mark-read/unread helpers |
| `chat-history-helpers` | Work with synced chat history payloads |
| `link-preview` | Generate link preview metadata for outgoing messages |

```js
// anti-delete + anti-edit share one MessageStore
import { MessageStore, createMessageStoreHandler, createAntiDeleteUpsertHandler, createAntiEditUpsertHandler } from '@japofc/baileys'

const store = new MessageStore()
sock.ev.on('messages.upsert', createMessageStoreHandler(store))     // register FIRST
sock.ev.on('messages.upsert', createAntiDeleteUpsertHandler(store, (info) => {
    console.log('deleted:', info.originalMessage)                   // recovered content
}))
sock.ev.on('messages.upsert', createAntiEditUpsertHandler(store, (info) => {
    console.log(`edit #${info.editCount}: "${info.beforeText}" -> "${info.afterText}"`)
    info.history // every previous revision, oldest first
}))
```

```js
// event trackers — reaction / read-receipt / presence
import { createReactionTracker, createReceiptTracker, createPresenceTracker } from '@japofc/baileys'

const reactions = createReactionTracker()
reactions.bind(sock)                       // messages.reaction
reactions.getSummary(msg.key)              // { '👍': ['628…@s.whatsapp.net'], … }
reactions.onReaction(({ user, emoji, removed }) => { /* live updates */ })

const receipts = createReceiptTracker()
receipts.bind(sock)                        // message-receipt.update + messages.update
receipts.getReceipts(msg.key)              // { delivered: [...], read: [...], played: [...] }
receipts.isReadBy(msg.key, jid)            // has THIS user read it?
receipts.onRead(({ key, user }) => { /* fires once per reader */ })

const presence = createPresenceTracker()
presence.bind(sock)                        // presence.update
await sock.presenceSubscribe(jid)          // WA only streams presence for subscribed jids
presence.isOnline(jid); presence.isTyping(jid); presence.get(jid)?.lastSeen
presence.onChange(({ user, presence }) => { /* online/offline/typing transitions */ })
```

```js
// bot toolkit — serializer, call guard, group events, view-once, anti-link
import {
    serializeMessage, createCallGuard, createGroupEventsTracker,
    createViewOnceCapture, createAntiLinkGuard
} from '@japofc/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = serializeMessage(sock, messages[0])
    if (!m || m.fromMe) return
    if (m.body === 'ping') await m.reply('pong')      // quotes the original
    if (m.isMedia) { const buf = await m.download() } // media as Buffer
    if (m.quoted) console.log('replying to:', m.quoted.body)
})

const calls = createCallGuard({ autoReject: true, rejectMessage: 'Bots cannot pick up calls.' })
calls.bind(sock)                                      // 'call' event
calls.onRejected(call => console.log('rejected', call.from, call.isVideo ? '(video)' : ''))

const groups = createGroupEventsTracker()
groups.bind(sock)                                     // group-participants.update + groups.update
groups.onJoin(({ id, participants }) =>
    sock.sendMessage(id, { text: `Welcome ${participants.join(', ')}! 👋` }))
groups.onLeave(({ participants }) => console.log('left:', participants))

const vault = createViewOnceCapture()
vault.bind(sock)                                      // messages.upsert
vault.onViewOnce(({ msg, unwrapped }) =>
    console.log('view-once', unwrapped.mediaType, 'from', msg.key.remoteJid))

const antilink = createAntiLinkGuard({ autoDelete: true }) // invite links in groups
antilink.bind(sock)
antilink.onDetected(({ chat, sender }) =>
    sock.sendMessage(chat, { text: `@${sender.split('@')[0]} no group links here!`, mentions: [sender] }))
```

```js
// auto-read, AFK & tag-all
import { createAutoRead, createAfkManager, sendMentionAll, sendHideTag } from '@japofc/baileys'

const reader = createAutoRead({ denylist: ['boss@s.whatsapp.net'] })
reader.bind(sock)                       // blue-ticks everything else as it arrives
reader.pause(); reader.resume()

const afk = createAfkManager()
afk.bind(sock)
afk.setAfk(sender, 'lunch break 🍜')    // e.g. from an !afk command
afk.onAfkMention(({ chat, afkUser, reason, msg }) =>
    sock.sendMessage(chat, { text: `@${afkUser.split('@')[0]} is AFK: ${reason}`, mentions: [afkUser] }, { quoted: msg }))
afk.onReturn(({ user, missed }) => console.log(user, 'is back,', missed.length, 'pings while away'))

await sendMentionAll(sock, groupJid, 'Meeting in 5 minutes!') // visible @everyone
await sendHideTag(sock, groupJid, 'Silent announcement')      // pings all, clean text

// serializeMessage upgrades: m.isViewOnce, m.viewOnce, m.expiration, m.forward(jid), m.delete()
```

```js
// pairing, but comfortable — one call from socket to paired
import { pairWithCode, getPairingCodeInfo } from '@japofc/baileys'

const result = await pairWithCode(sock, '628123456789', {
    customCode: 'abcd-efgh', // optional — any format, normalized for you
    onCode: (code, formatted) => console.log('Enter on your phone:', formatted)
})
if (result.restartRequired) { /* recreate the socket — standard after pairing */ }

const info = getPairingCodeInfo(state.creds)
console.log(info.formatted, '— expires in', Math.round(info.remainingMs / 1000), 's')
// requestPairingCode itself now also accepts "abcd-efgh" / "ABCD EFGH" custom codes
```

```js
// community & moderation pack
import {
    createFloodGuard, createWordFilter, createWarnManager,
    createGatekeeper, createLevelSystem
} from '@japofc/baileys'

const flood = createFloodGuard({ maxMessages: 8, windowMs: 10_000 })
flood.bind(sock)
flood.onFlood(({ chat, user }) => warns.warn(user, { chat, reason: 'flooding' }))

const filter = createWordFilter({ words: ['judol'], patterns: [/j\s*u\s*d\s*o\s*l/i], autoDelete: true })
filter.bind(sock)
filter.onMatch(({ chat, sender }) => warns.warn(sender, { chat, reason: 'banned word' }))

const warns = createWarnManager({ threshold: 3 })
warns.onThreshold(async ({ user, chat }) => {
    await sock.groupParticipantsUpdate(chat, [user], 'remove') // three strikes, out
    warns.reset(user, chat)
})

const gate = createGatekeeper()
gate.banUser('pest@s.whatsapp.net', 'spam')
sock.ev.on('messages.upsert', gate.filter(async ({ messages }) => { /* clean traffic only */ }))

const levels = createLevelSystem()
levels.bind(sock)
levels.onLevelUp(({ user, chat, level }) =>
    sock.sendMessage(chat, { text: `🎉 @${user.split('@')[0]} reached level ${level}!`, mentions: [user] }))
levels.getLeaderboard(10, chat) // top 10 in this group
```

```js
// sticker branding, economy, night mode & join captcha
import {
    setStickerExif, readStickerExif, createEconomy,
    createGroupScheduler, createVerifier
} from '@japofc/baileys'

// pure JS — no node-webpmux, works on static AND animated webp
const branded = setStickerExif(webpBuffer, { packName: 'My Pack', author: 'me', emojis: ['🔥'] })
await sock.sendMessage(jid, { sticker: branded })
readStickerExif(branded) // { 'sticker-pack-name': 'My Pack', … }

const eco = createEconomy({ dailyAmount: [100, 200], streakBonus: 25, transferFee: 0.05 })
eco.claimDaily(user)          // { claimed, amount, streak } or { remainingMs }
eco.transfer(userA, userB, 100)

const nightMode = createGroupScheduler()
nightMode.add({ group, action: 'close', at: '22:00' })          // announcement-only
nightMode.add({ group, action: 'open',  at: '06:00' })          // everyone can chat
nightMode.start(sock)

const verifier = createVerifier({ timeoutMs: 120_000 })
verifier.bind(sock) // auto math-captcha for every new member
verifier.onChallenge(({ chat, user, question }) =>
    sock.sendMessage(chat, { text: `👋 @${user.split('@')[0]} verify: ${question}`, mentions: [user] }))
verifier.onFailed(({ chat, user }) => sock.groupParticipantsUpdate(chat, [user], 'remove'))

// router upgrade — guards & categorized menu:
router.command('kick', handler, { adminOnly: true, category: 'Admin' })
router.command('shutdown', handler, { ownerOnly: true })         // owners: [...] in createRouter
router.command('daily', handler, { cooldownMs: 60_000, category: 'Economy' })
```

```js
// analytics, anti-tagall, shop, group backup & menfess
import {
    createCommandStats, createAntiTagAllGuard, createShop,
    backupGroup, diffGroupBackup, restoreGroupSettings, createMenfessRelay
} from '@japofc/baileys'

const stats = createCommandStats()
router.use(stats.middleware())          // counts every executed command
stats.getTopCommands(5); stats.getBusiestHours()

const antiTag = createAntiTagAllGuard({ threshold: 5, autoDelete: true })
antiTag.bind(sock)
antiTag.onDetected(({ sender, hidden }) => console.log(sender, hidden ? 'hidetag!' : 'tag-all'))

const shop = createShop(eco)            // plugs into createEconomy()
shop.addItem({ id: 'potion', name: 'Potion', price: 250, consumable: true })
shop.buy(user, 'potion', 2); shop.useItem(user, 'potion')
eco.bet(user, 100, { winChance: 0.5, multiplier: 2 }) // economy upgrade

const backup = await backupGroup(sock, groupJid)      // settings + members, JSON-safe
const diff = await diffGroupBackup(sock, backup)      // joined/left/promoted/changed
await restoreGroupSettings(sock, backup)              // subject, desc, locks

const menfess = createMenfessRelay()
menfess.bind(sock)
await menfess.start(sock, sender, targetJid, 'first anonymous message')
// both sides now chat through the bot as Anon-1 / Anon-2 until "stop"

// more upgrades: verifier { challenge: 'emoji' }, level ranks (Newbie→Legend)
```

```js
// notes, birthdays, games, i18n, fancy menus & join requests
import {
    createNotes, createBirthdayManager, createGuessGame,
    createI18n, styleText, createJoinRequestManager
} from '@japofc/baileys'

const notes = createNotes()
notes.set(chat, 'rules', 'No spam. Be kind.')     // !save rules …
notes.get(chat, 'rules')?.content                 // !get rules

const bdays = createBirthdayManager()
bdays.set(user, { day: 17, month: 8, year: 2000, chat })
bdays.onBirthday(({ user, age, chat }) =>
    sock.sendMessage(chat, { text: `🎂 HBD @${user.split('@')[0]} (${age})!`, mentions: [user] }))
bdays.start()

const game = createGuessGame({ timeoutMs: 60_000 })
game.bind(sock)
game.start(chat, { answer: 'Jakarta', hint: 'capital city', reward: 500 })
game.onCorrect(({ user, reward }) => eco.add(user, reward, 'quiz win'))

const i18n = createI18n({ defaultLang: 'en' })
i18n.addLanguage('id', { greet: 'Halo {name}!' })
i18n.setChatLang(chat, 'id')                      // !lang id
i18n.tFor(chat, 'greet', { name: 'Budi' })        // 'Halo Budi!'

styleText('Bot Menu', 'bold')                     // 𝗕𝗼𝘁 𝗠𝗲𝗻𝘂

const joins = createJoinRequestManager({ denylist: [spammer] })
joins.bind(sock)                                  // live join-request events
joins.onRequest(({ user, approve, reject }) => approve())
await joins.sweep(sock, groupJid)                 // process the pending list

// CLI upgrade: npx @japofc/baileys sticker in.webp out.webp --pack "My Pack" --author me
```

```js
// session & system tools
import {
    analyzeAuthState, repairAuthFolder,
    exportAuthToString, importAuthFromString, migrateFolderToAuthState,
    backupAuthStateRotating, createShutdownManager
} from '@japofc/baileys'

const report = await analyzeAuthState('./auth')     // session doctor
report.registered; report.counts; report.corrupted  // + issues list
await repairAuthFolder('./auth')                    // quarantine corrupted files

// ship the whole login as ONE string (SESSION_ID pattern) — keep it secret!
const sessionString = await exportAuthToString('./auth')
await importAuthFromString(sessionString, './auth') // on the new device

// move a folder session into ANY adapter (SQLite/Redis/Mongo/single-file):
const { state, saveCreds } = await useSQLiteAuthState('auth.db')
await migrateFolderToAuthState('./auth', state, saveCreds)

// timestamped encrypted backups that prune themselves:
await backupAuthStateRotating('./auth', './backups', { password, keep: 5 })

// change the auth password (or encrypt a legacy plaintext folder) without losing the session:
await rotateAuthPassword('./auth', { oldPassword: old, newPassword: next })
// → { rotated: 112, migratedFromPlaintext: 0, failed: [], skipped: [] }

const shutdown = createShutdownManager({ sock, saveCreds })
shutdown.register('close db', () => db.close())
shutdown.attach()                                   // SIGINT/SIGTERM → clean exit
```

```bash
# CLI: session management without writing code
npx @japofc/baileys session analyze ./auth
npx @japofc/baileys session repair  ./auth
npx @japofc/baileys session export  ./auth --out session.txt
npx @japofc/baileys session import  session.txt ./auth-new
```

```js
// wizards, webhooks, links, media tools & health
import {
    createConversationFlow, createWebhookBridge, buildWaMeLink, parseWaLink,
    getImageDimensions, createMediaGuard, createHealthMonitor
} from '@japofc/baileys'

const flows = createConversationFlow()
flows.define('order', [
    { id: 'item', prompt: 'What would you like?' },
    { id: 'qty', prompt: 'How many?', validate: t => /^\d+$/.test(t) || 'Numbers only!' }
])
flows.bind(sock)
await flows.start(sock, chat, sender, 'order')   // e.g. from a !order command
flows.onComplete(({ answers }) => console.log(answers.qty, 'x', answers.item))

const bridge = createWebhookBridge('https://my.server/hook', { secret, retries: 2 })
bridge.bind(sock)                                // messages → your backend/n8n

buildWaMeLink('+62 812-3456-7890', 'Hello!')     // https://wa.me/62812…?text=Hello%21
parseWaLink('https://chat.whatsapp.com/AbC…')    // { type: 'group-invite', code }

getImageDimensions(buffer)                       // { format: 'png', width, height }

const media = createMediaGuard({ blocked: ['sticker'], autoDelete: true })
media.bind(sock)                                 // "no stickers in this group"

const health = createHealthMonitor({ thresholds: { heapUsedMb: 400, eventLoopLagMs: 200 } })
health.onAlert(({ metric, value }) => sock.sendMessage(owner, { text: `⚠️ ${metric}: ${value}` }))
health.start()
```

```js
// security & stability hardening
import {
    createBugShield, sanitizeText, installCrashGuard,
    createConnectionWatchdog, createSecureLogger,
    exportAuthToString, checkAuthPermissions, hardenAuthFolder, autoReconnect
} from '@japofc/baileys'

const shield = createBugShield({ autoDelete: true })   // anti bug-message
shield.bind(sock)
shield.onDetected(({ sender, reasons }) => gate.banUser(sender, reasons.join(',')))
sanitizeText(dirtyText)                                // strips RTLO/zalgo/invisible flood

installCrashGuard({                                     // bot never dies silently
    onError: ({ type, error }) =>
        sock.sendMessage(owner, { text: `💥 ${type}: ${error?.message}` }).catch(() => {})
})

const watchdog = createConnectionWatchdog({ staleMs: 5 * 60_000 })
watchdog.bind(sock)
watchdog.onStale(() => sock.end(new Error('stale connection'))) // reconnect takes over
watchdog.start()

const logger = createSecureLogger()                     // creds NEVER hit the logs
const sock2 = makeWASocket({ auth: state, logger })

await exportAuthToString('./auth', { password })        // AES-encrypted JAPSESS2 export
await hardenAuthFolder('./auth')                        // chmod 700/600 everything
await checkAuthPermissions('./auth')                    // audit for leaks

autoReconnect(factory, {
    onGiveUp: ({ reason, attempts }) => notifyOwner(reason) // new: give-up hook + getStatus()
})
```

```js
// JAP AI cards from markdown, call tools, presence & button shortcuts
import { AIRich, createCallLog, createCallGuard, createAlwaysOnline,
         createStatusWatcher, quickButtons, sendConfirm } from '@japofc/baileys'

// whole AI card from one markdown string (headings/code/tables auto-detected)
await AIRich.fromMarkdown('# Report\n\n```js\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |', sock).send(jid)
new AIRich(sock).addChecklist([{ text: 'done item', done: true }, 'open item'])
    .addKeyValue({ Name: 'JAP', Version: '2.4.5' })
    .addProgressBar('Download', 70, 100)

const callLog = createCallLog()               // who called, outcome, duration
callLog.bind(sock)
createCallGuard({                              // quiet hours + hard blocks
    autoReject: true,
    schedule: { from: '22:00', to: '06:00' },  // reject only at night
    denylist: [spammer]                        // …except these: always
}).bind(sock)

createAlwaysOnline(sock).start()               // green dot stays lit
const statuses = createStatusWatcher()         // save contacts' stories
statuses.bind(sock)
statuses.onStatus(({ download }) => download())

await sendConfirm(sock, jid, 'Delete all data?')            // confirm_yes/confirm_no
await sendButtons(sock, jid, { text: 'Pick', buttons: quickButtons(['A', 'B']) })

// the 50+ round — grab-bag of daily drivers:
import { rollDice, matchScore, phoneToJid, prettyPhone, formatRelative,
         getGroupAdmins, diffParticipants, summarizeMessage, createKVStore } from '@japofc/baileys'

rollDice('2d6+3')                       // { rolls: [4, 2], total: 9 }
matchScore('budi', 'ani')               // 0-100, deterministic "jodoh meter"
phoneToJid('+62 812-3456-7890')         // 6281234567890@s.whatsapp.net
prettyPhone('6281234567890')            // +62 812-3456-7890
formatRelative(msg.timestamp)           // '5m ago'
getGroupAdmins(await sock.groupMetadata(jid))
summarizeMessage(msg)                   // '📷 image: caption…' for logs

const db = await createKVStore('./botdata.json')   // tiny persistent DB
db.namespace('settings').set(jid, { welcome: true })

// anti-ban pack — fresh numbers, sane group ops, smart reconnects
import { createAccountWarmup, classifyDisconnect, explainDisconnect,
         createGroupOpGuard, randomGaussian, createPresenceCycler } from '@japofc/baileys'

const warmup = createAccountWarmup({ startedAt: firstLoginTs })
if (warmup.trySend().allowed) await sock.sendMessage(jid, content)
// day 1 → 20 msgs, then 50, 100, 200, 400, 800, unlimited

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection !== 'close') return
    const verdict = classifyDisconnect(lastDisconnect)
    verdict.shouldReconnect ? restart() : console.log(explainDisconnect(lastDisconnect))
    // 🔑 [auth 401] Logged out from the phone — the session is gone, pair again.
})

const ops = createGroupOpGuard()
const safe = ops.wrap(sock)                        // guarded automatically
await safe.groupParticipantsUpdate(jid, users, 'add') // throws past ~3 adds/10min

await sleep(randomGaussian(2000, 600, { clamp: [500, 5000] })) // human-like pauses
createPresenceCycler(sock, { chats: [ownerJid] }).start()      // opt-in activity

// community events — giveaways, roll-calls, auctions, polls
import { createGiveaway, createAttendance, createAuction, createTextPoll } from '@japofc/baileys'

const giveaway = createGiveaway({ keyword: 'join' })
giveaway.bind(sock)
giveaway.start(chat, { prize: 'Voucher 50k', durationMs: 3600_000, winners: 2 })
giveaway.onEnd(({ winners }) => announce(winners))       // fair, injectable RNG

const absen = createAttendance()
absen.bind(sock)
absen.open(chat, { title: 'Absen Pagi 🌞' })             // members type "absen"
await sock.sendMessage(chat, { text: absen.render(chat), mentions: absen.getMentions(chat) })

const auction = createAuction()
auction.start(chat, { item: 'Akun ML', startBid: 50_000, minIncrement: 5_000, antiSnipeMs: 30_000 })
auction.bid(chat, user, 60_000)                          // → accepted / too-low / already-leading
auction.onEnd(({ winner, amount }) => sold(winner, amount))

const polls = createTextPoll()
polls.bind(sock)                                          // votes = plain "1".."9" replies
polls.start(chat, { question: 'Mabar jam?', options: ['19:00', '20:00', '21:00'] })
polls.onEnd(({ results }) => sock.sendMessage(chat, { text: polls.formatResults(results) }))

// games pack — duels & word games
import { createTicTacToe, createRPS, scrambleWord, generateMathProblem,
         createWordChain } from '@japofc/baileys'

const ttt = createTicTacToe()
ttt.challenge(chat, challenger, opponent); ttt.accept(chat, opponent)
ttt.play(chat, user, 5)                      // squares 1-9 → next/win/draw
await sock.sendMessage(chat, { text: ttt.render(chat) }) // ❌⭕3️⃣ emoji board

const suit = createRPS()
suit.challenge(chat, a, b, { bet: 5000 }); suit.accept(chat, b)
suit.pick(chat, a, 'batu')                   // picks stay hidden
suit.onResult(({ winner, loser, bet }) => eco.transfer(loser, winner, bet))

game.start(chat, { answer: scrambleWord('bandung') })       // acak kata
game.start(chat, generateMathProblem('hard'))               // 17 × 8 - 24 = ?
const chain = createWordChain()                             // sambung kata
chain.start(chat, { firstWord: 'makan' })
await chain.play(chat, user, 'nasi')         // ✅ n… — scores by word length

eco.rob(thief, victim)  // upgrade: wallet heists — bank money stays safe

// bot-business ops — rentals, activity, locks
import { createRentalManager, createMessageCounter, createCommandLock } from '@japofc/baileys'

const rental = createRentalManager()
rental.add(groupJid, { days: 30 }); rental.startTrial(newGroup, { days: 3 })
sock.ev.on('messages.upsert', rental.filter(handler)) // unrented groups ignored
rental.onExpiring(({ chat }) => remind(chat))          // renewal reminder (24h before)
rental.onExpire(({ chat }) => sock.groupLeave(chat))
rental.startSweeper()

const counter = createMessageCounter()
counter.bind(sock)
counter.renderDigest(chat)   // 🥇 @user — 42 pesan (daily top chatters)

const locks = createCommandLock({ owners: [ownerJid] })
locks.lock(chat, 'slot'); locks.lockGlobal('rob')
router.use(locks.middleware())                         // blocked before handlers run
locks.setMaintenance(true, { message: '🛠️ maintenance' }) // owners still pass

// MEGA UPGRADE SWEEP (36 upgrades across the whole toolkit):
// kv TTL + getOrSet · notes pinning 📌 · todo priorities 🔴🟡 · recurring
// reminders · warns.renderList · eco.getEconomyStats + eco.work() jobs ·
// shop.renderCatalog · tiers.extendAll (downtime compensation) ·
// quota.renderStatus · level PRESTIGE ⭐ · guess.revealHint('j_k__t_') ·
// ttt win/loss records + leaderboard · RPS best-of-3 series · giveaway
// canJoin requirements · attendance streaks · auction buy-now price ·
// poll renderLive bars · menfess.listActiveSessions · afk.renderAfkList ·
// shield.getReasonStats · gate.banMany (raid cleanup) · warmup.skip ·
// opGuard.waitAndAssert · watchdog autoRestart · health sparklines ▁▅▃█ ·
// router hidden commands + ctx.quotedText · i18n.addLanguages ·
// stats.renderTop · m.timestampMs · tag-all chunking for huge groups ·
// isForwarded/getForwardInfo · rental.renderList
//
// HUNT/UPDATE ROUND (fork ecosystem fully swept — 0 gaps left):
// WA version → live 2.3000.1048680055 · flow backWords ('kembali' rewinds) ·
// url-watcher ETag/304 conditional polling · health probe timeouts ·
// crash-guard alert throttling · webhook body caps · wa.me/message/CODE
// business links · formatParticipantChanges(➕➖⬆️⬇️) · boxText('MENU') ╔═╗ ·
// reminders.renderList

// conversation-flow upgrade: choice steps
flows.define('order', [{ id: 'size', prompt: 'Size:', choices: ['S', 'M', 'L'] }])
// renders numbered options; answers accepted by text OR number
// CLI: npx @japofc/baileys wa → package + baked WA Web version

// +18 upgrades: titleCase/slugify/generateId, shop.updateItem, notes.exportText,
// warns.getTop, stats.getTopChats, i18n.formatNumber/formatDate, levels.getRankPosition,
// quota.getAllUsage, tiers.renderStatus, birthday.renderUpcoming, guess.startNumberGame,
// flood.getTopFlooders, gate.listBans, health.setThreshold, watchdog.getReport

// 10 more upgrades: temp bans gate.banUser(jid, r, { expiresInMs }),
// flood autoMuteMs + isMuted, eco.applyInterest(0.01) bank interest,
// shop item maxPerUser, warns.decay(30d), levels.setMultiplier(2) XP events,
// quota.setLimit live, tiers.getExpiring(3d) renewal crons,
// reminders.snooze(id, 10m), todos.setDue + getOverdue (⏰ in render)
```

#### Group / community metadata helpers (v2.4.7)

```js
import { extractLIDPNPairs, GROUP_PARTICIPANTS_CHUNK_SIZE } from '@japofc/baileys'

// Every LID↔PN pair a metadata fetch already carries — normalized + deduplicated.
// The socket now stores these automatically on groupMetadata() /
// groupFetchAllParticipating() / communityMetadata(), so getLIDForPN() and
// getPNForLID() resolve group members without extra USync round-trips.
const meta = await sock.groupMetadata(jid)
extractLIDPNPairs(meta)        // [{ lid: '999@lid', pn: '628…@s.whatsapp.net' }, …]
extractLIDPNPairs(cachedMeta)  // pure + null-safe — works on cached metadata too

GROUP_PARTICIPANTS_CHUNK_SIZE  // 25 — participant arrays are chunked at this size
```

> Also fixed in v2.4.7: group metadata no longer returns `NaN` for `subjectTime` /
> `creation` / `descTime` when WhatsApp omits them (they're `undefined` now, so they
> don't persist as `null`), and community metadata finally reports `addressingMode`
> and honours the server's `size` attribute — both previously diverged from the
> group parser on identical payloads.

#### `w:gp2` group-notification helpers (v2.4.7)

```js
import { resolveNotificationActors, extractNotificationLIDPNPairs,
         parseNotificationParticipants } from '@japofc/baileys'

// Who did it, and to whom — resolved as a UNIT. Before v2.4.7 the two halves fell
// back independently, so a join request could report the requester's LID next to
// the admin's phone number.
const actors = resolveNotificationActors(notificationNode, actionChild)
// { actingLid, actingPn, actingUsername, affectedLid, affectedPn, affectedIsActor }

parseNotificationParticipants(actionChild)        // messageStubParameters shape
extractNotificationLIDPNPairs(node, actionChild)  // [{ lid, pn }] — consistent pairs only

// The socket now stores those pairs automatically on every group notification, and a
// stale pair can be dropped after a change-number event:
await sock.signalRepository.lidMapping.removeMapping('628…@s.whatsapp.net')
```

#### App-state sync diagnostics (v2.4.8)

```js
await sock.appStateSyncStatus()
// [ { name: 'critical_block', version: 0,  synced: false, mutations: 0 },
//   { name: 'regular_high',   version: 41, synced: true,  mutations: 183 }, … ]

await sock.appStateSyncStatus('regular_high')   // one collection
await sock.resyncAppState(['regular_high'], false)
```

`version` is what the next resync would ask the server to continue from, `synced` says whether
we hold any state for that collection at all, and `mutations` is how many index entries the
LT-hash is tracking — the three numbers you actually need when chat state (mute/archive/pin)
stops following your phone. Unknown collection names fail with a 400 instead of returning
nothing.

#### Partial media downloads (v2.4.8)

```js
// Sniff the real file type before committing to a 50 MB download
const head = await sock.downloadMediaHeader(msg, 32)          // first 32 plaintext bytes
const isMp4 = head.subarray(4, 8).toString() === 'ftyp'

// Any slice you like: { start, end } (end exclusive) or { start, length }
const slice = await sock.downloadMediaRange(msg, { start: 1_000_000, length: 65_536 })

// Resume an interrupted transfer — everything from byte N onwards
const rest = await sock.downloadMediaRange(msg, { start: bytesAlreadyOnDisk })
```

Both go through the same expired-media recovery as `sock.downloadMedia()` (a 410/404 asks the
phone to re-upload and retries once); pass `{ disableRetry: true }` to skip it. The standalone
functions `downloadMediaRange()` / `downloadMediaHeader()` are exported too. Ranges are
validated up front — a negative `start`, an empty window, or passing both `end` and `length`
fails with a 400 instead of a confusing stream error. (Before v2.4.8 a `startByte`-only range
resolved with **zero bytes**; see BUGREPORT 2.77.)

#### Media-connection and device-list helpers (v2.4.7)

```js
import { parseMediaConnNode, isMediaConnExpired, MEDIA_CONN_DEFAULT_TTL,
         dedupeJidsByUser, dedupeDeviceList } from '@japofc/baileys'

// The <media_conn> handshake, parsed safely. Before v2.4.7 a missing/non-numeric
// `ttl` became NaN, and `now - fetchDate > NaN * 1000` is false forever — so the
// upload connection was never refreshed again and kept using a stale auth token.
const media = parseMediaConnNode(mediaConnNode)
// { hosts, auth, ttl, fetchDate } — ttl is never NaN; falls back to 300s
MEDIA_CONN_DEFAULT_TTL              // 300

isMediaConnExpired(media)           // false while fresh
isMediaConnExpired({ ttl: NaN })    // true — anything unusable counts as expired

// Order-preserving dedup, as used by the USync device fan-out. Messaging your own
// number used to enumerate (and encrypt to) every one of your devices twice.
dedupeJidsByUser([{ jid: a }, { jid: a }, { jid: b }])   // → [a, b]
dedupeDeviceList(devices)  // keyed on user + device index; `u@s` === `u:0@s`
```

#### Reading USync errors (v2.4.7)

```js
import { extractUSyncErrors, hasUSyncQueryError, USyncQuery, USyncUser } from '@japofc/baileys'

const result = await sock.executeUSyncQuery(
    new USyncQuery().withContactProtocol().withUsers(
        new USyncUser().withPhone('+628111'),
        new USyncUser().withPhone('+628222')
    )
)

// Before v2.4.7 a refused query ("rate overlimit") parsed into an empty list that looked
// exactly like "nobody matched". The server's errors are now on the result.
result.errors            // [{ code: 479, text: 'rate overlimit' }]
hasUSyncQueryError(result.errors)   // true -> the whole query failed, don't trust `list`
                                    // false -> only individual users failed (entries carry `jid`)

extractUSyncErrors(rawIqNode)       // same extraction, standalone and null-safe

// onWhatsApp() now also accepts @lid arguments for real (they used to be dropped
// silently), always resolves to an array, and tells you which LID an entry came from:
await sock.onWhatsApp('628111@s.whatsapp.net', '99887766@lid')
// [{ jid: '628111@s.whatsapp.net', exists: true, lid: undefined }, …]
```

#### Store dictionary and participant-list helpers (v2.4.7)

```js
import { makeOrderedDictionary } from '@japofc/baileys'
import { upsertParticipants, removeParticipants, setParticipantsAdmin } from '@japofc/baileys'

// Restoring a snapshot used to replace the array but not the id index, so every
// message came back invisible to get() and re-upserting one appended a duplicate.
const dict = makeOrderedDictionary(m => m.key.id)
dict.fromJSON(JSON.parse(snapshot))
dict.get('AAA')          // the restored message, not undefined
dict.update(newVersion)  // true when it really updated (was always false)
dict.has('AAA')          // new in v2.4.7
dict.size()              // new in v2.4.7

// Participant-list mutations: order-preserving, non-mutating, and matching a person
// by `id` OR `phoneNumber` (the two halves of a LID<->PN pair are the same member).
upsertParticipants(list, [{ id: '2@lid' }])        // merges, never duplicates
setParticipantsAdmin(list, [{ id: '1@lid' }], null) // demote -> admin: null (not false)
removeParticipants(list, [{ phoneNumber: '628…@s.whatsapp.net' }])
```

#### Labels repository round-trip (v2.4.7)

```js
import { ObjectRepository } from '@japofc/baileys'

// toJSON() emits an array, but the constructor only understood a { id: entity } map, so
// feeding a snapshot back in produced entries keyed '0', '1', … and lost every label.
const labels = new ObjectRepository({ L1: { id: 'L1', name: 'Work' } })
const restored = ObjectRepository.fromJSON(JSON.parse(JSON.stringify(labels)))
restored.findById('L1')   // { id: 'L1', name: 'Work' } — not undefined
restored.hasId('L1')      // new in v2.4.7
restored.load([{ id: 'L2', name: 'Family' }])
restored.clear()
```

#### Chat-list classification (v2.4.7)

```js
import { classifyMessage, isMissedCallMessage, MISSED_CALL_STUB_TYPES } from '@japofc/baileys'

// Before v2.4.7 a missed call could never be a "real" message — the content check was
// ANDed over the stub-type allowances too — so it never moved its chat up the list.
classifyMessage(missedCallStub, meId)
// { isReal: true, isStub: true, isMissedCall: true, isAboutMe: false,
//   incrementsUnread: false, contentType: undefined }

classifyMessage(textMessage, meId).contentType   // 'conversation'
isMissedCallMessage(msg)                         // true for the 4 missed-call stubs
MISSED_CALL_STUB_TYPES                           // the table itself
```

#### Reading `messageStubParameters` (v2.4.7)

```js
import { parseStubParticipant, stubParticipantIdentities, stubParticipantsInclude } from '@japofc/baileys'

// Stub parameters are ragged: a JSON pair for some stub types, a plain jid for others.
parseStubParticipant('{"lid":"1@lid","pn":"2@s.whatsapp.net"}')  // { lid, pn }
parseStubParticipant('628111@s.whatsapp.net')                    // { phoneNumber }
stubParticipantIdentities(p)   // every jid this person can be addressed by

// "Is one of these people me?" — checks lid AND pn, so a LID-addressed group matches.
stubParticipantsInclude(msg.messageStubParameters, sock.user.id, sock.user.lid)
```

> Invite-link join requests now emit `group.join-request` as well (only the
> admin-add variant used to), so `createJoinRequestManager()` sees them.

```js
// the 20+ round: text tools, reminders, quotas, tiers, todos & more
import {
    readMore, progressBar, formatDuration, chunkText, similarity,
    parseDuration, createReminderManager, createQuotaManager,
    createTierManager, createTodoList, createUrlWatcher, getZodiac
} from '@japofc/baileys'

readMore('Promo!', 'long details…')       // collapses behind "Read more"
progressBar(70, 100)                      // ███████░░░ 70%
formatDuration(93_784_000)                // 1d 2h 3m
chunkText(longText, 4000)                 // split for WA limits

const reminders = createReminderManager()
reminders.add({ chat, user, text: 'angkat gorengan', inMs: parseDuration('10m') })
reminders.onDue(({ chat, user, text }) =>
    sock.sendMessage(chat, { text: `⏰ @${user.split('@')[0]} ${text}`, mentions: [user] }))

const tiers = createTierManager()
tiers.setTier(user, 'premium', { days: 30 })
const quota = createQuotaManager({ defaultLimit: 20, limits: { premium: 200 } })
if (!quota.consume(sender, tiers.getTier(sender)?.name).allowed) return ctx.reply('Jatah habis!')

const todos = createTodoList()
todos.add(chat, 'bayar wifi', { assignee: member })
await sock.sendMessage(chat, { text: todos.render(chat), mentions: todos.mentions(chat) })

const watcher = createUrlWatcher('https://api.example.com/status.json', { intervalMs: 60_000 })
watcher.onChange(({ body }) => sock.sendMessage(owner, { text: `🔔 changed: ${body.slice(0, 300)}` }))
watcher.start()

// upgrades: eco.deposit/withdraw + eco.getRank, levels.renderRankCard,
// router { onUnknownCommand } + router.remove, i18n.tn plurals,
// styleText 'negativeSquared'/'boldFraktur', getZodiac(17, 8) → 'Leo',
// guess-game near-miss hints, formatHealthSnapshot for owner DMs
```
| `stickerpack` | Build and send sticker packs (including animated/Lottie) |
| `templates` | Legacy WhatsApp Business template message helpers |
| `vcard` | Build vCard (contact card) payloads |
| `status` | Post and manage WhatsApp Status updates |
| `event-buffer` | Buffers/coalesces high-volume socket events for heavier bots |
| `doctor` | `checkEnvironment()` / `printEnvironmentReport()` — one-call environment diagnostics |

Every module above ships a matching `.d.ts`, so your editor will show full hover-docs regardless of which ones you import.

</details>

<div align="right"><sub><a href="#top">⬆ back to top</a></sub></div>

---

## 🛠 Recommended Environment

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| Module system | ESM |
| WhatsApp | Latest Multi Device |

---

## 📘 TypeScript Support

Full `.d.ts`: every shipped `.js` file has a matching TypeScript declaration (guarded by `tests/types-parity.test.js`), and the whole package verifies at zero errors under `tsc --strict`. `import { ... } from '@japofc/baileys'` resolves with no `@types/` package needed (beyond the standard `@types/node` every Node TS project has): `makeWASocket` incl. the username methods and `USERNAME_*` constants, all `Types/*` definitions, `WAProto`, stores, `Utils/*`, the message builders (`Button`, `Poll`, `Carousel`, `AIRich`, `A2UI`, … with Bloks node types), the Bot Framework (`Bot`, `Context`, …), and the VoIP client (`VoipClient`, `ActiveCall`, …). Complex wire payloads are typed as loose records where WhatsApp publishes no schema.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>Connection keeps dropping / reconnect loop</b></summary>
<br/>

Check the `lastDisconnect.error` field on `connection.update`. If the status code is `401` (loggedOut), the session really is invalid and needs a fresh QR scan — do not auto-reconnect in that state. For other codes (`428`, `440`, etc.), reconnecting with backoff is usually enough.

</details>

<details>
<summary><b>QR not showing / not scanning</b></summary>
<br/>

Upstream Baileys removed `printQRInTerminal`, but in this package the option **works again** — the QR is drawn automatically by the built-in renderer (vendored [qrcodegen](https://github.com/nayuki/QR-Code-generator), zero extra dependencies). You can also render manually from the `qr` event with `renderQRToTerminal(qr)` / `qrToSVG(qr)` / `qrToPNG(qr)` / `qrToMatrix(qr)`. If the QR shows but linking fails, the WA Web version (`version` in `makeWASocket`) is usually stale; fetch the latest via `fetchBestWaVersion()` (chain: WA's sw.js → baileys forks → fallback). The `Bot` framework already does this automatically on every `start()`/reconnect (disable with `versionCheck: false`). QR looks "inverted" on a light terminal theme? Use `renderQRToTerminal(qr, { inverted: true })`.

</details>

<details>
<summary><b>"Bad MAC" errors / messages fail to decrypt</b></summary>
<br/>

This usually happens when the auth state folder is corrupted or the session is used by more than one process at the same time. Make sure only one instance writes to a given auth state folder, and consider `pruneStaleAuthFiles()` to clean up stale sender keys periodically.

</details>

<details>
<summary><b>Memory keeps growing on long-running bots</b></summary>
<br/>

With `makeInMemoryStore()`, the chat/message/contact caches grow without bound. For long-running bots, consider switching to one of the `makePersistentStore()` backends (SQLite/Redis/etc.) and use `event-buffer` to absorb event bursts under high traffic.

</details>

<details>
<summary><b>Voice call fails to connect</b></summary>
<br/>

This feature is still experimental and needs the `@roamhq/wrtc` peer dependency — make sure it's installed and that its native bindings support your platform. Check the `call.on('ended', reason => ...)` event for details on why it failed.

</details>

<details>
<summary><b>Media features failing / "ffmpeg not found"</b></summary>
<br/>

Run `printEnvironmentReport()` (see [doctor](#check-your-environment-doctor)) — it shows exactly what's missing. For ffmpeg: on servers `npm i ffmpeg-static`, on Termux `pkg install ffmpeg` — both auto-detected with zero config.

</details>

<details>
<summary><b>Startup banner is in the way / want it off</b></summary>
<br/>

The banner is part of this package's identity and shows once per process. It's designed to stay out of your way: on an interactive terminal you get the full banner; in CI/pm2/piped logs it collapses to a single plain-text line (no ANSI codes, so JSON/structured log pipelines are never corrupted). `NO_COLOR=1` removes the styling but not the banner.

Since v2.4.3 the banner doubles as a startup health card — gradient wordmark plus a framed info panel showing the package version, the baked WA Web client version, node/platform/pid, and a rotating daily tagline:

```text
       ██╗   █████╗   ██████╗
       ██║  ██╔══██╗  ██╔══██╗
       ██║  ███████║  ██████╔╝
  ██   ██║  ██╔══██║  ██╔═══╝
  ╚█████╔╝  ██║  ██║  ██║
   ╚════╝   ╚═╝  ╚═╝  ╚═╝

  ╭────────────────────────────────────────────────────────────────╮
  │ @japofc/baileys v2.4.5   ● typed · extended · battle-tested    │
  │ WA Web 2.3000.1048680055   node 20.20.2 · linux/x64 · pid 1472 │
  │ ⚡ anti-ban toolkit   🛡️ bug-shield   📚 github.com/JAPofc/baileys │
  ╰────────────────────────────────────────────────────────────────╯
   "from Termux to production."  — Made with 🍃 by J.AP
```

</details>

---

## 🤝 Contributing

Contributions are welcome — especially bug fixes, documentation, and enhancements to `MessageBuilder` / `AIRich`.

1. Fork this repo and branch off `main` (`feat/feature-name` or `fix/bug-name`)
2. Keep changes ESM-only and add/update the matching `.d.ts` declarations
3. Test your change against at least one auth state path + one store backend before opening a PR
4. Open a Pull Request with a short description: what changed and why

For bug reports, include your Node.js version, reproduction steps, and the relevant `lastDisconnect.error` log snippet.

---

## 🙏 Credits

Built on the shoulders of the open-source WhatsApp community.

Full details and license terms per component: see [`NOTICE.md`](./NOTICE.md).

---

## 👑 Maintainer

<table>
<tr>
<td width="180" align="center">
<img src="https://github.com/JAPofc.png" width="160" alt="J.AP avatar" style="border-radius:50%"/>
</td>
<td>

**J.AP**

- GitHub: [github.com/JAPofc](https://github.com/JAPofc)
- Package: [`@japofc/baileys`](https://www.npmjs.com/package/@japofc/baileys)
- ✦ Maintains this fork solo — issues & PRs are welcome and reviewed personally.

</td>
</tr>
</table>

---

## ⚠️ Disclaimer

This project is an independent fork.
Use responsibly and follow WhatsApp Terms of Service.

---

## 📝 Patch Notes Archive

> The full, current release history lives in **[CHANGELOG.md](./CHANGELOG.md)**. Older per-version summaries are archived below.

<details>
<summary><b>📜 Show archived patch notes (v2.4.3 → V4)</b></summary>

<br/>

### v2.4.2 & v2.4.3

> Summary — full details in [CHANGELOG.md](./CHANGELOG.md).

### v2.4.3

- **Community events**: `createGiveaway` (fair raffles), `createAttendance` (absen + streaks), `createAuction` (anti-snipe + buy-now), `createTextPoll` (vote-by-number, works in every client).
- **Games**: `createTicTacToe` (records + leaderboard), `createRPS` (suit, hidden picks, best-of-N), `createWordChain` (sambung kata), `scrambleWord`, `generateMathProblem`.
- **Bot business**: `createRentalManager` (sewa per chat, one-trial-ever, unrented-group filter), `createMessageCounter` (daily digests 🥇), `createCommandLock` (+maintenance mode with owner bypass).
- **Fork ecosystem fully swept** (upstream rc14 + 8 living forks downloaded & API-diffed — zero gaps left): took `status-tools` (auto-styled text statuses, wired into status sends) and `newsletter-tools` (paced batch follow/unfollow/mute).
- **AI groups (experimental, server-gated)**: `addAiBotToGroup` / `createAiGroup` — Meta AI in groups; acceptance depends on Meta's per-account rollout, rejections surface as status codes.
- **36-upgrade sweep** across the whole toolkit (kv TTL, notes pinning, recurring reminders, economy `work()`/`rob()`/interest, level PRESTIGE ⭐, `revealHint`, temp bans, `waitAndAssert`, watchdog `autoRestart`, sparklines, `ctx.quotedText`, ETag polling, alert throttling, `boxText`, and more) + 9 follow-ups.
- **Startup banner v2**: framed health card (package + WA Web version, node/platform/pid, daily tagline).
- WA Web version → live `2.3000.1048680055`; CLI gained `wa` and `sticker` insights.

### v2.4.2

- **Anti-ban pack**: `createAccountWarmup` (20→50→…→unlimited daily ramps), `classifyDisconnect`/`explainDisconnect`, `createGroupOpGuard` (~3 adds/2 creates per 10 min + `wrap(sock)`), Gaussian jitter, opt-in `createPresenceCycler`.
- **Security & stability**: `createBugShield` (mention bombs/zalgo/RTLO + `sanitizeText`), `createSecureLogger` + `redactSensitive`, encrypted `JAPSESS2` session strings, `hardenAuthFolder`, `installCrashGuard` + `safeStringify`, `createConnectionWatchdog`.
- **Session & DB tools**: `analyzeAuthState` (session doctor), `repairAuthFolder`, portable session export/import strings, `migrateFolderToAuthState`, `backupAuthStateRotating`, `createShutdownManager`, CLI `session` command.
- **Moderation & community**: flood/word-filter/warns/gatekeeper/levels/quota/tiers/economy+shop/command-stats/anti-tagall/verifier/join-requests/group-backup/menfess.
- **Bot toolkit**: `serializeMessage`, call guard + call log, group events, view-once toolkit, anti-link, anti-delete/edit, reaction/receipt/presence trackers, auto-read, AFK, tag-all/hidetag, pairing tools (`pairWithCode`), router guards, conversation flows, webhook bridge, health monitor, i18n, fancy-text, 140+ utility modules in total.
- **Pure-JS sticker EXIF** — `node-webpmux` dependency removed; sticker branding works on Termux; CLI `sticker` command.

---

### v2.1.0

> Summary — full details in [CHANGELOG.md](./CHANGELOG.md).

- **Built-in QR, zero dependencies**: vendored [qrcodegen](https://github.com/nayuki/QR-Code-generator) (Nayuki, MIT) + our own renderer — `renderQRToTerminal` (half-block `▀▄█`, half the height of classic renderers), `qrToSVG`, `qrToPNG` (hand-rolled PNG encoder on top of Node's zlib), `qrToMatrix`, `formatPairingCode`. Round-trip verified against an independent decoder (jsQR) in CI.
- **`printQRInTerminal` works again** — not a deprecation warning: the QR is drawn automatically in the terminal on every `connection.update`.
- **Fixed the VoIP `VoipStatsTracker is not a constructor` spam**: the Metro shim in `worker-bootstrap.js` shifted `module`/`exports` by one position (5th argument `null`). Fixed for both FB Comet bundle export conventions (flag-66 → arg 6, flag-98 → arg 7, 124/204 modules) + an `?.exports` fallback in the loader. Verified the real worker boots all the way to `worker_ready` with no shim errors.
- **Auto WA-version in the `Bot` framework**: every `start()`/reconnect resolves a fresh version via `fetchBestWaVersion()` (WA's sw.js → forks → fallback), preventing 405 pairing failures caused by stale versions. Opt-out: `versionCheck: false` or pin `socketConfig.version`.
- **Genuinely full `.d.ts`**: every shipped `.js` has a matching declaration file, enforced by a parity test + a `tsc --strict` harness in CI.
- **CI + release automation**: GitHub Actions (tests on Node 20/22, type-check, pack sanity) and a provenance-attested publish workflow triggered by `v*` tags.

---

### V6

- Fixed a `package.json` typo: the version field was mistakenly left at `1.0.1` instead of `2.0.1` after the V5 release — corrected to `2.0.1` so the published package version matches the intended release.
- Expanded README documentation, especially around `lib/Builders/`:
  - Added the new [📁 Builders Folder Map](#-builders-folder-map-libbuilders) section — a per-file breakdown of everything under `lib/Builders/` (`shared.js`, `Button.js`, `ButtonV2.js`, `ButtonV3.js`, `Carousel.js`, `Poll.js`, `AIRich.js`, `A2UI.js`, `JapBaileys.js`, `index.js`), what each file exports, and what it's for — previously `A2UI` and `JapBaileys` in particular had no usage documentation at all.
  - Added a usage example for the `JapBaileys` unified builder hub.
- Redesigned `postinstall-banner.js`: cleaner box layout with a divider separating the title block from a small info section (Node version + docs link), a 256-color palette instead of basic ANSI colors, and a plain-text fallback when stdout isn't a TTY or `NO_COLOR` is set (CI logs, piped output) instead of forcing a box that may render misaligned.

---

### V5

- Added [Username Management](#-username-management): `checkUsername`, `checkUsernameMulti`, `setUsername`, `deleteUsername`, `getMyUsername`, `setUsernamePin`, `findUserByUsername`, `fetchContactUsernames`, `getUsernameRecommendations`, layered onto the existing `USyncUsernameProtocol` support.
- Added the [Bot Framework](#-bot-framework) (`Bot`, `Context`, `SessionManager`, `StatsManager`, `MediaManager`, `SQLiteStore`). Adapted on the way in:
  - `SQLiteStore`/`StatsManager` construction moved behind an async `.create()` factory so `better-sqlite3` stays a lazily-loaded optional peer dep instead of a hard top-level import that would crash the Framework module for anyone without it installed.
  - `MediaManager`'s sticker/voice-note conversion now reuses this fork's existing lazy `fluent-ffmpeg` loader (see `Utils/MessageBuilder.js`) instead of adding `ffmpeg-static` + a second ffmpeg dependency; sticker EXIF metadata is written by the built-in pure-JS muxer (`sticker-exif`) — no extra package needed.
  - `Bot`'s default logger now falls back to this fork's own pino instance instead of a silent no-op stub.
- No `.d.ts` files were written for the new Framework module yet — see the note in that section.
- Bumped to `1.0.1`.

---

### V4

- Kept the existing J.AP custom MessageBuilder classes and AIRich implementation intact.
- Added `whatsapp-rust-bridge@0.5.5` as a runtime dependency. The library already dynamically imports this module for LT Hash/app-state and crypto helpers; declaring it prevents accidental missing-module fallbacks in normal installations.
- Existing guarded fallbacks for platforms where the native bridge cannot load remain in place.
- ESM-only package metadata is preserved; no CommonJS build is included.

</details>

<div align="right"><sub><a href="#top">⬆ back to top</a></sub></div>

---

<div align="center">

Made with 🍃 by **JAP**

Thanks for visiting, bye 👋

<a href="#top">⬆️ Back to top</a>

</div>
