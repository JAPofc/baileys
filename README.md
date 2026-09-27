<div align="center" id="top">

<img src="https://raw.githubusercontent.com/JAPofc/baileys/main/Media/banner.svg" width="100%" alt="@japofc/baileys — WhatsApp Web API, typed, extended, battle-tested"/>

<p>
<a href="https://www.npmjs.com/package/@japofc/baileys" target="_blank"><img src="https://img.shields.io/npm/v/@japofc/baileys?color=2ecc71&label=npm&style=for-the-badge" alt="npm version"/></a>
<a href="https://www.npmjs.com/package/@japofc/baileys" target="_blank"><img src="https://img.shields.io/npm/dt/@japofc/baileys?color=3498db&style=for-the-badge" alt="npm downloads"/></a>
<a href="https://github.com/JAPofc/baileys/stargazers" target="_blank"><img src="https://img.shields.io/github/stars/JAPofc/baileys?color=f1c40f&style=for-the-badge" alt="GitHub stars"/></a>
<a href="https://github.com/JAPofc/baileys/issues" target="_blank"><img src="https://img.shields.io/github/issues/JAPofc/baileys?color=e74c3c&style=for-the-badge" alt="GitHub issues"/></a>
</p>
<p>
<a href="https://github.com/JAPofc/baileys/actions/workflows/ci.yml" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/JAPofc/baileys/ci.yml?branch=main&style=flat-square&label=CI&color=2ecc71" alt="CI status"/></a>
<a href="https://japofc.github.io/baileys/" target="_blank"><img src="https://img.shields.io/badge/docs-typedoc-8e44ad?style=flat-square" alt="API docs"/></a>
<img src="https://img.shields.io/badge/npm-provenance%20attested-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="npm provenance"/>
<img src="https://img.shields.io/badge/tests-347%20passing-2ecc71?style=flat-square" alt="Tests"/>
<a href="https://socket.dev/npm/package/@japofc/baileys" target="_blank"><img src="https://socket.dev/api/badge/npm/package/@japofc/baileys" alt="Socket badge"/></a>
<img src="https://img.shields.io/badge/tsc%20--strict-clean-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="tsc strict clean"/>
<img src="https://img.shields.io/github/last-commit/JAPofc/baileys?color=9b59b6&style=flat-square" alt="Last commit"/>
<img src="https://img.shields.io/github/languages/code-size/JAPofc/baileys?color=e67e22&style=flat-square" alt="Code size"/>
<img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="Node >=20"/>
<img src="https://img.shields.io/badge/module-ESM-blue?style=flat-square" alt="ESM"/>
<img src="https://img.shields.io/badge/dependencies-zero%20QR%2FPNG%20deps-success?style=flat-square" alt="Zero extra deps"/>
<img src="https://img.shields.io/badge/license-see%20NOTICE-lightgrey?style=flat-square" alt="License"/>
</p>


[🇬🇧 English](./README.md) · **[🇮🇩 Bahasa Indonesia](./README.id.md)**

<p>
<a href="#-why-this-fork">About</a> &#xa0;|&#xa0;
<a href="#-comparison">Comparison</a> &#xa0;|&#xa0;
<a href="#-features">Features</a> &#xa0;|&#xa0;
<a href="#-installation">Installation</a> &#xa0;|&#xa0;
<a href="#-quick-start">Quick Start</a> &#xa0;|&#xa0;
<a href="#-usage-examples">Examples</a> &#xa0;|&#xa0;
<a href="#-faq--troubleshooting">FAQ</a> &#xa0;|&#xa0;
<a href="#-contributing">Contributing</a> &#xa0;|&#xa0;
<a href="#-credits">Credits</a> &#xa0;|&#xa0;
<a href="#-maintainer">Maintainer</a>
</p>

<details>
<summary>📖 Full table of contents</summary>
<br/>

