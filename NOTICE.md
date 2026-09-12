# NOTICE

`@japofc/baileys` is MIT-licensed (see the `license` field in `package.json`).
It is a fork of, and incorporates ported code from, other MIT-licensed
WhatsApp libraries. This file lists each third-party component, its original
author/source, and where it lives in this package — so credit stays attached
to the actual code, not just a generic "thanks" in the README.

MIT only requires the original copyright notice to travel with the code; it
does not imply the original authors endorse this fork. Every component below
was MIT-licensed at its source at the time it was ported.

---

## Upstream base

- **[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)** (MIT) —
  the original WhatsApp Web library this entire tree descends from. Socket
  core, Signal integration, protobuf definitions, auth-state contract, and
  event model all originate there.

## This fork's own work

Everything marked `JAP@Add` / `JAP@Fix` / `JAP@Perf` / `JAP@Port` /
`JAP@Merge` in the source is authored and maintained by **JAPofc (J.AP)** for
this fork, including (non-exhaustive): the store-consistency, reconnect-
lifecycle and Signal-recovery fix passes, `makeWASocketAuto` / `autoReconnect`
/ `createDebugMonitor`, the ffmpeg resolver, the environment doctor + CLI,
the zero-dependency QR renderer integration, the security pack, the test
suites, the full `.d.ts` surface, and the **MessageBuilder v4.7 additions**
(`setResponseId`/`setBotResponseId`/`hasId`/`getIds`/`peek`/`delete` in
`lib/Builders/AIRich.js`).

## Ported components

### Message builders (Button / Carousel / AIRich / Toolkit) — base implementation
- **Source:** `@blurose/baileys` 1.1.13 (base, feature-complete), with
  performance defaults and message-authenticity fields backported from
  `arslan-baileys` 1.1.0.
- **Location:** `lib/Builders/` (`shared.js`, `Button.js`, `Carousel.js`,
  `AIRich.js`, …) and the compatibility re-exports in
  `lib/Utils/MessageBuilder.js`.

### Button/list addon-kind resolution logic
- **Source:** vinikjkkj, [zapo](https://github.com/vinikjkkj/zapo) (MIT) —
  `src/message/encode/content.ts`.
- **Location:** `lib/Utils/message-kind.js` (`resolveButtonAddonKind`). Also
  referenced (design only, no code) for migration tracking in
  `lib/Utils/use-sqlite-auth-state.js`.

### Button helper / button-sender runtime layer
- **Source:** QueenAnya, [`@queenanya/baileys`](https://github.com/QueenAnya/Bail)
  (MIT) — `src/addons/message-utils.ts` and `src/addons/button-sender.ts`,
  which that fork's own headers credit onward to
  **`@ryuu-reinzz/button-helper` v2.2.5** as the original implementation.
- **Location:** `lib/Utils/button-helper-utils.js`, `lib/Utils/button-sender.js`.

### Username management (check/set/pin/recommend/find)
- **Source:** QueenAnya, `@queenanya/baileys` `lib/Socket/username.js` (MIT),
  itself ported from `@innovatorssoft/baileys`.
- **Location:** `lib/Socket/username.js`.

### Chat-control utilities (typing indicator + presence helpers)
- **Source:** `@innovatorssoft/baileys` `chat-control.js` (direct).
- **Location:** `lib/Utils/chat-control.js` (and its `.d.ts`).

### Utils addons batch
- **Source:** QueenAnya's `Bail` repository, `src/addons/*.ts` (MIT).
  Converted TS → ESM JS; behavior unchanged unless noted in file headers.
- **Location:** `lib/Utils/` — `vcard.js`, `scheduling.js`,
  `message-search.js`, `auto-reply.js`, `stickerpack.js`, `anti-delete.js`,
  `chat-history-helpers.js`, `media-messages.js`, `media-set.js`,
  `status.js`, `templates.js`, `baileys-event-stream.js`,
  `past-participants.js`, `use-cache-manager-auth-state.js` (that last file
  itself credits `@innovatorssoft/baileys`).

### Bot Framework (Bot / Context / SessionManager / StatsManager / MediaManager / SQLiteStore)
- **Source:** originally submitted as WhiskeySockets/Baileys PR #2710 by
  **LuferOS**; bugfix pass and TypeScript rewrite by QueenAnya in
  `@queenanya/baileys` `lib/Framework/` (MIT). Further adapted for this fork
  (lazy `better-sqlite3`/`fluent-ffmpeg` loading, ffmpeg auto-detection) —
  see the `JAP@Port`/`JAP@Fix` headers in each file.
- **Location:** `lib/Framework/`.

### VoIP stack, AutoFollow, ORich compatibility
- **Source:** ourin-baileys (9.0.11 lineage for the VoIP stack).
- **Location:** `lib/VoIP/` + `lib/assets/wasm/` (audio-call WASM stack +
  WebRTC relay), `lib/Socket/newsletter.js` (AutoFollow), and the `ORich`
  compatibility alias of `AIRich`.

### QR code generation
- **Source:** Nayuki, [QR-Code-generator](https://github.com/nayuki/QR-Code-generator)
  (MIT) — vendored `qrcodegen`.
- **Location:** `lib/Utils/qrcodegen.js` and the QR renderers built on it.

---

## Referenced for verification only (no code incorporated)

Some bug-fix comments cite other implementations to confirm expected wire
behavior without copying code: `zqdevelopers/zq_baileys_helper`,
`@chatunity/baileys`, `@neoxr/wb`, and WhiskeySockets/Baileys issue/PR
threads. Listed for transparency only — not attribution-bearing ports.

---

If a source or attribution above is inaccurate or a component was missed,
please open an issue at the repository linked in `package.json` so it can be
corrected — misattribution here is a mistake to fix, not a dispute to argue.
