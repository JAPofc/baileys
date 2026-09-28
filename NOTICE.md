# NOTICE

`@japofc/baileys` is published under the MIT license. This file is intentionally short and lists attribution that must stay attached to code shipped in this package.

No entry below means endorsement by the original author.

---

## Primary project

- **JAPofc (J.AP)** — maintainer of this fork and author of the JAPofc-specific fixes, utilities, release hygiene, docs, protocol-capture helpers, and original utility rewrites in this repository.
- **[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)** — upstream Baileys base: socket core, auth-state contract, Signal integration, protobuf surface, binary node handling, and event model.

## Vendored component

- **Nayuki, [QR-Code-generator](https://github.com/nayuki/QR-Code-generator)** — QR generator used by `lib/Utils/qrcodegen.js` and the built-in terminal/SVG/PNG QR renderers.

---

## Additional incorporated MIT components

These entries are retained because code from these sources is still present in the package. Do not remove them unless the corresponding code is removed or rewritten from scratch.

- **`@blurose/baileys` / `arslan-baileys`** — base implementation and backported fields for `lib/Builders/` message builders.
- **QueenAnya / `@queenanya/baileys`** and **`@ryuu-reinzz/button-helper`** — button helper and button-sender runtime layer in `lib/Utils/button-helper-utils.js` and `lib/Utils/button-sender.js`.
- **QueenAnya / `@queenanya/baileys`** and **`@innovatorssoft/baileys`** — username-management code in `lib/Socket/username.js`.
- **LuferOS / WhiskeySockets PR #2710**, later adapted by QueenAnya and JAPofc — bot framework components in `lib/Framework/`.
- **ourin-baileys lineage** — VoIP/ORich compatibility work in `lib/VoIP/`, `lib/assets/wasm/`, and related adapters.

---

If an attribution is inaccurate, open an issue or PR so it can be corrected.