- [🍃 Why this fork](#-why-this-fork)
- [🆚 Comparison](#-comparison)
- [🧰 Built With](#-built-with)
- [🔥 Features](#-features)
- [✨ Exclusive J.AP Enhancements](#-exclusive-jap-enhancements)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [🔐 Authentication](#-authentication)
- [🗄️ Store Backends](#-store-backends)
- [💡 Usage Examples](#-usage-examples)
- [📨 Message Helpers](#-message-helpers)
- [🧰 Channels, History & Transcripts](#-channels-history--transcripts)
- [🔐 Security Pack](#-security-pack)
- [🆕 WA 2026 catch-up](#-wa-2026-catch-up)
- [🆕 Everyday Utilities](#-everyday-utilities)
  - [Buttons & Native Flow](#buttons--native-flow)
  - [Poll](#poll)
  - [Carousel](#carousel)
  - [AIRich — rich response cards](#airich--rich-response-cards)
  - [📁 Builders Folder Map](#-builders-folder-map-libbuilders)
  - [📌 Pin / Keep in Chat](#-pin--keep-in-chat)
  - [📞 Scheduled Call](#-scheduled-call)
  - [📱 Mini App](#-mini-app)
- [📞 Voice & Video Calls](#-voice--video-calls)
- [🔎 User Sync Queries](#-user-sync-queries)
- [👤 Username Management](#-username-management)
- [🤖 Bot Framework](#-bot-framework)
- [🧩 Utility Modules](#-utility-modules)
- [🛎️ System Notification Filter](#system-notification-filter)
- [🛠 Recommended Environment](#-recommended-environment)
- [📘 TypeScript Support](#-typescript-support)
- [❓ FAQ & Troubleshooting](#-faq--troubleshooting)
- [🤝 Contributing](#-contributing)
- [🙏 Credits](#-credits)
- [👑 Maintainer](#-maintainer)
- [⚠️ Disclaimer](#-disclaimer)
- [📝 Patch Notes](#-v210-patch-notes)

</details>

</div>

---

## 🍃 Why this fork?

Most Baileys forks are the upstream code with a renamed package and a couple of copied snippets. **This one is a maintained divergence** — the socket core is audited and patched (with each fix marked `JAP@Fix` in the source so you can grep every change), and whole subsystems exist here that upstream doesn't have:

| | |
|---|---|
| 🔬 | **Audited core, not just re-exported** — store consistency, reconnect lifecycle, Signal session recovery and retry-receipt parsing all had real reproduced bugs fixed here, each locked in by a regression test |
| 🧪 | **347 tests + `tsc --strict` in CI** — message shapes round-trip through real protobuf encode→decode; a published-package smoke test runs after every npm release |
| 📊 | **Built-in observability** — `createDebugMonitor()` gives connection state, message latency percentiles, Signal error tallies and retry stats, with secrets structurally redacted |
| 🎯 | Extended native flow support, carousel, AIRich cards, mini-apps |
| 🗄️ | Multiple auth & store backends out of the box (file, SQLite, MongoDB, MySQL, PostgreSQL, Redis) |
| 📞 | Experimental voice-call (VoIP) support — WASM call stack + WebRTC relay |
| 🎞️ | ffmpeg auto-detection — `ffmpeg-static`, `@ffmpeg-installer` or system binary, Termux-aware install hints |
| 🔒 | **Supply-chain friendly** — zero install scripts, npm provenance attested, honest docs (protocol gaps are documented as limitations, never faked) |

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

### Native Flow Expansion

<table>
<tr>
<td valign="top" width="33%">

**Buttons & Actions**
- cta_reminder
- cta_cancel_reminder
- otp_button
- authentication_button
- call_button
- url_button
- reply_button
- voice_call
- video_call_button

</td>
<td valign="top" width="33%">

**Commerce Flow**
- catalog_message
- mpm
- card_message
- order_details
- order_status
- review_and_pay
- payment_status
- payment_method

</td>
<td valign="top" width="33%">

**Navigation & Misc**
- address_message
- send_location
- track_order
- reorder
- cancel_order
- clear_chat
- navigateToScreen
- flow_action

</td>
</tr>
</table>

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

### Carousel

> Each card must be built with `Button(...).toCard()` first — a carousel card is really just a button card with an image/video header.

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
| `ButtonV2.js` | `ButtonV2` | A lighter-weight variant limited to simple quick-reply buttons — reach for this when you don't need the full native-flow surface of `Button`. |
| `ButtonV3.js` | `ButtonV3` | Built around `loadFrom(msg)` — loads an existing `templateMessage` (e.g. one you fetched or that was quoted) so you can edit it in place instead of building one from scratch. |
| `Carousel.js` | `Carousel` | Chains `Button(...).toCard()` results into a swipeable card carousel. Capped at `Carousel.MAX_CARDS` (10) since WhatsApp silently truncates anything beyond that. |
| `Poll.js` | `Poll` | Poll/vote message builder — question, options, single/multi-select, hidden-voter mode, correct-answer marking, expiry. |
| `AIRich.js` | `AIRich` (+ aliases `ORich`, `AIJap`, `LeafRich`, `JapAI`, `JapRich`, `RichJap`) | The rich AI-assistant-style response builder described above — headings, formatted text, tables, media/product/post cards, task/progress cards, tip banners, quick-reply suggestions. |
| `A2UI.js` | `A2UI`, `sendA2UIWidget` | Lower-level A2UI/Bloks widget builder. Builds the flat `components` tree (Column/Row → `children`, Card/Button → `child`, Modal → `trigger`/`content`) that Bloks widgets expect and sends it through the same `getBizBinaryNode()` path as `Button`/`ButtonV2`, so the wire-level node always matches the button names actually sent. |
| `JapBaileys.js` | `JapBaileys` | A unified builder **hub** — one object that wraps all the builders above behind short method names (`.button()`, `.buttonV2()`, `.buttonV3()`, `.carousel()`, `.poll()`, `.airich()`, `.a2ui()`), plus PascalCase aliases (`.Button()`, `.Carousel()`, `.Poll()`, `.AIRich()`, `.A2UI()`) for developers who prefer that naming style. Nothing new is implemented here — it's purely a single entry point over the individual classes. |
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
  by any public library (re-verified Sep 2026 against upstream Baileys, whatsmeow, and
  every active fork). Until it is, this repo ships an honest *workaround* —
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
- **`mediaKeyDomain` — IMPLEMENTED.** Backported from rc14 onto all 5 media types
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

`npm test` runs the offline suite (`tests/`, 347 tests, no network needed).

---

## 📞 Voice & Video Calls

Experimental audio-call support via a bundled WASM call stack + WebRTC relay. Requires the optional `@roamhq/wrtc` peer dependency.

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

**Refreshing the WASM stack** — if calls break after a WA Web update, re-fetch the official VoIP build from your own browser (Chrome with `--remote-debugging-port=9222` + web.whatsapp.com open):

```bash
npm run voip:fetch-wasm
```

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
| `stickerpack` | Build and send sticker packs (including animated/Lottie) |
| `templates` | Legacy WhatsApp Business template message helpers |
| `vcard` | Build vCard (contact card) payloads |
| `status` | Post and manage WhatsApp Status updates |
| `event-buffer` | Buffers/coalesces high-volume socket events for heavier bots |
| `doctor` | `checkEnvironment()` / `printEnvironmentReport()` — one-call environment diagnostics |

Every module above ships a matching `.d.ts`, so your editor will show full hover-docs regardless of which ones you import.

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

## 📝 v2.1.0 Patch Notes

> Summary — full details in [CHANGELOG.md](./CHANGELOG.md).

- **Built-in QR, zero dependencies**: vendored [qrcodegen](https://github.com/nayuki/QR-Code-generator) (Nayuki, MIT) + our own renderer — `renderQRToTerminal` (half-block `▀▄█`, half the height of classic renderers), `qrToSVG`, `qrToPNG` (hand-rolled PNG encoder on top of Node's zlib), `qrToMatrix`, `formatPairingCode`. Round-trip verified against an independent decoder (jsQR) in CI.
- **`printQRInTerminal` works again** — not a deprecation warning: the QR is drawn automatically in the terminal on every `connection.update`.
- **Fixed the VoIP `VoipStatsTracker is not a constructor` spam**: the Metro shim in `worker-bootstrap.js` shifted `module`/`exports` by one position (5th argument `null`). Fixed for both FB Comet bundle export conventions (flag-66 → arg 6, flag-98 → arg 7, 124/204 modules) + an `?.exports` fallback in the loader. Verified the real worker boots all the way to `worker_ready` with no shim errors.
- **Auto WA-version in the `Bot` framework**: every `start()`/reconnect resolves a fresh version via `fetchBestWaVersion()` (WA's sw.js → forks → fallback), preventing 405 pairing failures caused by stale versions. Opt-out: `versionCheck: false` or pin `socketConfig.version`.
- **Genuinely full `.d.ts`**: every shipped `.js` has a matching declaration file, enforced by a parity test + a `tsc --strict` harness in CI.
- **CI + release automation**: GitHub Actions (tests on Node 20/22, type-check, pack sanity) and a provenance-attested publish workflow triggered by `v*` tags.

---

## 📝 V6 Patch Notes

- Fixed a `package.json` typo: the version field was mistakenly left at `1.0.1` instead of `2.0.1` after the V5 release — corrected to `2.0.1` so the published package version matches the intended release.
- Expanded README documentation, especially around `lib/Builders/`:
  - Added the new [📁 Builders Folder Map](#-builders-folder-map-libbuilders) section — a per-file breakdown of everything under `lib/Builders/` (`shared.js`, `Button.js`, `ButtonV2.js`, `ButtonV3.js`, `Carousel.js`, `Poll.js`, `AIRich.js`, `A2UI.js`, `JapBaileys.js`, `index.js`), what each file exports, and what it's for — previously `A2UI` and `JapBaileys` in particular had no usage documentation at all.
  - Added a usage example for the `JapBaileys` unified builder hub.
- Redesigned `postinstall-banner.js`: cleaner box layout with a divider separating the title block from a small info section (Node version + docs link), a 256-color palette instead of basic ANSI colors, and a plain-text fallback when stdout isn't a TTY or `NO_COLOR` is set (CI logs, piped output) instead of forcing a box that may render misaligned.

---

## 📝 V5 Patch Notes

- Added [Username Management](#-username-management): `checkUsername`, `checkUsernameMulti`, `setUsername`, `deleteUsername`, `getMyUsername`, `setUsernamePin`, `findUserByUsername`, `fetchContactUsernames`, `getUsernameRecommendations`, layered onto the existing `USyncUsernameProtocol` support.
- Added the [Bot Framework](#-bot-framework) (`Bot`, `Context`, `SessionManager`, `StatsManager`, `MediaManager`, `SQLiteStore`). Adapted on the way in:
  - `SQLiteStore`/`StatsManager` construction moved behind an async `.create()` factory so `better-sqlite3` stays a lazily-loaded optional peer dep instead of a hard top-level import that would crash the Framework module for anyone without it installed.
  - `MediaManager`'s sticker/voice-note conversion now reuses this fork's existing lazy `fluent-ffmpeg` loader (see `Utils/MessageBuilder.js`) instead of adding `ffmpeg-static` + a second ffmpeg dependency; sticker EXIF metadata is written by the built-in pure-JS muxer (`sticker-exif`) — no extra package needed.
  - `Bot`'s default logger now falls back to this fork's own pino instance instead of a silent no-op stub.
- No `.d.ts` files were written for the new Framework module yet — see the note in that section.
- Bumped to `1.0.1`.

---

## 📝 V4 Patch Notes

- Kept the existing J.AP custom MessageBuilder classes and AIRich implementation intact.
- Added `whatsapp-rust-bridge@0.5.5` as a runtime dependency. The library already dynamically imports this module for LT Hash/app-state and crypto helpers; declaring it prevents accidental missing-module fallbacks in normal installations.
- Existing guarded fallbacks for platforms where the native bridge cannot load remain in place.
- ESM-only package metadata is preserved; no CommonJS build is included.


---

<div align="center">

Made with 🍃 by **JAP**

Thanks for visiting, bye 👋

<a href="#top">⬆️ Back to top</a>

</div>
