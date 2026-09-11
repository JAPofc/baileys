# Changelog

All notable changes to `@japofc/baileys` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Central ffmpeg resolver with auto-detection** (`lib/Utils/ffmpeg-path.js`) — every ffmpeg consumer (video thumbnails in `extractVideoThumb`, sticker/voice-note conversion in `MediaManager` and the message builders, VoIP `AudioFeeder`) now resolves the binary through one resolver: explicit `setFfmpegPath()` / `FFMPEG_PATH` env var → `ffmpeg-static` (if installed) → `@ffmpeg-installer/ffmpeg` (if installed) → system `PATH`. `ffmpeg-static` and `@ffmpeg-installer/ffmpeg` are now **optional** peer dependencies: `npm i ffmpeg-static` is all you need on desktop/server platforms — zero config, nothing bundled by default (package size unchanged). When nothing is found, features fail with a per-platform install hint (Termux-aware: `pkg install ffmpeg`) instead of `spawn ffmpeg ENOENT`. New exports: `setFfmpegPath`, `resolveFfmpegPath`, `requireFfmpegPath`, `ffmpegInstallHint`; new suite `tests/ffmpeg-path.test.js`. Verified end-to-end: voice-note conversion produces valid Ogg/Opus using the auto-detected `ffmpeg-static` binary on a machine with no system ffmpeg.
- **`createDebugMonitor(sock)`** — structured, safe observability snapshots via `getDebugInfo()`: connection state + last disconnect reason, socket uptime, message latency percentiles (p50/p90/p99), send-retry statistics, Signal error tallies (noSession/badMac/missingKeys/preKeyErrors), VoIP + WASM state, and process memory. Privacy is enforced, not promised: QR payloads are counted but never stored, and the entire snapshot passes through `redactSecrets()` before returning — QR, pairing codes, auth keys, tokens and private keys can never appear in it. Fully typed (`DebugInfo`, `DebugMonitor`).
- **Message regression test suite** (`tests/message-regression.test.js`) — the protocol-drift-prone shapes, each through a real protobuf encode→decode round-trip: buttons, native flows (quick_reply/single_select), carousel cards (media headers + invalid-header rejection), poll/quiz (V3/base/V5 routing + messageSecret), event, location/contact (vcard byte-identical), reaction (add+remove), edit/delete protocolMessages, quoted messages (incl. cross-type), ephemeral contextInfo.expiration and disappearing-mode EPHEMERAL_SETTING.
- **Store consistency, reconnect lifecycle, Signal recovery and debug-info test suites** (`tests/store-consistency.test.js`, `tests/reconnect-lifecycle.test.js`, `tests/signal-recovery.test.js`, `tests/debug-info.test.js`).

### Fixed
- **In-memory store consistency** — every event handler resolved the message bucket with a different jid (raw vs `remoteJidAlt` vs normalized), so receipts, reactions, deletes and status updates could silently miss messages stored under device-suffixed or LID-alt keys (all reproduced). One canonical resolver is now used everywhere. Also fixed: `contacts.update` aborting the whole batch on the first unknown contact **and** never actually merging update fields (self-assign no-op); `bind()` called twice duplicating every listener; missing `groups.upsert` binding leaving `groupMetadata` empty for event-driven consumers.
- **Reconnect lifecycle hardening** — `autoReconnect`: a server answering `restartRequired` on every connect caused a tight spin loop (repro: 165 sockets in 200ms) — only the *first* consecutive `restartRequired` reconnects immediately now, repeats back off; a throwing socket factory (e.g. `makeWASocketAuto` version fetch while offline) permanently killed the chain — now retried with backoff under `maxAttempts`; `start()` called twice ran two parallel reconnect chains — now idempotent; replaced sockets are `end()`ed so no half-open ws lingers; `loggedOut`/`timedOut`/network-loss behaviour regression-locked.
- **Signal session recovery** — the Signal error code carried by retry receipts (`<error code="7"/>`) was parsed nowhere (`parseRetryErrorCode`/`isMacError` were dead code): peers reporting Bad MAC / InvalidMessage (session provably out of sync) waited for `retryCount > 1` **plus** an hour-long throttle before the session was rebuilt. MAC errors now force immediate session recreation, even on the first retry.
- **Single-contact messages dropped `displayName`** — `sendMessage(jid, { contacts: { displayName, contacts: [{ vcard }] } })` sent a nameless `ContactMessage` when there was exactly one contact (the outer `displayName` was ignored).

