# Changelog

All notable changes to `@japofc/baileys` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

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
