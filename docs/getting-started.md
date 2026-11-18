# Install, auth & stores

[← back to the README](../README.md)

## 📦 Installation

```bash
npm install @japofc/baileys
```

Directly from GitHub:

```bash
npm install github:JAPofc/baileys
```

> Requires **Node.js 20+** — enforced at import time with a clear error (no install scripts: this package deliberately ships **zero** `preinstall`/`postinstall` hooks, so `npm ci --ignore-scripts` and strict supply-chain policies work out of the box).

> **Coming from `@whiskeysockets/baileys`?** Migration is usually a one-line import change — see [MIGRATION.md](../MIGRATION.md).

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

Full runnable version: [`examples/auto-reconnect-bot.js`](../examples/auto-reconnect-bot.js).

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
