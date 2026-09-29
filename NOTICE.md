# NOTICE

`@japofc/baileys` is published under the MIT license. This file lists the
attribution that must stay attached to code shipped in this package.

No entry below implies endorsement by the named party.

---

## Primary project

- **J.AP (JAPofc)** — author and maintainer of this project. Everything above
  the upstream Baileys base and the vendored QR generator is original J.AP work.
  This is the bulk of what ships in the package — the fork's own layer spans:

  - **Message builders** (`lib/Builders/`) — the **AIRich** rich/interactive
    message builder (headings, tables, checklists, key-values, progress bars,
    Markdown import/export), **Button / ButtonV2 / ButtonV3**, **Carousel**,
    **A2UI**, **Poll**, and the shared builder core.
  - **Interactive button runtime** — the button helper + sender engine
    (`lib/Utils/button-helper-utils.js`, `lib/Utils/button-sender.js`):
    detection tables, node builder, validation (`classifyButton`, `assertValid`,
    `parseParams`), and quick-button helpers.
  - **VoIP stack** (`lib/VoIP/`) — the WhatsApp-call adapter: WASM engine,
    worker bootstrap, signaling, relay transport, call recorder, and audio
    feeder.
  - **Bot framework** (`lib/Framework/`) — `Bot`, `Context`, `MediaManager`,
    `SessionManager`, `StatsManager`, and the SQLite store.
  - **Username socket layer** (`lib/Socket/username.js`) and the socket-level
    fixes/features across `lib/Socket/` (LID↔PN helpers, TC-token lifecycle,
    reporting tokens, member labels, and more).
  - **170+ utility modules** (`lib/Utils/`) — including the session-health
    monitor, poll manager, message de-duplication guard, protocol-capture
    toolkit, trackers, anti-spam/moderation guards, games, economy/leveling,
    scheduling, and the full text/time/jid/array/emoji helper toolkits.
  - **Release & version hygiene** — the WA-Web version watchdog and freshness
    tooling, the docs (EN + ID), and the test suite.

  In short: the socket fixes and utilities, the builders, the button runtime,
  the VoIP stack, the framework, and every other feature in `lib/` are J.AP's.

## Upstream base

- **[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)** —
  the Baileys base this project builds on: socket core, auth-state contract,
  Signal integration, protobuf surface, binary-node handling, and event model.

## Vendored component

- **Nayuki — [QR-Code-generator](https://github.com/nayuki/QR-Code-generator)** —
  the QR generator used by `lib/Utils/qrcodegen.js` and the built-in
  terminal/SVG/PNG QR renderers.

---

The VoIP WASM artifacts under `lib/assets/wasm/` (`whatsapp.wasm`,
`worker-modules.js`, `loader.js`) are WhatsApp Web's own published bootloader
resources, fetched at build time by `scripts/fetch-wasm-resources.mjs`; they
are not authored by this project and carry no third-party attribution.

If an attribution is inaccurate, open an issue or PR so it can be corrected.