- **auto-reconnect race condition** — a socket emitting `close` twice scheduled two parallel reconnect chains, and a late `close`/`open` from an already-replaced socket spawned ghost sockets / corrupted the backoff counter. Handlers now ignore stale sockets and de-duplicate `close` per socket. Regression-locked in `tests/reconnect-stress.test.js`.
- **VoIP call recovery** — the media watchdog retried rekey+offer forever on a dead relay with no signal to the caller. Recovery now has a bounded per-call budget (`watchdogMaxRecoveries`, default 3): `call-degraded` events carry `{ attempt, maxRecoveries }`, exhausting the budget emits `call-unrecoverable` and force-ends the call (reason `"unrecoverable"`) so upper layers can redial; a healthy relay resets the budget. `recoverCall()` now throws when no engine is connected instead of silently reporting a fake success.

### Changed
- **README limitations updated (no false claims)** — "Group message history sharing": WhatsApp shipped the official feature (last 25–100 messages, E2EE) in Feb 2026, but its wire format still has no public capture (re-verified Sep 2026); `shareGroupHistory()` is explicitly documented as a DM-forwarding *workaround*, not the native flow. "Music messages": documented as experimental with unverified official-client interop — `sendMusic()` emits a correct proto but real catalog IDs/artwork flow have no public capture.

### Added (earlier in this cycle)
- **WhatsApp integration test suite** (`tests/integration.test.js`) — pairing-code flow (random Crockford + custom 8-char codes), binary-node wire codec round-trips, message pipeline → protobuf wire, multi-file auth-state persistence, connection lifecycle.
- **VoIP end-to-end coverage** (`tests/voip-e2e.test.js`) — full outbound `call()` pipeline on injected fakes (LID resolve → device discovery → sessions → tctoken → `startCall`), watchdog recovery-budget behaviour, `recoverCall` guard rails.
- **Reconnect race regression + stress tests** (`tests/reconnect-stress.test.js`) — double-close, stale-close, stale-open, 50 rapid crash cycles, `maxAttempts`, `stop()` during backoff.
- **Release verification workflow** (`.github/workflows/release-verification.yml`) — runs after every successful npm publish (or on demand): confirms the version is live, `npm audit signatures` (provenance), clean install into a blank project, runtime smoke of the published tarball, and `tsc --strict` against the published `.d.ts`.

## [2.2.0] - 2026-09-11

### Added
- **`makeWASocketAuto()`** — async root-level factory that resolves the freshest WA Web version via `fetchBestWaVersion()` before connecting (pinned `version` arrays pass through untouched). `makeWASocket({ version: 'auto' })` now throws a helpful error pointing at the async factory instead of failing the handshake later.
- **`autoReconnect(factory, options)`** — drop-in supervision for direct socket users (the Framework `Bot` already had this): exponential backoff with jitter, never reconnects on `loggedOut` (fires `onLoggedOut` for cleanup), immediate reconnect on `restartRequired`, `stop()` cancels cleanly. New example: `examples/auto-reconnect-bot.js`.
- **API docs site** — typedoc generated from the package's full `.d.ts` surface, deployed to GitHub Pages on every push (`.github/workflows/docs.yml`): https://japofc.github.io/baileys/
- **WA version watchdog** — weekly scheduled workflow compares live `web.whatsapp.com` `client_revision` against the hardcoded fallback and files/updates a tracking issue on drift (`.github/workflows/version-watchdog.yml`).
- **Examples guarded in CI** — `tests/examples-lint.test.js` fails the build if any example stops parsing or imports a name the package root no longer exports.
- `SECURITY.md` + GitHub issue templates (bug/feature/private-vulnerability contact links).

### Changed
- **jimp is now lazy-loaded** in `media-messages.js` (profile-picture helpers): ~200ms faster startup and ~11MB less heap for every bot that never changes profile pictures, and fixes the `ESModulesLinkingError` browser-bundler false alarm caused by jimp 1.6.x's empty browser stub. First profile-picture call pays the load once per process; repeat calls hit the module cache.
- WA Web fallback version bumped `1046350168` → `1047296119` (live revision at release time; runtime users were already auto-resolving).
- Quick Start now leads with `makeWASocketAuto` + an `autoReconnect` production tip.
- devDependencies: `typescript` pinned to 6.0.x (typedoc compatibility); `typedoc` added.

## [2.1.0] - 2026-09-11

### Added
- **Built-in QR rendering, zero dependencies.** Vendored Project Nayuki's `qrcodegen` (MIT) plus renderers exported from the package root: `renderQRToTerminal` (ANSI half-blocks `▀▄█`, half the height of classic renderers; `small: false` and `inverted` options), `qrToSVG`, `qrToPNG` (hand-rolled grayscale PNG encoder on Node's zlib), `qrToMatrix` (raw `boolean[][]`), and `formatPairingCode` (`"ABCDEFGH"` → `"ABCD-EFGH"`). Encode output is round-trip verified in CI with an independent decoder (jsQR, dev-only).
- **`printQRInTerminal` works again.** The upstream-deprecated option now draws pairing QRs in the terminal automatically on `connection.update` instead of logging a deprecation warning.
- **Automatic WA Web version resolution in the Framework.** `Bot.start()` (and every auto-reconnect) now resolves the freshest client version through `fetchBestWaVersion()` — WA's own `sw.js` → baileys fork → hardcoded fallback — preventing stale-version pairing rejections (upstream #2370/#2485). Opt out with `versionCheck: false` or by pinning `socketConfig.version`. The resolution logic is exported as the pure function `resolveSocketVersionConfig()`.
- **CI + release automation.** GitHub Actions workflow running the full test suite, `tsc --strict` public-API type-check (`npm run test:types`), and pack sanity on Node 20/22; tag-triggered npm publish workflow with provenance attestation.
- `CHANGELOG.md` (this file).

### Fixed
- **VoIP worker spam `VoipStatsTracker is not a constructor`.** The Metro module shim in `worker-bootstrap.js` passed `null` as the 5th factory argument, shifting `module`/`exports` one slot for every Haste module; exports landed on the module wrapper and `__r` returned `{}`. The shim now passes the exports object at both positions 6 and 7 (the shipped FB Comet bundle uses two conventions: flag-66 factories write to arg 6, flag-98 factories — 124 of 204 modules — to arg 7), and `resolveLoaderModule` gained an `?.exports` fallback for the UMD loader tail. Verified against the real shipped bundle: the worker now boots to `worker_ready` with zero shim errors.

### Changed
- **Full TypeScript declarations.** Every shipped `.js` file has a matching `.d.ts` (Builders, Framework, VoIP, `Socket/username`, remaining Utils); misnamed `*_d.ts` strays renamed/merged; 118 dangling `sourceMappingURL` comments stripped. Guarded by a parity test and a strict consumer harness so the claim can't silently rot.
- README Quick Start no longer tells users to install `qrcode-terminal`.

## [2.0.1] - earlier

Initial public state of this fork: username/@username messaging support and scope-bug fix (every `makeWASocket()` threw), WAProto upgrade with regression tests, VoIP wasm engine + `VoipClient`/`ActiveCall`, Bot Framework (middleware routing, command dispatcher, reconnect with exponential backoff, SQLite store/stats), message builders (Button/Poll/Carousel/AIRich/A2UI), 2026 WA features (@all, editable polls, group history share, event reminders), security utilities, and the smoke/regression test suite.
