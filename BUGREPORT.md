# Code Review & Bug-Check Report — `@japofc/baileys`

**Repo:** github.com/JAPofc/baileys · **Reviewed at commit:** `21bb421` (Initial commit)
**Date:** 2026-09-29 · **Reviewer:** @japaudit

---

## 1. Summary

I cloned the repo, installed dependencies, and audited every file/folder in
`lib/`, `WAProto/`, `examples/`, `scripts/`, and `tests/` using the full test
suite, TypeScript type-checking, per-file syntax parsing, a dependency audit,
and manual review. I also reviewed authorship across the codebase: the fork's
own helper modules are original implementations authored for this project, and
`NOTICE.md` credits the upstream base (Baileys) and the vendored QR generator
(Nayuki).

| Check | Before | After |
|---|---|---|
| Unit/integration tests (`node --test`) | **667 pass / 1 fail** (668) | **1513 pass / 0 fail** |
| TypeScript type check (`tsc`) | clean | clean |
| Syntax parse (`node --check`, all `.js`/`.mjs`) | all OK | all OK |
| `npm audit` | 0 vulnerabilities | 0 vulnerabilities |
| Main entry import + subpath imports | OK | OK |
| CLI (`node lib/cli.js --help`) | OK | OK |
| Attribution (`NOTICE.md`) | reviewed | Baileys + Nayuki credited; fork code original |

---

## 2. Bugs found & fixed

### 2.1 [HIGH] Version metadata was inconsistent across the repo *(FIXED)*
The declared version disagreed in four places, which broke a release test:

| Location | Was | Now |
|---|---|---|
| `package.json` `version` | `2.4.4` | `2.4.5` |
| `package-lock.json` root version (x2) | `2.5.0` | `2.4.5` |
| `README.md` banner | `v2.4.4` | `v2.4.5` |
| `README.md` example `.addKeyValue` | `2.5.0` | `2.4.5` |
| `README.id.md` banner | `v2.5.0` | `v2.4.5` |
| `README.id.md` example `.addKeyValue` | `2.5.0` | `2.4.5` |
| `tests/community4-events.test.js` assertion | expected `2.5.0` | expects `2.4.5` |

- **Failing test:** `tests/community4-events.test.js › "version bumped to 2.5.0 and barrel exports the round"` asserted `pkg.version === '2.5.0'` while `package.json` shipped `2.4.4`.
- **Fix:** standardized everything to **`2.4.5`** (the value you asked to publish), updated the test name + assertion, and added a `2.4.5` entry to `CHANGELOG.md`.
- **Result:** the whole suite is now green (698/698, after later feature rounds).

### 2.2 No other functional bugs surfaced
- **No `await` inside `.forEach()`** (a common silent async bug) anywhere in `lib/`.
- **No syntax errors** in any shipped file.
- **No type errors** under the project's own `tsc` config.
- **No dependency vulnerabilities** (`npm audit` → 0).

### 2.3 [LOW] `getBinaryNodeChildInt` "missing vs unparseable" ambiguity *(caught in review & fixed before ship)*
While adding the new core node-reader helpers (§6), the first cut of
`getBinaryNodeChildInt` returned the caller's numeric `fallback` for **both** a
missing child/attr and a present-but-non-numeric value, so a caller could not
tell "the field isn't there" from "the field is there but garbage". A dedicated
test (`tests/v245-core-node-helpers.test.js`) surfaced it. Fixed so **absent →
`undefined`** and **present-but-unparseable → `fallback`**, matching the
documented contract. No shipped code depended on the old behaviour.

### 2.4 Duplicate-file / dead-file sweep — clean
- `md5` sweep of every `lib/**/*.js`: the only hash collisions are **type-only
  modules** (`lib/Types/Auth.js` = `export {};`, `lib/Types/Events.js` = a bare
  `import { proto }`), which are the normal, expected output of compiling
  TypeScript declaration files to JS. **No real source duplication.**
- Every `.js` has its paired `.d.ts`; **no orphan or empty source files.**

### 2.5 [HIGH] `encodeBinaryNode` desynced the wire on a non-string attribute *(FIXED)*
`lib/WABinary/encode.js` computed the node's list-size header from **every**
non-null attribute (`2 * validAttributes.length + 1 + …`), but the writer loop
below only emits attributes whose value is a **string** (the `typeof === 'string'`
guard). A single stray non-string attribute value (e.g. a number or boolean
slipping through) therefore inflated the header by 2 while writing nothing — so
the decoder read the following **content** bytes as the missing attribute pair
and threw `invalid string with tag: …`, corrupting the entire node.

- **Reproduction (before fix):** `encodeBinaryNode({ tag:'iq', attrs:{ id:'abc', count: 5, to:'s.whatsapp.net' }, content:[{tag:'ping'}] })` → decoding the result throws `invalid string with tag: 248`.
- **Fix:** count only the attributes actually written (string-valued), so header and body stay in lockstep. A non-string attr is now cleanly dropped (matching the writer's long-standing intent) instead of corrupting the stream; use `normalizeBinaryNodeAttrs`/`binaryNode` to stringify values you want preserved.
- **Regression lock:** `tests/v246-wabinary-codec.test.js` (12 round-trip cases, incl. the exact repro).

### 2.6 [HIGH] AIRich tables never rendered — primitive `__typename` mis-spelled `GenATableUXPrimitive` *(FIXED)*
The Meta-AI rich table primitive was emitted as **`GenATableUXPrimitive`** —
missing the `I` in the `GenAI` prefix that *every other* primitive in the
codebase uses. Because the same wrong spelling appeared in both builders
(`lib/Builders/AIRich.js` `addTable`, `lib/Utils/rich-message-utils.js`) **and**
in the reader's `switch` (`lib/Utils/rich-reader.js`), our own build→read
round-trip tests passed — masking the defect — while **WhatsApp silently
refused to render the table**, since the real client primitive is
`GenAITableUXPrimitive`.

- **Reproduction (before fix):** `new AIRich(client).addTable([['H1','H2'],['a','b']]).build({})` produced a section whose `view_model.primitive.__typename === 'GenATableUXPrimitive'`; WhatsApp dropped the table from the bubble.
- **Fix:** all three sites now emit/parse `GenAITableUXPrimitive`. The reader additionally keeps a fallthrough `case 'GenATableUXPrimitive'` so any payloads persisted under the old name still parse (no data loss).
- **Corroboration:** verified against upstream naming (all sibling primitives are `GenAI*`) and independently documented by other Baileys forks fixing the identical `GenATable → GenAITable` typo.
- **Regression lock:** `tests/v246-airich-stacks.test.js` (asserts the correct typename on build and a parsed table block on read).

### 2.7 [HIGH] Persistent "Bad MAC" on LID↔PN session mismatch — decrypt never retried the paired identity *(FIXED)*
`decryptMessageNode` (`lib/Utils/decode-wa-message.js`) chose a single identity
form (LID or phone-number JID) per stanza and, on a decrypt failure, went
straight to a `CIPHERTEXT` stub. When a device's Signal session was established
under one form but a later stanza addressed the **same device** under the other
form, libsignal threw a **persistent `Bad MAC`** ("Failed to decrypt message
with any known session") that a QR rescan or session reset did not fix — most
reproducible on an account's own multi-device self-sync traffic, and a well-known
source of log-flood/heap-exhaustion in the field.

- **Root cause:** WhatsApp already tells us the pairing on the stanza itself
  (`sender_pn`/`sender_lid` for 1:1, `participant_pn`/`participant_lid` for
  groups), and we even parsed it into `senderAlt` — but the decrypt path never
  fell back to it. A working session for that exact device existed under the
  other address; the lookup just never reached it.
- **Fix:** on a `pkmsg`/`msg` decrypt failure, compute the alternate address via
  the new pure helper `getAlternateDecryptionJid(stanza, triedJid, author)`
  (device carried over with `transferDevice`) and retry **once** against it. The
  retry is **scoped** to `pkmsg`/`msg` (so duplicate/old-counter/corrupt-ciphertext
  failures don't cause a wasteful second attempt), and when both attempts fail the
  **original** error is preserved (not the alt-form's less-useful "no session").
- **Provenance:** ported from WhiskeySockets/Baileys#2763, incorporating the
  cubic reviewer's P2 feedback (scope the retry + keep the original diagnostic).
- **Regression lock:** `tests/v246-decrypt-altid-retry.test.js` (9 cases: pure
  helper for PN/LID/group/no-alt/same-identity, plus integration for retry-success,
  double-fail-original-error-preserved, no-alt-single-attempt, and no-retry-on-success).

### 2.8 [HIGH] Group sender-key never rotated on membership change — stale key after member leaves / switches phones *(FIXED)*
When a group member left, was removed, or switched phones, `handleGroupNotification`
(`lib/Socket/messages-recv.js`) updated the message stub and emitted `groups.upsert`
but **never invalidated the stored group sender-key distribution memory**
(`sender-key-memory[group]`). Because the outbound path only sends a Sender Key
Distribution Message (SKDM) to devices *not already* in that memory, the bot kept
reusing the same group sender key indefinitely.

- **Impact A — forward secrecy:** a removed/departed member still holds the current
  sender key and can decrypt every message the bot sends to the group afterwards.
- **Impact B — delivery (#2704):** after a member switches phones the new device is
  never sent the sender key, so that member's group messages stay stuck at
  "Waiting for this message"; related report #2730 (linked device can't decrypt
  inbound group `skmsg`).
- **Root cause:** membership changes must trigger *lazy* sender-key rotation (the
  sender notes the change and rotates on the next send — cf. the IACR formal
  analysis of WhatsApp group messaging, eprint 2025/794, and `WA.RemoveMember`).
  Our fork skipped that invalidation entirely.
- **Fix:** on `remove`/`leave` (rotation for forward secrecy) and `modify`/number
  change (re-distribution) we now `authState.keys.set({ 'sender-key-memory': { [group]: null } })`,
  so the next send generates a fresh sender key and distributes it to exactly the
  current devices. Decision isolated in the pure helper `resolveGroupSenderKeyReset(action)`;
  `add`/`promote`/`demote` intentionally do not reset (a new device is picked up by
  the normal send path, and role changes don't affect membership).
- **Provenance:** WhiskeySockets/Baileys#2704 / #2730.
- **Regression lock:** `tests/v246-group-senderkey-reset.test.js` (5 cases).

### 2.9 [AUDIT] Upstream mutex / event-buffer memory leaks — verified NOT present in this fork
Audited the reported upstream leaks (WhiskeySockets/Baileys#2137 mutex redesign,
#2151 `makeMutex` leak, #2160 event-buffer leak). Findings:
- `makeMutex` delegates to the `async-mutex` library (the redesigned implementation).
- `makeKeyedMutex` reclaims each key in a `finally` once its ref-count hits zero;
  a new `size` accessor makes this verifiable and returns to 0 when all locks release.
- The event buffer replaces its `data` object on every flush and bounds `historyCache`
  at 10 000 entries; all timers are cleared on flush/cleanup (`flushPendingTimeout`
  was already added as a JAP@Fix for exactly this).
- The socket's `inFlightPreKeyLow` set is cleaned in a `finally`; `tcTokenKnownJids`
  mirrors persisted state (inherently bounded), not an in-memory-only accumulator.

No code change required beyond additive observability. Regression-locked by
`tests/v246-memory-safety.test.js` (5 cases) so the guarantees can't silently rot.

### 2.10 [MEDIUM] Text-only carousel cards impossible + latent Object.assign crash *(FIXED)*
`generateWAMessageContent` (`lib/Utils/messages.js`) rejected every carousel card
whose media header didn't resolve, with `Invalid media type for carousel card`.
WhatsApp actually renders text-only carousel cards, so this blocked a valid
message shape.

- **Root cause:** the builder threw whenever `hasValidCarouselHeader` was false,
  regardless of whether the card carried its own text/buttons. Separately, the
  no-`text` branch ran `Object.assign(carouselCard.header, carouselHeader)` even
  when `header` was never built — a latent `Object.assign(undefined, …)` crash for
  media-without-caption and (newly-allowed) button-only cards.
- **Fix:** the pure helper `assessCarouselCard(card, isValidHeader)` now allows
  text/caption/button-only cards, keeps the strict media error for cards that
  *intended* media (`image`/`video`/`product`) but failed to resolve, and rejects
  only genuinely empty cards. The header merge no longer assumes a header exists.
- **Deliberately NOT adopted:** bumping `messageVersion` (1→3),
  `flow_message_version` (3→4) or `carouselCardType` (UNKNOWN→HSCROLL_CARDS).
  These magic numbers are unverified against Meta and rot over time; changing them
  is a rendering *risk*, not a correctness fix, so per our "verify before changing"
  policy we left them at the working upstream values.
- **Regression lock:** `tests/v246-carousel-textonly.test.js` (7 cases) + updated
  `tests/message-regression.test.js` carousel suite.

### 2.11 [AUDIT] Supply-chain safety — malicious-fork behaviors verified ABSENT
A 2026 campaign published malicious Baileys forks that abuse the paired session
(safedep.io: `@neykoor/baileys`, `mamz-baileys`, `lupy4u`, `@cikikomo/baileys`,
`@prototypevip/baileys`, `@diezyyasha/libsignal-node`). We audited this fork against
every documented behavior and confirmed **none are present**:

| Malicious behavior (from the report) | This fork |
| --- | --- |
| Forced newsletter/channel follow on `connection.open` | ❌ absent — `newsletterFollow` is only a user-called method; not wired to any lifecycle event |
| Remote-controlled follow list fetched from GitHub (`autoJoinChannels`) | ❌ absent |
| Hardcoded attacker channel JIDs | ❌ none in `lib/` |
| `sourceUrl` ad-URL injected into every image/video preview | ❌ absent |
| `noSelfSync: true` to hide forged attribution from the owner's devices | ❌ absent (flag not used anywhere) |
| `preinstall`/`postinstall`/`install` scripts | ❌ none — zero install scripts |

The only outbound `raw.githubusercontent.com` references are opt-in refreshers
(`refreshUsernameQueryIds`, WA-version resolution) that point at **our own** repo
(`JAPofc/baileys`), not an attacker-controlled remote list. No code change required;
recorded here for supply-chain transparency.

### 2.12 [HIGH] VoIP PCM helpers crashed on an odd-byteOffset buffer *(FIXED)*
Every PCM helper in `lib/Utils/voip-tools.js` coerced its input to samples via a
zero-copy `new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength/2))`.
`Int16Array` requires a **2-byte-aligned** `byteOffset`, so any buffer whose view
started on an odd byte threw `RangeError: start offset of Int16Array should be a
multiple of 2` before doing any work.

- **Trigger (common in real call audio):** `buf.subarray(oddIndex)` — e.g. a PCM
  frame sliced out of a larger capture, or an RTP payload landing on an odd
  offset — and Node's pooled small `Buffer`s, which can also start on an odd
  offset. Reproduced deterministically with a `Buffer.subarray(1, …)` view.
- **Blast radius:** the v2.4.5 audio-math batch (`rmsLevel`, `peakLevelPcm`,
  `isSilentPcm`, `applyGainPcm`, `mixPcm`, `downmixStereoToMono`) via the private
  `asInt16`, **and** the v2.4.6 codec/conversion batch (`encodeMulaw`,
  `encodeAlaw`, `pcmToFloat32`, `concatPcm`, `slicePcmMs`) via `toInt16Array` —
  all crashed intermittently depending on how the caller obtained the buffer.
- **Fix:** both coercers now check `byteOffset % 2`. Aligned input keeps the exact
  zero-copy fast path (**byte-identical** behaviour); a misaligned view is copied
  into a fresh, offset-0 buffer (`new Uint8Array(n).buffer` is always aligned)
  before the `Int16Array` view. The odd trailing byte is dropped as before. No
  API change; this only rescues inputs that previously threw.
- **Verification:** an odd-offset frame now returns results identical to the
  aligned frame across every helper (RMS, peak, gain, mix, downmix, μ-law/A-law
  encode, float32, concat, slice).
- **Regression lock:** `tests/v246-voip-pcm-alignment.test.js` (5 cases: odd-offset
  parity for scalar readers, buffer transforms and the G.711/conversion helpers,
  plus an odd-offset+odd-length view and a μ-law round-trip).

### 2.13 [MEDIUM] `level-system` XP cooldown lost on save/reload — XP farmable after a restart *(FIXED)*
`createLevelSystem` (`lib/Utils/level-system.js`) throttles XP to once per
`cooldownMs` per user through a `lastXpAt` timestamp (`if (now - entry.lastXpAt <
cooldownMs) continue`). But `toJSON()` didn't serialize `lastXpAt` and `load()`
hard-reset it to `0`.

- **Impact:** a save + reload (any bot restart, or a periodic persist/restore)
  wiped every user's cooldown, so the next message granted XP immediately even if
  the user had *just* earned XP a second earlier — re-opening XP farming across
  restarts. Identical class to the already-fixed economy `lastWorkAt` (§ v2.4.5)
  and reputation `cooldowns` persistence bugs.
- **Fix:** `toJSON()` now emits `lastXpAt` and `load()` restores it (`e.lastXpAt
  || 0`). xp/messages/prestige/chats round-trips are unchanged.
- **Regression lock:** `tests/v246-utils-upgrades.test.js` — a reload followed by
  an immediate message must NOT grant XP (cooldown held) while still counting the
  message; plus an xp/level round-trip.

### 2.14 [LOW] `compactNumber` printed `1000K` / `1000M` on a rounding carry *(FIXED)*
`compactNumber` (`lib/Utils/number-format.js`) divided by the first unit the value
met and `toFixed`-rounded the result — but rounding can carry into the next unit
(`999_999 / 1e3 = 999.999` → `toFixed(1) = '1000.0'`), so it printed `1000K`
instead of `1M` (and `999_999_999` → `1000M` instead of `1B`).

- **Fix:** after rounding, if the value reaches `1000` and a larger unit exists,
  promote to it. All values that already formatted correctly are byte-identical.
- **Regression lock:** `tests/v246-utils-upgrades.test.js` (carry cases +
  a suite of previously-correct values held unchanged).

### 2.15 [AUDIT/UPGRADE] VoIP WASM bundle re-verified against live + browser-free refresh path
The bundled VoIP WASM resources were re-checked against WhatsApp Web's live CDN
and the fetch tooling was hardened.

- **Verification:** `whatsapp.wasm`, `worker-modules.js` and `loader.js` are all
  **byte-for-byte identical** to what `static.whatsapp.net` currently serves at
  the pinned URLs (sha256 + size match every pin). `integrity.json` now carries a
  `verifiedAgainstLiveAt` timestamp; the WASM binary is current, so nothing was
  swapped.
- **Tooling upgrade:** WhatsApp's bootloader endpoint moves over time (the base
  path currently 404s), which could leave `npm run voip:fetch-wasm` unable to
  refresh. Added a **`pinned`** mode (`npm run voip:verify-wasm`,
  `CALL_WASM_FETCH_MODE=pinned`) that re-downloads and re-verifies from the URLs
  already recorded in `integrity.json` — browser-free and bootloader-independent —
  wired in as an automatic fallback before the Chrome-debugger path. The pure
  verifier `verifyPinnedManifest(manifest, downloads)` (sha256 + size, tamper /
  size / missing detection) is exported and `main()` is guarded so the helpers are
  importable.
- **Regression lock:** `tests/v246-wasm-integrity.test.js` (5 cases, incl. a live
  check of the bundled files against `integrity.json`).

### 2.16 [HIGH] `Button.validate()` false-rejected every valid `open_webview` button *(FIXED)*
The pre-flight validator in `lib/Builders/Button.js` shared one `switch` branch for
`cta_url` and `open_webview` and checked a top-level `params.url`. But the two
buttons have **different param shapes**: `cta_url` = `{display_text, url, merchant_url}`,
while `open_webview` = `{title, link:{url, in_app_webview}}` (exactly what the
shipped `addOpenWebview` helper emits, and what `button-sender`'s `REQUIRED_PARAMS`
already declares as `['title','link']`).

- **Impact:** `validate()` reported a bogus `"missing url"` for **every**
  correctly-built `open_webview` button, and `assertValid()` (the chainable
  pre-send guard) would **throw** on it — so a caller who validated before sending
  could never send a webview button. The button itself was well-formed; only the
  validator was wrong.
- **Fix:** split the branch — `open_webview` now validates `params.link?.url`
  (reports `"missing link.url"` only when genuinely absent, still URL-checks it);
  `cta_url` keeps its top-level `params.url` check unchanged.
- **Verification:** confirmed the shape against this fork's own `addOpenWebview`
  (`{title, link:{url}}`) and `button-sender`'s `open_webview` params
  (`['title','link']` + `link.url` required) — the validator was the lone outlier.
- **Regression lock:** `tests/v246-r32-webview-airich.test.js` — a built
  `addOpenWebview` validates clean; a raw `open_webview` missing `link.url` is
  reported.

### 2.17 [MEDIUM] AIRich card CTAs shipped a non-canonical `action_type` to the wire *(FIXED)*
`AIRich.addCompact`/`addProfileCard` (`action_type`) and `addFooterAction`
(`cta_type`) forwarded the caller's raw string with only a `?? 'OPEN_URL'` default.
WhatsApp's unified-response renderer matches the action value **exactly** — it
expects `OPEN_URL`, not `open_url` / `openUrl` / `url` / `link`.

- **Impact:** a caller passing a lowercase or aliased action (a very natural
  mistake, since the *field* is snake_case) produced a card whose CTA silently did
  nothing on tap — no error, just a dead target.
- **Fix:** new exported `normalizeRichActionType(value)` canonicalises the common
  open-a-link aliases (`open_url`/`openUrl`/`url`/`link`/`open_link`, any
  case/spacing) to `OPEN_URL`, and otherwise trims + upper-cases the value through
  unchanged so unknown/other actions are preserved. Applied at all three call
  sites. No-op for already-correct `OPEN_URL` input.
- **Scope note:** deliberately conservative — only genuine open-a-link synonyms are
  remapped; anything else is passed through (just normalised), so a future action
  type is never swallowed.
- **Regression lock:** `tests/v246-r32-webview-airich.test.js` — alias table →
  `OPEN_URL`, unknown actions preserved, and `addCompact`/`addFooterAction`
  emitting canonical values.

### 2.18 [LOW] `randomStatusFont` returned an out-of-range font id on `random()===1.0` *(FIXED)*
`randomStatusFont({ random })` (`lib/Utils/status-tools.js`) returned
`Math.floor(random() * 9)`. For the built-in `Math.random` (range `[0, 1)`) that's
`0–8`, but an **injected** `random()` that can return exactly `1.0` (a seeded/
deterministic generator, common in tests and reproducible content pipelines)
produced `9` — not a valid WhatsApp status font id (`0–8`).

- **Impact:** a status built with a boundary random value could carry font id `9`,
  which WhatsApp does not recognise (silent style fallback). Same latent class the
  fork already guarded against elsewhere.
- **Fix:** clamp to `8` (`Math.min(8, Math.floor(random() * 9))`), matching the
  documented `random()===1.0` guards in `array-tools` `sample` and `emoji-tools`
  `randomEmoji`. Byte-identical for the default `Math.random` and every value in
  `[0, 1)`; only the `1.0` boundary changes (`9 → 8`).
- **Regression lock:** `tests/status-and-newsletter-tools.test.js` — asserts
  `randomStatusFont({ random: () => 1 }) === 8` alongside the existing `0`/`0.99`
  cases.

### 2.19 [HIGH] `MessageScheduler` double-sent (multi-sent) a scheduled message *(FIXED)*
`MessageScheduler.processQueue()` (`lib/Utils/scheduling.js`) is invoked by
`setInterval(this.processQueue, checkInterval)`. `setInterval` does **not** await
the async callback, so a new run starts every `checkInterval` regardless of
whether the previous one is still in flight. A due item's `status` stays
`'pending'` until its `await this.sendMessage(...)` resolves, so any send slower
than `checkInterval` (the default is 1 s — every real network send qualifies)
let overlapping runs re-scan the queue, find the same item still `'pending'`, and
send it again.

- **Impact:** duplicate (often many) deliveries of a single scheduled message.
  Reproduced deterministically: a 250 ms send with `checkInterval: 50` delivered
  **one** scheduled message **5 times**. Worse the slower the send / shorter the
  interval.
- **Fix:** a re-entrancy guard (`this.processing`) makes an overlapping
  `processQueue()` call return immediately, and each due item is flipped to an
  in-flight `'sending'` status **before** the `await` so it can't be re-selected
  even within a run. The guard is released in a `finally`. Repeating schedules
  (which reset themselves to `'pending'`) and non-overlapping schedules are
  unaffected.
- **Regression lock:** `tests/v246-scheduling-reentrancy.test.js` — a slow send
  under a short interval delivers exactly once, and the guard resets so later
  schedules still fire.

---

### 2.20 [MEDIUM] `anti-link` guard missed bare `www.` links glued to punctuation — a moderation bypass *(FIXED)*
`extractLinks` / `createAntiLinkGuard` (`lib/Utils/anti-link.js`) detect links
with `URL_RE`, whose bare-domain branch was `(?:^|\s)(?:www\.)…` — it only
matched a `www.` link that was preceded by whitespace or the start of the
string. Any `www.` domain fused to preceding punctuation therefore slipped
straight past the guard.

- **Impact:** in non-invite mode, common spam shapes evade anti-link entirely —
  `cek(www.judi88.com)`, `link:www.slot.com`, `→www.judol.net` all returned
  **no links** and were never flagged/deleted. Reproduced deterministically
  (each returned `[]` pre-fix).
- **Fix:** replace the whitespace-anchored alternative with a negative
  lookbehind — `(?<![\w@.-])www\.[^\s…]+`. Bare-domain links after punctuation
  are now caught, while `www.` fused to a preceding word char / `@` / `.` / `-`
  (mid-token or an email host like `user@www.host.com`, or `xwww.foo.com`) is
  still correctly ignored, so no new false positives. The `http(s)://` branch is
  unchanged.
- **Regression lock:** `tests/v246-antilink-runtime.test.js` — punctuation-glued
  links are detected, whitespace/start links still work, and fused-token / email
  hosts stay clear.

---

### 2.21 [MEDIUM] `invite-tracker` double-credited a duplicate/replayed group-add — inflated `active` + double invite rewards *(FIXED)*
`createInviteTracker` (`lib/Utils/invite-tracker.js`) credits every
`group-participants.update` `add` to its `author`. It incremented `total` **and**
`active` (and fired `onInvite`) for every add event unconditionally — but
WhatsApp re-emits `group-participants.update`, and history / app-state sync
replays past events, so a single real membership frequently arrives more than
once.

- **Impact:** a duplicate `add` for a still-present member fired `onInvite`
  again — in the documented usage that pays an **invite reward** (the example
  grants 500 coins per invite), so duplicates = double payouts — and pushed
  `active` past `1` for one membership, an impossible value that also skewed the
  leaderboard. Reproduced deterministically: two identical `add` events for one
  member gave `onInvite ×2` and `{ total: 2, active: 2 }`.
- **Fix:** an add for a member already tracked as present (`byMember.has(member)`)
  is now a no-op — no re-credit, no event. A genuine re-add **after a leave** is
  unaffected, because `remove` deletes the `byMember` entry, so the member is no
  longer present and is credited again (verified: re-add after leave →
  `{ total: 2, active: 1 }`). This also blocks re-attributing an already-present
  member to a different inviter.
- **Regression lock:** `tests/v246-invite-tracker.test.js` — duplicate-add no-op,
  re-add-after-leave still credits, no cross-inviter re-attribution.

---

### 2.22 [MEDIUM] `shop.load()` dropped `maxPerUser` + `category` — per-user purchase cap silently disabled after a reload *(FIXED)*
`createShop(...).load(snapshot)` (`lib/Utils/shop.js`) rebuilt each catalog item
by destructuring `{ id, name, price, description, stock, consumable, ...meta }`
— so **`maxPerUser` and `category` fell into the `...meta` bucket** instead of
being restored at the top level, where `buy()` and `renderCatalog()` read them.
`toJSON()` persisted both fields correctly; only the reload path lost them.

- **Impact:** after any save/reload (i.e. every bot restart), `item.maxPerUser`
  read back as `undefined`, so the per-user ownership cap check
  (`owned + qty > item.maxPerUser`) was always false — users could buy past the
  limit (e.g. stack a `maxPerUser: 1` VIP badge). `item.category` also became
  `undefined`, so `renderCatalog({ category })` filtered everything out
  ("kosong"). Reproduced deterministically: a `maxPerUser: 1` item bought twice
  after a JSON round-trip; category listing empty.
- **Fix:** `load()` now destructures `maxPerUser` and `category` explicitly and
  restores them at the top level. A null/undefined `maxPerUser` (old snapshots,
  or `Infinity` after a JSON round-trip) becomes `Infinity` ("no cap"), matching
  how `stock` already uses `null` for `Infinity`; `category` defaults to `''`.
- **Regression lock:** `tests/v246-shop-persistence.test.js` — cap + category
  survive a reload, cap re-enforces, no-cap items stay `Infinity`.

---

### 2.23 [MEDIUM] `attendance` streaks reset on every restart — the advertised multi-day streak was non-functional *(FIXED)*
`createAttendance` (`lib/Utils/attendance.js`) tracks consecutive-day check-in
streaks in an in-memory `streaks` map, and its docs advertise the feature. But
unlike every sibling manager (economy, level-system, reputation, birthday,
tiers, reminders, invite-tracker — all of which persist), it exposed **no
`toJSON`/`load`**, so there was no way to keep that state across a process
restart.

- **Impact:** these bots typically restart daily, and each restart wiped the
  `streaks` map — so the next check-in always recomputed the streak from an empty
  map back to `1`. The streak could therefore never grow beyond 1 in practice,
  making the whole streak feature effectively non-functional. Reproduced
  deterministically with an injected clock: day 1 → streak 1; day 2 after a fresh
  instance (a restart) → streak **1** instead of 2.
- **Fix:** added `toJSON()` / `load()` (and a `clear()`) that round-trip the
  streak state **and** any in-progress session (title, checkins, timestamps). A
  restored session still rejects duplicate check-ins and continues numbering.
  Streak-break semantics are preserved: a >1-day gap after reload restarts at 1.
- **Regression lock:** `tests/v246-attendance-persistence.test.js` — streak
  continues across a restart (1→2→3), an open session round-trips, and a missed
  day resets the streak.

---

### 2.24 [LOW] `group-op-guard` under-reported `retryInMs` for multi-count ops — a caller that waited exactly that long stayed blocked *(FIXED)*
`createGroupOpGuard().check(op, count)` (`lib/Utils/group-op-guard.js`) returns a
`retryInMs` telling the caller how long until the operation fits under
WhatsApp's ceiling. When blocked, it computed that from **`list[0]`** — the
single oldest call — i.e. it only ever accounted for freeing **one** slot. For
`count > 1` (or an over-full history built up by raw `record()` calls), fitting
the request needs several of the oldest calls to age out, so the reported wait
was too short.

- **Impact:** a caller (or the manual `check`/`record` retry pattern) that slept
  for exactly the reported `retryInMs` woke to find the op **still** rate-limited.
  Reproduced deterministically: three adds at t=0/100/200 (max 3, window 1000),
  then `check('add', 2)` reported `800ms`, but after waiting it was still blocked
  (100ms short); correct value is `900ms`.
- **Fix:** wait for the `needed = list.length + count - max`-th oldest call to
  expire — `retryInMs = list[needed - 1] + windowMs - now`. `count === 1` at the
  limit is unchanged (`needed === 1` → `list[0]`), so no regression.
- **Regression lock:** `tests/v246-groupopguard.test.js` — multi-count retry is
  now sufficient, count=1 behaviour preserved.

---

### 2.25 [LOW] `fancy-text` `script` style mixed bold and non-bold glyphs — 11 letters rendered at the wrong weight *(FIXED)*
`styleText(text, 'script')` (`lib/Utils/fancy-text.js`) uses the **bold**-script
alphabet (base U+1D4D0), whose Unicode block is complete and needs no special
cases. But a leftover `SPECIALS.script` table injected the **non-bold**
Letterlike glyphs — ℬ (U+212C), ℰ (U+2130), ℱ, ℋ, ℐ, ℒ, ℳ, ℛ, ℯ, ℊ, ℴ — for
the letters B/E/F/H/I/L/M/R/e/g/o. Those glyphs come from the *plain* script
alphabet, so 11 letters rendered a visible weight lighter than the rest.

- **Impact:** cosmetic but obvious — `styleText('ABE','script')` produced a bold
  𝓐 immediately followed by a light ℬ/ℰ. Any word containing one of the 11
  affected letters (i.e. almost every word) looked broken. Reproduced:
  `styleText('ABE','script')` → A=U+1D4D0 (bold) but B=U+212C, E=U+2130 (non-bold).
- **Root cause:** `SPECIALS` entries are only needed for styles whose Unicode
  block has "holes" that borrow from the Letterlike Symbols block (fraktur,
  double-struck). The bold-script block has no holes, so its `SPECIALS` entry was
  not just unnecessary but actively wrong.
- **Fix:** deleted the `SPECIALS.script` entry outright; the offset formula
  already maps every bold-script letter contiguously (U+1D4D0.. upper, U+1D4EA..
  lower). `fraktur` / `doubleStruck` / `circled` specials are untouched.
- **Upgrade shipped alongside:** added `unstyleText(text)` — the inverse of
  `styleText`, mapping styled Unicode letters/digits back to plain ASCII for
  search / moderation / display-name normalization (small-caps → lowercase;
  `upsideDown` left as-is since it is order-reversed/lossy).
- **Regression lock:** `tests/v246-fancytext-script.test.js` — asserts the whole
  script alphabet is contiguous with no stray Letterlike glyphs, plus round-trip
  coverage for `unstyleText`. The pre-existing fancy-text test in
  `notes-games-i18n.test.js` was updated (it had enshrined the buggy code point).

---

### 2.26 [MEDIUM] `rental` — paying to extend a free trial left the rental labelled a trial forever (billing/reporting bug) *(FIXED)*
`createRentalManager().extend(chat, duration)` (`lib/Utils/rental.js`) is the
paid top-up / renewal path (as opposed to `startTrial`, the one-shot free
trial). It stacked the extra time correctly but **never cleared the `trial`
flag** on the entry.

- **Impact:** when a group on its free trial *paid* to continue (the bot calls
  `extend`), the rental stayed flagged `trial: true` indefinitely.
  `renderStatus()` kept rendering "🎁 Trial — Nd tersisa" to a paying customer,
  and every reporting surface that reads the flag — `getRental().trial`,
  `list()`, and the new `stats()` — under-counted real paid rentals and
  over-counted trials. Reproduced: `startTrial(g)` then `extend(g, { days: 30 })`
  → `getRental(g).trial === true` and status still shows "🎁 Trial".
- **Fix:** `extend()` now sets `entry.trial = false` (a top-up is a paid action)
  and, if a `by` payer is supplied in the duration object, records it. The
  time-stacking maths, the lifetime short-circuit (`extend` on a lifetime rental
  stays lifetime), and the "extend a chat with no rental → create one" fallback
  are all unchanged, so paid rentals and the existing tests are unaffected.
- **Shipped alongside (upgrade):** `stats()` (owner dashboard counts) and
  `transfer(from, to)` (migrate a paid rental to a re-created group's new jid,
  carrying the trial-burn marker).
- **Regression lock:** `tests/v247-rental.test.js` — trial→paid on extend, payer
  recorded, paid-extend still stacks and stays paid, lifetime extend unchanged,
  plus `stats()` and `transfer()` coverage. Reviewed by @japaudit.

### 2.27 [LOW] `Button.addOpenWebview()` omitted `link.in_app_webview` and let `options.link` clobber the URL *(FIXED)*
`Button.addOpenWebview(title, url, options)` used the correct `open_webview`
native-flow name, but emitted only `{ title, link:{ url } }`. Other shipped
webview paths (`nativeFlow` shorthand and mini-app `openWebview:true`) already
emitted the fuller observed shape `{ title, link:{ url, in_app_webview } }`.
Because `options` was spread after `link`, a caller passing `options.link` could
also replace the whole link object and silently drop `link.url`.

- **Impact:** button-builder webview cards could diverge from the rest of the
  webview stack and from the shape validators/tests documented. In the worst
  case, an innocent extra `link` option produced an `open_webview` button with
  no URL, which WhatsApp cannot open.
- **Fix:** `addOpenWebview()` now emits `link.in_app_webview` by default, honours
  `inAppWebview:false` / `in_app_webview:false`, merges extra `link` keys, and
  preserves `link.url` from the method argument unless the caller explicitly
  supplies another URL inside `options.link.url`.
- **Clarification:** `cta_url.webview_interaction` is still kept for backward
  compatibility, but it is only a compatibility flag on `cta_url`; the real
  native in-app webview button is `open_webview`.
- **Regression lock:** `tests/v247-builders-webview-rich.test.js` — asserts the
  `cta_url` compatibility flag still exists, and `addOpenWebview()` emits
  `link.url + link.in_app_webview` without clobbering extra link data. Reviewed
  by @japaudit.

### 2.28 [HIGH] Flow shortcut emitted `flow_action` as the button name instead of canonical `flow` *(FIXED)*
The `sendMessage({ nativeFlow:[{ flow }] })` converter in
`lib/Utils/messages.js` (and therefore mini-app Flow cards) emitted a native-flow
button named `flow_action`. But `flow_action` is the action **field inside** the
button params JSON (`navigate` / `data_exchange`), not the native-flow button
name that WhatsApp renders. `Button.addFlow()` had already been corrected to
`name:'flow'`, so the two public paths disagreed.

- **Impact:** code using the terse `nativeFlow` / `buildMiniAppContent({ flow })`
  path could build a message that looked structurally valid in local JS but used
  a non-renderable Flow button name. A bot author would see no local exception;
  the client/server side could simply ignore the button. The low-level
  `sendInteractiveMessage` validator also did not accept the canonical raw
  `name:'flow'` shape.
- **Fix:** the shorthand now emits `name:'flow'`, keeps the params fields
  (`flow_message_version`, `flow_id`, `flow_cta`, `flow_action`,
  `flow_action_payload`), mints a `flow_token` when omitted (matching
  `Button.addFlow()`), and accepts `{ flow:'FLOW_ID' }` as a small ergonomic
  shorthand. `button-sender` validation now accepts canonical raw `flow` buttons.
- **Regression lock:** `tests/mini-app.test.js` now expects `name:'flow'`, and
  `tests/v247-builders-webview-rich.test.js` covers auto-token Flow shorthand,
  string Flow IDs, and raw `flow` validation. Reviewed by @japaudit.

### 2.29 [MEDIUM] `Carousel` builder rejected valid text/button-only cards *(FIXED)*
The lower-level `sendMessage({ cards:[...] })` carousel path had already been
fixed to allow text-only and button-only cards (WhatsApp renders them), but the
chainable `lib/Builders/Carousel.js` builder still required every added card to
carry `card.header.hasMediaAttachment === true`.

- **Impact:** a valid prebuilt card such as
  `await new Button(sock).setBody('Hi').addReply('Open','open').toCard()` has
  `header.hasMediaAttachment:false` plus body/buttons. `Carousel.addCard(card)`
  threw `Card [0] must include an image or video in header`, so developers using
  the builder API could not send the same text/button-only carousel cards that
  the direct sendMessage API already supported.
- **Fix:** `Carousel.assessCard()` now accepts cards that have media, text, or
  native-flow buttons and rejects only truly empty cards. `addCard()` uses that
  rule; `build()` now stamps the same carousel metadata as the direct path
  (`messageVersion:1`, `carouselCardType:UNKNOWN`); and `send()` delegates its
  additional node to the shared `getBizBinaryNode()` path. `getBizBinaryNode()`
  now recognizes `interactiveMessage.carouselMessage` as a mixed native-flow
  surface so carousel sends get the canonical biz/native_flow envelope.
- **Shipped alongside (upgrade):** `addTextCard()`, `addCards()`, `validate()` /
  `assertValid()`, `countCards()` / `getCards()` / `clearCards()`, and
  `setCarouselOptions()` for carousel metadata overrides. Rich one-liner helpers
  also gained JAP-branded names (`jap`, `japRich`, `createJapRich`,
  `buildJapRich`, `sendJapRich`) while retaining neutral aliases for
  compatibility.
- **Regression lock:** `tests/v247-carousel-japrich.test.js` covers text/button-only
  `Button.toCard()` cards, direct `addTextCard()` cards, empty-card rejection,
  introspection helpers, the canonical carousel biz node, and the JAP-branded
  rich aliases. Reviewed by @japaudit.

### 2.30 [MEDIUM] Legacy `ButtonV2`/`ButtonV3` could relay malformed buttons and drifted from the canonical biz node *(FIXED)*
`ButtonV2` and `ButtonV3` are direct-relay legacy builders (`buttonsMessage` and
`templateMessage`). They bypass `sock.sendMessage()`, so their own validation and
additional-node handling must match the canonical socket path.

- **Reproduction A (malformed/inert buttons):** `new ButtonV2(sock).addRawButton({})`
  produced a `buttonsMessage` with no `buttonId` / `buttonText.displayText`;
  `new ButtonV3(sock).addReply()` produced a hydrated quick reply with an empty
  label and empty id. Both could be sent because `send()` only checked
  `_buttons.length > 0`. WhatsApp clients typically drop or render these as inert
  actions, with no local exception for the bot author.
- **Reproduction B (wire-node drift):** `ButtonV2.send()` hand-rolled
  `{ tag:'biz', attrs:{}, content:[mixed native_flow] }`, missing the
  `actual_actors`, `host_storage`, `privacy_mode_ts`, and `quality_control`
  fields that `getBizBinaryNode()` attaches everywhere else. `ButtonV3.send()`
  relayed `templateMessage` with no canonical biz node unless the caller supplied
  one manually, despite `getBizBinaryNode()` treating `templateMessage` as an
  interactive surface.
- **Fix:** both builders now expose `validate()` / `assertValid()` and validate by
  default in `send()`. ButtonV2 enforces the legacy three-button cap and checks
  `buttonId` + `buttonText.displayText`. ButtonV3 shorthands reject missing
  labels/ids/urls/phone numbers, raw hydrated buttons are validated, URL buttons
  get URL syntax checking, and both builders relay with `getBizBinaryNode()`
  (ButtonV3 preserves caller-supplied `additionalNodes` after the canonical node).
- **Shipped alongside (upgrade):** `countButtons()` / `getButtons()` on both,
  `clearButtons()` on ButtonV2, `MAX_BUTTONS` constants, and typed validation
  result exports. `MESSAGE_BUILDER_VERSION` is now `4.10`.
- **Regression lock:** `tests/v247-legacy-buttons.test.js` covers malformed raw
  buttons, empty shorthand rejection, button caps, `build({ validate:true })`,
  loaded-template validation, and canonical biz-node relays. Reviewed by @japaudit.

### 2.31 [HIGH] Quiz polls were invisible to `getAggregateVotesInPollMessage()` — every quiz vote was silently discarded *(FIXED)*
`sendMessage({ poll })` routes a quiz poll (`pollType: 1`) to
`pollCreationMessageV5`, but the option lookup in
`getAggregateVotesInPollMessage()` only walked
`pollCreationMessage` → `V2` → `V3`.

- **Reproduction:** build any quiz poll
  (`new Poll(sock).setName('Q').addOptions(['x','y']).setQuiz('x')`), run it through
  `generateWAMessageContent()`, then call
  `getAggregateVotesInPollMessage({ message, pollUpdates })` → `[]`. With an empty
  option list the function's `voteHashMap` is empty too, so every incoming
  `pollUpdate` hashed to a bucket that did not exist and was dropped by the
  `continue` branch. Quiz results were permanently unreadable, with no error
  anywhere — the poll itself sent and rendered fine on the client.
- **Fix:** the lookup chain now also covers `pollCreationMessageV4` and
  `pollCreationMessageV5` (`lib/Utils/messages.js`). A quiz poll now yields one
  vote bucket per option, exactly like the V1/V3 shapes.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` asserts V5 emission, non-empty
  aggregation for quiz polls, and that the V1/V3 paths are unchanged. Reviewed by @japaudit.

---

### 2.32 [HIGH] `setQuiz()` + `setAnnouncementGroup()` silently dropped quiz mode *(FIXED)*
- **Reproduction:** `new Poll(sock).setName('Q').addOptions(['x','y']).setQuiz('x').setAnnouncementGroup().build()`
  produced `{ pollType: 1, correctAnswer: 'x', toAnnouncementGroup: true }`. In
  `generateWAMessageContent()` the `toAnnouncementGroup` branch wins and assigns
  `pollCreationMessageV2`, which carries **no** `correctAnswer` / `pollType` field —
  the wire message came out as an ordinary poll. The caller got no warning that
  the quiz had been discarded.
- **Fix:** `Poll.validate()` reports the combination and `build()` (via
  `assertValid()`) now refuses it with an explanatory error naming the V2
  limitation, instead of shipping a downgraded poll.
- **Regression lock:** covered in `tests/v247-poll-a2ui.test.js`, including that an
  announcement-group poll *without* a quiz still maps to V2. Reviewed by @japaudit.

---

### 2.33 [MEDIUM] `setEndDate()` accepted unparseable input and wired `endTime: NaN` *(FIXED)*
- **Reproduction:** `new Poll(sock).setEndDate('not-a-date')` stored
  `new Date('not-a-date')` (Invalid Date). `generateWAMessageContent()` then ran
  `message.poll.endDate.getTime()` → `NaN` and put `endTime: NaN` on the poll
  message. No validation fired on either side.
- **Fix:** `setEndDate()` parses eagerly and throws a `TypeError` naming the
  offending input when the result is an Invalid Date; `validate()` carries a
  matching check for state set around the setter.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` checks garbage strings and
  `new Date('nope')` throw, and that `Date` / ISO string / epoch-ms inputs all reach
  the wire as the same finite number. Reviewed by @japaudit.

---

### 2.34 [MEDIUM] Duplicate poll options merged into one result bucket *(FIXED)*
- **Reproduction:** `new Poll(sock).setName('Q').addOptions(['x','x','y'])` was accepted
  and sent three options. Because `getAggregateVotesInPollMessage()` keys results by
  `sha256(optionName)`, the two `'x'` entries collapsed into a single bucket: a
  3-option poll reported **2** results, and votes cast on the second `'x'` were
  attributed to the first. Silent data corruption in the tally.
- **Fix:** `addOption()` rejects a duplicate with an error explaining the hashing
  constraint; `setOptions()` validates the whole array atomically (and rolls back on
  failure); `validate()` re-checks uniqueness. Option/name length limits
  (`MAX_OPTION_LENGTH` 100, `MAX_NAME_LENGTH` 255) and the 12-option WhatsApp cap
  (`MAX_OPTIONS`) are enforced at the same time.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` asserts the rejection and that
  option count always equals bucket count. Reviewed by @japaudit.

---

### 2.35 [MEDIUM] A2UI auto-generated ids collided with caller-supplied ids *(FIXED)*
- **Reproduction:** `ui.text('a', { id: 'text_0' }); ui.text('b');` threw
  `Component id "text_0" already used`. `#nextId()` was a bare counter
  (`${prefix}_${counter++}`) that never checked the registry, so any caller id
  matching the generated pattern poisoned the next auto-id and broke an otherwise
  valid widget.
- **Fix:** `#nextId()` now loops until it finds an id that is neither registered nor
  the reserved `root`.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` covers the collision case, the
  reserved-`root` guard, and confirms a genuinely duplicated explicit id is still
  rejected. Reviewed by @japaudit.

---

### 2.36 [MEDIUM] `A2UI.listCard()` shadowed the component tree and ignored `build()` options *(FIXED)*
- **Reproduction A (silent drop):** calling `root([...])` / component factories *and*
  `listCard()` on the same instance made `build()` return the list-card payload from
  its early-return branch and throw the entire registered component tree away without
  a word.
- **Reproduction B (ignored option):** that same early return handed back the frozen
  `_listCardPayload`, so `build({ type: 'custom' })` — and therefore
  `sendA2UIWidget(client, jid, { type: 'custom' })` — silently shipped the hardcoded
  `im_a2ui` for list cards while honouring `type` for every other widget.
- **Fix:** `listCard()` throws when components/root are already present (pointing the
  caller at a separate instance), and the list-card branch of `build()` now applies the
  requested `type`.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` covers both reproductions plus the
  standalone list-card payload shape. Reviewed by @japaudit.

---

### 2.37 [HIGH] `A2UI.d.ts` typed every component factory as `this` although they return id strings *(FIXED)*
The imperative A2UI API is deliberately id-returning: siblings reference each other by
id (`column([a, b])`, `modal(trigger, content)`). The shipped types said otherwise.

- **Reproduction A (valid code rejected):** the documented pattern
  `const id: string = ui.text('hi'); ui.root([id]);` failed to compile with
  `Type 'A2UI' is not assignable to type 'string'`.
- **Reproduction B (broken code accepted):** `ui.text('a').text('b')` type-checked
  cleanly against the `: this` signatures and then threw
  `TypeError: ui.text(...).text is not a function` at runtime. The class docblock
  reinforced the error by describing the builder as "fluent — all widget methods
  return `this`".
- **Fix:** all 21 component factories (`text`, `image`, `video`, `checkbox`,
  `textField`, `button`, `card`, `modal`, `raw`, `column`, `row`, `divider`, `slider`,
  `switch`, `list`, `progressBar`, `avatar`, `badge`, `spacer`, `tabs`, `choicePicker`)
  are typed `string`; only the config/terminal methods (`root`, `listCard`,
  `setVersion`, `setCatalogId`, `clear`, `assertValid`) chain. The misleading docblock
  was replaced with an explanation of the id-returning contract.
- **Regression lock:** `tests/v247-poll-a2ui.test.js` asserts every factory returns a
  registered id string, that chaining throws, and that config methods still return the
  instance; `tests/tscheck/consumer.ts` exercises the corrected signatures under `tsc`.
  Reviewed by @japaudit.

### 2.38 [MEDIUM] Group metadata emitted `NaN` timestamps that persist as `null` *(FIXED)*
`extractGroupMetadata()` coerced four server attributes with the unary `+` operator —
`+group.attrs.s_t`, `+group.attrs.creation`, `+descChild.attrs.t`, and the `size`
fallback. WhatsApp omits those attributes on plenty of real payloads (freshly created
groups, `groupGetInviteInfo()` lookups, trimmed `participating` entries), and
`+undefined` is `NaN`.

- **Reproduction:** parse a `<group id subject>` node with no `s_t`/`creation` →
  `{ subjectTime: NaN, creation: NaN }`. `JSON.stringify` converts those to `null`, so
  anything persisting group metadata (store, SQLite/Redis adapters, cache dumps) stored
  `null`, and every `metadata.creation > someTimestamp` comparison silently evaluated
  `false` because all comparisons against `NaN` do.
- **Note:** `extractCommunityMetadata()` in `communities.js` already guarded the same
  fields with `Number(attr || 0)`, so the two extractors disagreed on identical payloads.
- **Fix:** added a `toIntOrUndefined(value, fallback)` helper used for `subjectTime`,
  `creation`, `descTime`, `size` (falls back to the participant count) and
  `ephemeralDuration`. Absent or unparseable values are now `undefined` and simply drop
  out of a JSON round-trip instead of becoming `null`.
- **Regression lock:** `tests/v247-groups-lid.test.js` covers the absent, present and
  unparseable cases plus the JSON round-trip. Reviewed by @japaudit.

---

### 2.39 [HIGH] `extractCommunityMetadata()` read `addressing_mode` as a child element, so it was always `undefined` *(FIXED)*
WhatsApp sends `addressing_mode` as an **attribute** on the `<group>`/`<community>` node.
`groups.js` reads `group.attrs.addressing_mode` correctly; `communities.js` instead called
`getBinaryNodeChildString(community, 'addressing_mode')`, which looks for a child
*element* of that name.

- **Reproduction:** feed the identical node to both extractors —
  `extractGroupMetadata(...)` → `addressingMode: 'lid'`, `extractCommunityMetadata(...)` →
  `addressingMode: undefined`. No community payload could ever populate the field.
- **Impact:** nothing could tell a LID-addressed community apart from a PN-addressed one;
  any `metadata.addressingMode === WAMessageAddressingMode.LID` branch was dead code, and
  the raw string was never mapped to the enum `groups.js` returns either.
- **Fix:** read the attribute first, map it through `WAMessageAddressingMode` exactly like
  `groups.js` (`'lid'` → `LID`, otherwise `PN`), and keep the old child-element lookup as a
  fallback so any payload that really does nest it still works.
- **Regression lock:** `tests/v247-groups-lid.test.js` asserts LID/PN/absent cases and that
  both extractors now agree on the same node. Reviewed by @japaudit.

---

### 2.40 [MEDIUM] Community `size` ignored the server's own `size` attribute *(FIXED)*
- **Reproduction:** `<community size="250">` carrying 2 inlined `<participant>` nodes
  (WhatsApp trims the participant list on large or partial responses) produced
  `size: 2`. `groups.js` already preferred `group.attrs.size` and only fell back to the
  node count, so the same payload reported 250 as a group and 2 as a community.
- **Fix:** the community extractor now prefers a finite `attrs.size` and falls back to the
  participant count, matching `groups.js`.
- **Regression lock:** `tests/v247-groups-lid.test.js` covers the attribute, the fallback,
  junk input, and cross-checks both extractors. Reviewed by @japaudit.

---

### 2.41 [HIGH] Group/community metadata threw away every LID↔PN pair it received *(FIXED)*
This closes the two long-standing `TODO`s in `groups.js` (`TODO: properly parse LID / PN
DATA` at the `participating` fetch, `TODO: Store LID MAPPINGS` in the participant parser).

- **Reproduction:** each `<participant>` node carries both addresses — a PN-addressed
  participant has `lid`, a LID-addressed one has `phone_number` — and the parser copied
  them onto `participants[].lid` / `.phoneNumber`, but **nothing ever wrote them to the
  signal LID mapping store**. `messages-recv.js`, `messages-send.js` and `chats.js` all
  call `signalRepository.lidMapping.storeLIDPNMappings()`; the group path never did.
- **Impact:** a single `groupMetadata()` call is the richest LID↔PN source the client ever
  sees (every member, both addresses, one round-trip), yet right after fetching it
  `getLIDForPN()` / `getPNForLID()` still returned `undefined` for those exact members, so
  the socket re-discovered the same pairs one at a time through USync queries during
  encryption.
- **Fix:** added the pure, exported `extractLIDPNPairs(metadata)` (device-suffix
  normalized via `jidNormalizedUser`, deduplicated, null-safe, ignores participants
  carrying only one address or mismatched address kinds), and wired it into
  `groupMetadata()`, `groupFetchAllParticipating()` and `communityMetadata()`. Mapping
  writes are wrapped in try/catch and logged — a mapping-store failure must never break a
  metadata fetch, since the caller asked for metadata.
- **Shipped alongside (upgrade):** `GROUP_PARTICIPANTS_CHUNK_SIZE` is exported and
  `groupRequestParticipantsUpdate()` is now chunked by it, matching the chunking
  `groupParticipantsUpdate()` already had (bug 46) — a large join-request backlog used to
  go out as one all-or-nothing stanza. Both helpers are re-exported from the package root
  and typed in `groups.d.ts`.
- **Regression lock:** `tests/v247-groups-lid.test.js` covers both participant
  orientations, device normalization, dedup, malformed input, community metadata, cached
  (JSON round-tripped) metadata, the socket wiring, and the failure-isolation guard.
  Reviewed by @japaudit.

### 2.42 [HIGH] `w:gp2` notifications paired one person's LID with another person's phone number *(FIXED)*
`handleGroupNotification()` resolved the participant a group action targets with two
**independent** fallbacks onto the participant who performed it:

```js
affectedParticipantLid = child.participant?.attrs?.jid          || actingParticipantLid
affectedParticipantPn  = child.participant?.attrs?.phone_number || actingParticipantPn
```

- **Reproduction:** a join-request notification carries `<notification participant="ADMIN@lid"
  participant_pn="62811ADMIN@s.whatsapp.net">` with a `<participant jid="REQUESTER@lid">`
  child and **no** `phone_number` attribute (the normal shape — the server addresses the
  requester by LID). The first fallback correctly yields the requester's LID; the second
  falls through to the admin's phone number. Result:
  `{ lid: 'REQUESTER@lid', pn: '62811ADMIN@s.whatsapp.net' }` — an identity belonging to
  nobody.
- **Impact:** that object is `JSON.stringify`-ed into `messageStubParameters[0]` for
  `created_membership_requests` / `revoked_membership_requests`, so bots that read it to
  greet, approve, log or store the requester acted on a fabricated pair — and the admin's
  number was attributed to a stranger. Feeding such a pair to the mapping store would
  corrupt addressing for both users (see §2.44).
- **Fix:** resolution moved to the pure, exported `resolveNotificationActors()` in
  `lib/Utils/group-notification.js`. The affected participant is now resolved as a **unit**:
  either both halves come from the `<participant>` child (a missing counterpart stays
  `undefined`, and mismatched address kinds are ignored), or — when there is no such child —
  the action targets the actor and both halves come from the actor (`affectedIsActor: true`).
- **Regression lock:** `tests/v247-group-notification-lid.test.js` covers LID-addressed and
  PN-addressed targets, both-halves-present, the actor-targets-themselves case, mismatched
  address kinds, and malformed input. Reviewed by @japaudit.

---

### 2.43 [HIGH] Group notifications discarded every LID↔PN pair they asserted *(FIXED)*
This closes the remaining `TODO: Store LID MAPPINGS`, `TODO: HANDLE PARTICIPANT_PN` and
`TODO: LIDMAPPING SUPPORT` markers in `messages-recv.js`.

- **Reproduction:** every `w:gp2` notification carries the actor's LID **and** phone number
  (`participant` + `participant_pn`), and add/remove/promote/demote actions list each
  affected participant with both addresses. None of it was ever written to the signal LID
  mapping store — the participant parser built the pair into `messageStubParameters` and
  threw the mapping away.
- **Impact:** a member joining a group is the exact moment the client first learns that
  person's address pair. Dropping it meant the socket rediscovered the same pair later
  through a USync round-trip during encryption — or failed to address them at all.
- **Fix:** added the pure `extractNotificationLIDPNPairs(fullNode, child)` (actor
  attributes + the affected participant + the action's participant list, all
  device-suffix normalized, deduplicated, and **only internally consistent pairs** — see
  §2.42), wired into `handleGroupNotification()` through
  `storeMappingsFromNotification()`. Writes are wrapped in try/catch and logged: a mapping
  failure must never break notification handling.
- **Deliberate exclusion:** `modify` (`GROUP_PARTICIPANT_CHANGE_NUMBER`) notifications are
  skipped entirely, because their `<participant>` nodes carry the member's **old** number —
  harvesting them would re-store the mapping the notification just declared stale.
- **Shipped alongside (upgrade):** `parseNotificationParticipants()` is exported too (the
  `messageStubParameters` participant shape, previously inline), and
  `LIDMappingStore.removeMapping(jid)` lets a bot invalidate a stale pair after a
  change-number notification.
- **Regression lock:** `tests/v247-group-notification-lid.test.js` covers actor harvesting,
  both participant orientations, device normalization, dedup, the change-number exclusion,
  the "never emit an inconsistent pair" property, malformed input, and the socket wiring +
  failure isolation. Reviewed by @japaudit.

---

### 2.44 [HIGH] `LIDMappingStore` stored a reversed pair backwards, silently losing the mapping *(FIXED)*
`storeLIDPNMappings()` validated a pair with
`(isLidUser(lid) && isPnUser(pn)) || (isPnUser(lid) && isLidUser(pn))` — i.e. it accepted
**either** orientation — and then trusted the field names blindly:

```js
validatedPairs.push({ pnUser: pnDecoded.user, lidUser: lidDecoded.user })
```

- **Reproduction:** `storeLIDPNMappings([{ lid: '628111222333@s.whatsapp.net', pn: '99887766@lid' }])`
  (the pair supplied the other way round) passes validation and writes
  `{ '99887766': '628111222333', '628111222333_reverse': '99887766' }` — the exact inverse
  of the correct rows. Afterwards **both** directions fail:
  `getLIDForPN('628111222333@s.whatsapp.net')` → `null` and
  `getPNForLID('99887766@lid')` → `null`. No warning is logged, because the pair was
  "valid".
- **Impact:** the intended mapping is lost *and* a bogus row keyed by the LID user is left
  in the database and cache, where it can shadow a later correct write. Callers build these
  objects by hand across `messages-recv.js`, `messages-send.js` and `chats.js` with no
  address-kind assertion on the `lid` side, so the orientation is only ever as good as the
  call site.
- **Fix:** the orientation is now derived from the actual address kinds — a reversed pair is
  swapped into place (and logged at debug level) rather than stored inverted, while
  genuinely invalid pairs (two PNs, two LIDs, a group JID) still hit the existing
  `Invalid LID-PN mapping` warning and are skipped.
- **Regression lock:** `tests/v247-group-notification-lid.test.js` asserts that a reversed
  insert produces byte-identical rows to a correct one, that both lookups resolve
  afterwards, that no row keyed by the LID user is created, and that invalid pairs are
  still rejected. Reviewed by @japaudit.

---

### 2.45 [HIGH] A `NaN` ttl froze the media upload handshake in a permanent "still fresh" state *(FIXED)*
`refreshMediaConn()` cached the `media_conn` handshake and re-fetched it with:

```js
const media = await mediaConn
if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
```

while the record itself was built with `ttl: +mediaConnNode.attrs.ttl`.

- **Reproduction:** `scripts/r-repro.mjs` fed three `<media_conn>` nodes through the exact
  parse + expiry expressions. With `attrs = { ttl: '300' }` a day-old record reports
  `expired = true`, as intended. With `attrs = {}` (no `ttl` sent) `+undefined` is `NaN`,
  and with `attrs = { ttl: 'abc' }` so is `+'abc'` — in both cases the comparison becomes
  `x > NaN`, which is **false for every `x`**. A record one day, or one week, past its
  lifetime still reports `expired = false`.
- **Impact:** once the server omits or mangles `ttl`, the connection is never refreshed for
  the lifetime of the socket. Every subsequent upload keeps signing with the stale `auth`
  token and the stale host list, so media uploads fail (`401`/host unreachable) until the
  user reconnects — and `forceGet` is only passed on an explicit retry, so the normal path
  never recovers on its own. `maxContentLengthBytes: +attrs.maxContentLengthBytes` had the
  same flaw, storing `NaN` into a size limit that callers compare against.
- **Fix:** parsing and the expiry decision moved into the pure
  `lib/Utils/media-conn.js`. `parseMediaConnNode()` falls back to
  `MEDIA_CONN_DEFAULT_TTL` (300s) for any non-finite or non-positive `ttl` and omits an
  unusable `maxContentLengthBytes` entirely instead of writing `NaN`;
  `isMediaConnExpired()` treats *every* unusable record (missing, no fetch date, non-finite
  or non-positive ttl, invalid date) as expired, so the failure mode is now "refresh once
  too often" rather than "never refresh again".
- **Regression lock:** `tests/v247-media-conn-devices.test.js` pins the NaN comparison
  itself, the full table of unusable records, both sides of a valid ttl, and asserts via
  source inspection that `messages-send.js` no longer contains the raw coercions.
  Reviewed by @japaudit.

---

### 2.46 [MEDIUM] The device fan-out encrypted a duplicated recipient twice *(FIXED)*
`getUSyncDevices()` walked its input list entry by entry — reading the device cache, then
pushing every hit onto `deviceResults` — with no deduplication of either the input jids or
the returned devices.

- **Reproduction:** `scripts/r-repro.mjs` replayed the loop with the cache warm for a
  single user that has two devices (`0` and `42`), passing that user's jid twice — exactly
  what `relayMessage()` does on the 1:1 path, where it calls
  `getUSyncDevices([senderIdentity, jid], true, false)` and `senderIdentity === jid`
  whenever you message your own number. Result: **4 entries, 2 unique devices**.
- **Impact:** `allRecipients` then carries each device twice, so `createParticipantNodes()`
  performs a second Signal encryption for every duplicated device and emits a duplicate
  `<to>` participant node in the stanza. That is wasted ratchet work and a malformed
  participant list on the self-chat path and on status broadcasts, where `statusJidList`
  routinely overlaps the group participant list. `assertSessions()` was unaffected because
  it already collapses its input into `uniqueJids` — which is why the duplication only ever
  surfaced in the encryption stage.
- **Fix:** `lib/Utils/device-list.js` adds two pure, order-preserving helpers.
  `dedupeJidsByUser()` collapses the input before the cache read and the USync query (also
  shrinking the query itself), and `dedupeDeviceList()` guards both `return` paths, keyed on
  user + device index so `user@server` and `user:0@server` are recognised as one device
  while the same number on `s.whatsapp.net` and `@lid` stays distinct.
- **Hardening shipped alongside:** inside the same function, `const isLidUser = requestedLidUsers.has(user)`
  shadowed the imported `isLidUser()` predicate for the remainder of the block. Nothing in
  that block calls the predicate today, so this was latent rather than a live defect; the
  local is now `isLidAddressedUser`.
- **Regression lock:** `tests/v247-media-conn-devices.test.js` reproduces the 4→2 case,
  checks order preservation, the `:0` equivalence, the PN/LID distinction and the junk-input
  paths, and asserts by source inspection that both dedup calls and both return guards are
  wired into `getUSyncDevices()`. Reviewed by @japaudit.

---

### 2.47 [HIGH] `onWhatsApp()` handed its LID arguments to the one helper that rejects them *(FIXED)*
`onWhatsApp()` collected every `@lid` argument into `lidUsers` and then ran what it called a
fallback:

```js
const pnMappings = await pnFromLIDUSync(lidUsers)
```

But `pnFromLIDUSync()` resolves the **opposite** direction — it takes phone numbers, runs the
`lid` USync protocol and returns `{ pn, lid }` — and its very first branch is
`if (isLidUser(jid)) { logger?.warn('LID user found in LID fetch call'); continue }`.

- **Reproduction:** `scripts/s-repro.mjs` replays the helper's loop verbatim.
  `pnFromLIDUSync(['99887766@lid', '11223344@lid'])` skips both jids, falls into the
  `users.length === 0` early return and yields `[]` — **without sending a single IQ** —
  while the same function given `628111@s.whatsapp.net` does build a query. The
  `try/catch` around the call never fires either, because nothing throws.
- **Impact:** every LID passed to `onWhatsApp()` was silently dropped. The call resolved
  with only the plain phone numbers in it (or `[]` if *all* arguments were LIDs), so an app
  checking a LID-addressed contact got "not on WhatsApp" with no warning and no error. The
  comment above the code claimed the opposite was happening.
- **Fix:** LIDs are now resolved through `signalRepository.lidMapping.getPNForLID()` — the
  component that actually owns the LID→PN direction — and each resolved phone number is
  queried normally. A LID with no known mapping is logged and skipped rather than
  disappearing. `pnFromLIDUSync()` keeps its PN→LID contract and gained a note saying so.
- **Also fixed here:** the result rows are keyed by the PN jid the server answered with, so
  a caller that asked about a LID could not match the answer back to its input. Entries now
  carry the originating `lid` alongside `jid`/`exists`.
- **Regression lock:** `tests/v247-usync-result.test.js` replays the old pairing (both jids
  skipped → `[]`, no IQ), and asserts by source inspection that `onWhatsApp()` no longer
  calls `pnFromLIDUSync(lidUsers)`, that it calls `getPNForLID()`, and that it carries the
  originating LID onto the result. Reviewed by @japaudit.

---

### 2.48 [MEDIUM] `onWhatsApp()` resolved to `undefined` instead of an empty array *(FIXED)*
Every early exit in `onWhatsApp()` returned `[]`, but the final branch was:

```js
const results = await executeUSyncQuery(usyncQuery)
if (results) {
    return results.list.filter(...).map(...)
}
// <-- no else
```

- **Reproduction:** `scripts/s-repro.mjs` feeds a non-`result` IQ to the real
  `USyncQuery.parseUSyncQueryResult()`, which returns `undefined` by contract. The function
  then falls off its end, so `onWhatsApp()` resolves to `undefined` and the ordinary caller
  pattern `(await sock.onWhatsApp(num)).length` throws
  `TypeError: Cannot read properties of undefined (reading 'length')`.
- **Impact:** an inconsistent contract on one of the most-used public methods — the same
  call returns an array on four paths and `undefined` on the fifth, and the declared type
  (`Promise<any>`) hides it, so the crash only shows up in production against a server
  that answers with something other than a `result` IQ.
- **Fix:** the missing branch now logs and returns `[]`, so `onWhatsApp()` always resolves
  to an array. When the query did come back but reported errors, those are logged too (see
  §2.49) rather than being invisible behind an empty list.
- **Regression lock:** `tests/v247-usync-result.test.js` pins the old shape's `TypeError`,
  checks the new `if (!results) return []` guard is present, and checks the old
  `if (results) { return results.list` shape is gone. Reviewed by @japaudit.

---

### 2.49 [MEDIUM] USync threw away every error the server reported *(FIXED)*
`parseUSyncQueryResult()` carried three standing TODOs — `implement errors etc.`,
`implement error backoff, refresh etc.` and `see if there are any errors in the result
node`, the last sitting above a commented-out `getBinaryNodeChild(usyncNode, 'result')` —
and built its result from the `<list>` node only.

- **Reproduction:** `scripts/s-repro.mjs` parses an IQ whose `<usync>` contains
  `<result><error code="479" text="rate overlimit"/></result>` and an empty `<list>`. Before
  the fix the parse returned `{"list":[],"sideList":[]}` — byte-identical to a successful
  query where nobody matched.
- **Impact:** a throttled, refused or partially failed USync was indistinguishable from a
  genuine "no results". `onWhatsApp()` reported numbers as not on WhatsApp, device fan-out
  silently came back short, and no caller could implement the backoff the TODO asked for
  because the information never reached them.
- **Fix:** the pure `lib/Utils/usync-result.js` adds `extractUSyncErrors(node)` — which
  collects the query-level `<result><error/>`, the per-user `<user><error/>` and errors
  nested inside a protocol node (`<devices><error/>`), tagging each with its `jid` and
  `protocol` — plus `hasUSyncQueryError(errors)` to tell a query-wide failure from a
  single-user one. `parseUSyncQueryResult()` now always returns an `errors` array, and
  `onWhatsApp()` logs it. A missing or garbage `code` is reported as `undefined` rather
  than `NaN`.
- **Regression lock:** `tests/v247-usync-result.test.js` covers the query-level case, the
  per-user case, the protocol-nested case, garbage codes, clean and malformed input, and
  asserts the two TODO lines are gone. Reviewed by @japaudit.

---

### 2.50 [HIGH] Restoring a store snapshot left every message invisible to its own index *(FIXED)*
`makeOrderedDictionary()` keeps two views of the same data — an ordered `array` and an
`id → item` object used by `get()` — but its restore path only touched one of them:

```js
fromJSON: (newItems) => {
    array.splice(0, array.length, ...newItems)
}
```

- **Reproduction:** `scripts/t-repro.mjs` restores two messages and then queries them.
  `array.length` is `2`, but `get('AAA')` is `undefined`, `updateAssign('AAA', { status: 3 })`
  returns `false`, and `upsert()` of the **same** id appends a third row
  (`['AAA','BBB','AAA']`) because `upsert` asks `get(id)` whether the item exists.
- **Impact:** this is the public restore hook of the message store
  (`store.messages[jid].fromJSON`). After it runs, the id index is empty, so every lookup
  misses: `messages.update` logs "got update for non-existent message" and drops the
  status, `message-receipt.update` and `messages.reaction` find no message and discard the
  receipt/reaction, and any re-delivery of a message already in the snapshot is appended as
  a duplicate instead of updating in place — the array and the index drift further apart
  with every event.
- **Fix:** `fromJSON()` now clears and rebuilds the index from the incoming items, and
  tolerates `null`/`undefined`/non-array input by restoring to an empty state.
- **Regression lock:** `tests/v247-store-participants.test.js` covers lookup after restore,
  `updateAssign`, the duplicate-free upsert, a second `fromJSON` dropping the stale index,
  `remove`/`filter` on restored items, junk input, and a full JSON round-trip.
  Reviewed by @japaudit.

---

### 2.51 [MEDIUM] `update()` reported failure even when it had updated *(FIXED)*
In the same dictionary, `return false` sat **outside** the success branch:

```js
const idx = array.findIndex(i => idGetter(i) === id)
if (idx >= 0) {
    array[idx] = item
    dict[id] = item
}
return false
```

- **Reproduction:** `scripts/t-repro.mjs` upserts an item, calls `update()` with a new
  version of it, and shows the stored item really did change while the call returned
  `false` — the same value it returns for an id that does not exist.
- **Impact:** the return value is unusable, and the store's own convention is
  `if (!result) logger.debug('…non-existent…')` (used verbatim for chats and messages), so
  any caller following it logs a miss on every successful write and cannot tell a real miss
  from a success. The typings advertised `update: (item) => boolean`, promising information
  the function never provided.
- **Fix:** `update()` returns `true` from inside the branch that performed the write, and
  `false` only on the miss path.
- **Regression lock:** `tests/v247-store-participants.test.js` asserts both outcomes, that
  a miss does not insert, and (by source inspection) that exactly one `return false`
  remains. Reviewed by @japaudit.

---

### 2.52 [MEDIUM] Group participant updates duplicated members and stored `false` as a rank *(FIXED)*
The `group-participants.update` handler mutated `metadata.participants` inline:

```js
case 'add':
    metadata.participants.push(...participants.map(p => ({ id: p.id, phoneNumber: p.phoneNumber, admin: p.admin })))
    break
case 'demote':
case 'promote':
    ...
    participant.admin = action === 'promote' && 'admin'
```

- **Reproduction:** `scripts/t-repro.mjs` replays both branches. Starting from a group whose
  metadata already lists `2@lid`, an `add` naming `2@lid` and `3@lid` yields
  `['1@lid','2@lid','2@lid','3@lid']` — the member is listed twice. Demoting `1@lid` then
  stores `{"id":"1@lid","admin":false}`: boolean `false`, not `null`.
- **Impact:** `add` is emitted both by the live `w:gp2` notification and after any
  reconnect/history replay, and the member is usually already present from a
  `groupMetadata()` fetch — so duplicates are the normal case, not an edge case. They skew
  participant counts and admin checks, and feed duplicated jids to anything iterating the
  cached metadata. The `false` rank is not a member of the declared
  `'admin' | 'superadmin' | null` type, so a correct `participant.admin === null` check
  silently fails for anyone who was demoted while the store was running. Promoting also
  overwrote a `superadmin` (the group owner) with the lesser `admin` rank.
- **Fix:** the handler now calls the pure helpers in `lib/Utils/participant-list.js` —
  `upsertParticipants()` merges by `id` **or** `phoneNumber` (the two halves of a LID↔PN
  pair are the same person) instead of pushing, `setParticipantsAdmin()` writes `null` for
  "not an admin" and leaves a `superadmin` alone on promote, and `removeParticipants()`
  replaces the hand-rolled `Set` reduction. All three are order-preserving, non-mutating,
  and safe when `metadata.participants` is missing from a partial metadata object.
- **Regression lock:** `tests/v247-store-participants.test.js` covers the duplicate case,
  LID/PN cross-matching, non-mutation, `null` vs `false`, the superadmin guard, removal by
  either identity, junk input, and asserts by source inspection that the handler no longer
  contains `metadata.participants.push` or the `&& 'admin'` expression.
  Reviewed by @japaudit.

---

### 2.53 [MEDIUM] "Delete all messages" looked in a bucket the store never writes to *(FIXED)*
Every handler in the in-memory store addresses a chat's message list through the canonical
`messageBucketJid(key)` — the resolver introduced precisely to stop the handlers disagreeing
about which jid a message is filed under. The `messages.delete` handler did not:

```js
if ('all' in item) {
    const list = messages[item.jid]   // <-- raw, unnormalized
    list?.clear()
}
```

- **Reproduction:** `scripts/u-repro.mjs` drives the real store through a stub emitter. A
  message arriving from `628111:5@s.whatsapp.net` is filed under
  `628111@s.whatsapp.net` (correct — the bucket jid is normalized). A
  `messages.delete { jid: '628111:5@s.whatsapp.net', all: true }` then clears **nothing**:
  the chat still reports 1 message. Only the already-normalized jid worked.
- **Impact:** a "clear chat" that silently keeps every message — the store disagrees with
  the user's phone, and the stale messages are then written into every snapshot. Any
  non-normalized jid hits this: device-addressed jids and the LID/PN alt forms that
  `messageBucketJid()` exists to collapse.
- **Also fixed here:** the per-key branch looked up a single bucket from `item.keys[0]`,
  so a deletion batch spanning several chats only ever filtered the first chat's list and
  left the rest untouched. Keys are now grouped by bucket and each bucket is filtered.
- **Regression lock:** `tests/v247-store-usync-hardening.test.js` covers the device-jid
  clear, the plain-jid clear, an unknown chat (no-op, and no bucket created) and the
  multi-chat key batch. Reviewed by @japaudit.

---

### 2.54 [MEDIUM] Every update for an unknown message leaked a permanent empty bucket *(FIXED)*
`messages.update` opened with `assertMessageList(messageBucketJid(key))` — and
`assertMessageList()` **creates** the list when it is missing:

```js
const assertMessageList = (jid) => {
    if (!messages[jid]) { messages[jid] = makeMessagesDictionary() }
    return messages[jid]
}
```

- **Reproduction:** `scripts/u-repro.mjs` emits five `messages.update` events for messages
  the store has never seen. `store.messages` goes from `0` to `5` keys, every one of them
  an empty dictionary that is never removed.
- **Impact:** unbounded growth driven by remote input. Status updates arrive for messages
  the store never kept (anything older than the session, anything evicted, any chat the app
  does not track), and each one permanently allocates a dictionary keyed by that chat.
  The leak is also persisted: `toJSON()`/`writeToFile()` serialize the empty buckets into
  the snapshot file, which then grows on every run. The handler immediately logged
  "got update for non-existent message" and did nothing else with the list it had just
  created.
- **Fix:** the handler now reads `messages[bucket]` without creating it and skips (with the
  same debug log) when the chat is unknown.
- **Regression lock:** `tests/v247-store-usync-hardening.test.js` asserts five unknown
  updates leave zero buckets, that a known message still updates, and that the
  "stored status is newer" guard still works. Reviewed by @japaudit.

---

### 2.55 [MEDIUM] `ObjectRepository` could not read back its own `toJSON()` *(FIXED)*
The constructor accepted a `{ id: entity }` map:

```js
constructor(entities = {}) { this.entityMap = new Map(Object.entries(entities)) }
```

…while `toJSON()` emits a plain **array** of entities.

- **Reproduction:** `scripts/u-repro.mjs` serializes a two-label repository and feeds the
  result straight back in. `Object.entries(array)` yields index keys, so the restored map
  is keyed `'0'`, `'1'` — `findById('L1')` returns `undefined` and every label is
  unreachable even though the data is all there.
- **Impact:** the class's own persistence round-trip is broken, which is the only reason
  `toJSON()` exists. Any caller that snapshots a repository (chat labels are the store's
  use case) and reconstructs it the obvious way silently loses the entire label set — no
  throw, no warning, just empty lookups.
- **Fix:** the constructor (and the new `load()`) accept **both** shapes, key entries by
  the entity's own `id` — preferring it over a mismatched map key — skip entries with no
  usable id instead of storing them under a meaningless key, and copy entities rather than
  aliasing the caller's objects. `ObjectRepository.fromJSON()`, `hasId()` and `clear()`
  were added alongside.
- **Regression lock:** `tests/v247-store-usync-hardening.test.js` covers the JSON
  round-trip, the legacy map shape, a mismatched key, id-less array entries, the new
  helpers, and non-aliasing. Reviewed by @japaudit.

---

### 2.56 [HIGH] One user's error node discarded every other user in the USync batch *(FIXED)*
Each USync protocol parser starts with `assertNodeErrorFree(node)`, which **throws** when
the node carries an `<error/>` child. Those parsers were called from inside the
`Object.fromEntries(node.content.map(...))` that builds one user's data, with nothing
between them and the caller.

- **Reproduction:** `scripts/u-repro.mjs` parses a device query for three users where the
  middle one came back as `<devices><error code="403"/></devices>`. Before the fix the whole
  `parseUSyncQueryResult()` call threw `Error: Unknown error` — users 1 **and** 3 were lost
  along with it, even though their device lists parsed perfectly.
- **Impact:** a per-user failure is routine (blocked contact, privacy setting, a number that
  is not on WhatsApp) and USync batches are large — `getUSyncDevices()` queries every
  recipient of a group send at once. One bad entry aborted the entire parse, so the caller
  got an exception instead of the other recipients' devices, and the send failed for
  everybody.
- **Fix:** each protocol parse is wrapped individually; a thrown parser omits that one
  user's protocol entry and leaves the rest of the batch intact. The failure is not lost —
  §2.49's `extractUSyncErrors()` reports it on `result.errors`, tagged with the user's `jid`
  and the protocol that failed. The same guard covers the `side_list` branch.
- **Also fixed here:** `USyncDeviceProtocol.parser()` built device entries with
  `id: +attrs.id` and `keyIndex: +attrs['key-index']`, so a missing or non-numeric
  attribute produced `NaN` — and a device with `id: NaN` goes on to form the jid
  `user:NaN@server`. Unusable ids are now skipped entirely, `keyIndex`/`timestamp`/
  `expectedTimestamp` fall back to `undefined`, non-`device` children are ignored, and
  `isHosted` is only `true` for the literal string `'true'`.
- **Regression lock:** `tests/v247-store-usync-hardening.test.js` checks that the
  surrounding users survive, that the error still surfaces on `result.errors`, that the
  side list is protected too, and that no device id, key index or timestamp can be `NaN`.
  Reviewed by @japaudit.

---

### 2.57 [MEDIUM] A missed call could never reach the chat list *(FIXED)*
`isRealMessage()` decides whether a message bumps `conversationTimestamp`, attaches to the
chat and unarchives it. It carried a `TODO: AUDIT THIS FUNCTION AGAIN`, and the audit was
overdue:

```js
const hasSomeContent = !!getContentType(normalizedContent)
return ((!!normalizedContent ||
    REAL_MSG_STUB_TYPES.has(message.messageStubType) ||
    REAL_MSG_REQ_ME_STUB_TYPES.has(message.messageStubType)) &&
    hasSomeContent && ...)
```

`hasSomeContent` is AND-ed over the **whole** expression, including the two stub-type
allowances — and a stub message carries no content by definition.

- **Reproduction:** `scripts/v-repro.mjs` calls the real function.
  `isRealMessage({ messageStubType: CALL_MISSED_VOICE })` returns `false`, as does a
  `GROUP_PARTICIPANT_ADD` stub, while a plain text message returns `true`. Both stub
  branches are unreachable: `REAL_MSG_STUB_TYPES` (the four missed-call types) and
  `REAL_MSG_REQ_ME_STUB_TYPES` exist purely as dead code.
- **Impact:** a missed call never moved its chat up the list (`conversationTimestamp` was
  not touched), was never attached to the chat, and never unarchived an archived chat even
  with `unarchiveChats` on — so a missed call from an archived contact left no trace in the
  client at all. The same applied to being added to a group.
- **Fix:** the content requirement now applies only to the content branch; the stub-type
  branches are evaluated on their own. `isRealMessage()` also takes an optional `meId`
  (passed by `processMessage()`), so a `GROUP_PARTICIPANT_ADD` stub only counts when the
  parameters actually name **us** — the "… added you to the group" case these
  `REQ_ME` types were named for. Without `meId` the previous permissive behaviour is kept,
  so existing callers do not change meaning.
- **Regression lock:** `tests/v247-message-relevance-buffer.test.js` pins all four
  missed-call types, both sides of the "added me" test, the unchanged content path, the
  protocol/reaction/poll exclusions, the still-ignored stub types, and that a missed call
  still does not raise the unread counter. Reviewed by @japaudit.

---

### 2.58 [MEDIUM] The event buffer silently swallowed "clear chat" *(FIXED)*
`messages.delete` has two payload shapes. The buffer handled one of them:

```js
if ('keys' in deleteData) {
    ...
} else {
    // TODO: add support
}
```

- **Reproduction:** `scripts/v-repro.mjs` opens a real `makeEventBuffer`, emits a message
  upsert and then `messages.delete { jid, all: true }`, and flushes. Only the upsert comes
  out — the chat clear is **never delivered to any consumer**, and the messages of the
  cleared chat are delivered right alongside it.
- **Impact:** the buffer is open during history sync and around every buffered socket
  operation, which is exactly when app-state sync replays a chat clear performed on the
  phone. The event vanished, so the store (and the application) kept every message of a
  chat the user had deleted, with no error and no log line. The buffered upserts for that
  chat survived too — the opposite of what the user asked for.
- **Fix:** chat-wide deletes are now recorded, and recording one drops everything already
  buffered for that chat (upserts, updates, key-deletes, reactions, receipts and history
  messages) since it is about to be deleted anyway. On flush each is released as its own
  `messages.delete` event, before the consolidated map — the consolidated map's single
  `messages.delete` slot cannot hold both payload shapes, and anything left in it for that
  chat arrived *after* the clear.
- **Regression lock:** `tests/v247-message-relevance-buffer.test.js` covers delivery on
  flush, the dropped pre-clear messages, an unaffected neighbouring chat, several cleared
  chats at once, coexistence with a key-based delete, the unbuffered pass-through, and the
  removal of the TODO branch. Reviewed by @japaudit.

---

### 2.59 [HIGH] Invite-link join requests never reached `group.join-request` *(FIXED)*
`processMessage()` handled exactly one of WhatsApp's two join-approval stub types:

```js
case WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD: // TODO: Add other events
    ...
    emitGroupRequestJoin(participant, action, method)
```

The plain `GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST` — somebody asking to join through the
invite link, which is the ordinary case — fell through to no case at all.

- **Reproduction:** `scripts/w-repro.mjs` runs the real `processMessage()` with a stub
  emitter. `GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST` emits **`[]`** — nothing whatsoever —
  while `…_NON_ADMIN_ADD` emits `['group.join-request']` from the identical payload.
- **Impact:** `group.join-request` is the only place that event is emitted in the whole
  library, and this fork ships a feature built on it: `lib/Utils/join-requests.js`
  (`createJoinRequestManager().bind(sock)`) subscribes to it to auto-approve/reject
  pending members. Because the common invite-link request never fired it, an auto-approve
  bot appeared to work in testing (admins adding people hit the `_NON_ADMIN_ADD` path) and
  then silently ignored every real request from the group's invite link. No log, no error.
- **Fix:** both stub types now fall into the same case and emit the same payload.
- **Regression lock:** `tests/v247-stub-participants.test.js` asserts the plain variant
  emits, that both variants produce byte-identical payloads, that a plain-jid parameter
  does not throw, and that an unrelated group stub still emits nothing.
  Reviewed by @japaudit.

---

### 2.60 [MEDIUM] A LID-addressed group never recognised us in its own membership events *(FIXED)*
The "is this about me?" test inside `processMessage()` read a single field:

```js
const participantsIncludesMe = () => participants.find(jid => areJidsSameUser(meId, jid.phoneNumber)) // ADD SUPPORT FOR LID
```

`messageStubParameters` entries, however, are either a JSON object (`{"lid":…,"pn":…}`) or a
plain jid — and the plain form is stored as `{ phoneNumber: '<whatever was sent>' }`, which
in a LID-addressed group is our **LID**, not our phone number.

- **Reproduction:** `scripts/w-repro.mjs` emits a `GROUP_PARTICIPANT_LEAVE` naming our
  phone number and then one naming our LID. The first produces
  `chats.update [{ id, readOnly: true }]`; the second produces **no `chats.update` at
  all**.
- **Impact:** in LID-addressed groups — the direction WhatsApp is moving everything in —
  leaving a group never marked the chat read-only, so the client kept offering a composer
  for a group we are no longer in, and being re-added never cleared a read-only flag set
  earlier. The comment on the line (`ADD SUPPORT FOR LID`) acknowledged the gap.
- **Fix:** the test now runs through the shared `stubParticipantsInclude()`, which checks
  **every** identity a stub participant carries (`lid`, `pn`, `phoneNumber`, `id`, `jid`)
  against both our PN and our LID, and tolerates device suffixes via `areJidsSameUser()`.
- **Regression lock:** `tests/v247-stub-participants.test.js` covers leaving by LID, by PN
  and by the JSON pair, being added back, somebody else leaving (no chat update), an
  account with no LID, and that the participants update still fires in every case.
  Reviewed by @japaudit.

### 2.61 [MEDIUM] `extractImageThumb()` ignored the EXIF `Orientation` tag *(FIXED)*
Every photo taken in portrait on a phone is stored by the sensor in **landscape**, with an
EXIF `Orientation` tag (6 or 8) telling the viewer to rotate it. `extractImageThumb()` read
`metadata().width/height` raw on both the **sharp** and the **@napi-rs/image** branches and
never applied that tag — while the **jimp** branch auto-rotates inside `Jimp.read()`. So the
same photo produced a *different message* depending on which optional image library happened
to be installed.

- **Reproduction:** `scripts/x-repro.mjs` builds a 400x200 bitmap tagged `orientation=6`
  (displayed 200x400). Before: `original { width: 400, height: 200 }` and a **32x16**
  sideways thumbnail. After: `original { width: 200, height: 400 }` and a **32x64** upright
  thumbnail. Part B shows jimp reading 200x400 against sharp's 400x200 for the same bytes.
- **Impact:** `extractImageThumb().original` flows into `generateThumbnail()`
  (`messages-media.js:416-425`) → `originalImageDimensions` → `uploadData.width/height`
  (`messages.js:193-199`) → `imageMessage.width`/`height` on the wire. Portrait phone photos
  — the common case — were sent with **swapped dimensions** and a sideways `jpegThumbnail`,
  so recipients saw a squashed preview in the wrong aspect box before the full image loaded.
- **Fix:** the sharp branch now pipes through `img.rotate().resize(width)` (sharp's
  no-argument `rotate()` applies the EXIF tag), and every non-jimp branch returns
  `exifOrientedDimensions(dimensions)` so the reported size matches what a viewer displays.
  The jimp branch is untouched — it was already correct. The old
  `// TODO: Move entirely to sharp, removing jimp` is resolved and replaced by a docblock.
- **Upgrade:** new `lib/Utils/exif-orientation.js` (+ `.d.ts`, exported from the barrel) —
  `SWAPPED_EXIF_ORIENTATIONS` (frozen `[5, 6, 7, 8]`), `isOrientationSwapped(orientation)`
  and `exifOrientedDimensions(metadata)`, all null-safe and tolerant of absent or
  out-of-range tags.
- **Regression lock:** `tests/v247-exif-orientation.test.js` (13 cases) covers all four
  swapped orientations, untagged/upright images, the requested-width path, a `Readable`
  input, agreement with sharp's own post-rotation metadata, and the end-to-end
  `generateThumbnail()` dimensions that become `imageMessage.width/height`.
  Reviewed by @japaudit.

### 2.62 [HIGH] A group with no icon made `sendMessage({ groupInvite })` fail outright *(FIXED)*
The `groupInvite` branch of `generateWAMessageContent()` decorated the invite with the
group's profile picture — unguarded:

```js
const pfpUrl = await options.getProfilePicUrl(message.groupInvite.jid, 'preview')
if (pfpUrl) { const resp = await fetch(pfpUrl, { method: 'GET', ... }) }
```

`options.getProfilePicUrl` is wired to `sock.profilePictureUrl` (`messages-send.js:1266`),
which issues a `w:profile:picture` iq through `query()` — and `query()` runs
`assertNodeErrorFree()` on the reply. A group **with no icon** answers
`404 item-not-found`, so the helper throws a Boom, the unguarded `await` propagates, and
the entire send rejects.

- **Reproduction:** `scripts/y-repro.mjs`. Part A: the pre-fix body with a 404-throwing
  resolver → **generation rejected**, the invite never goes out. After: the invite is
  produced normally with `jpegThumbnail: undefined`. Part B: a resolver that never settles
  → pre-fix the send hangs forever (the raw `fetch()` had no timeout either); now it
  resolves in ~5 s without a thumbnail. Part C: three invites to the same iconless group →
  **1** server round-trip instead of 3.
- **Impact:** a decoration could kill the payload. Brand-new groups and any group whose
  icon is privacy-gated, plus any transient CDN/network failure, turned
  `sendMessage(jid, { groupInvite })` into a rejected promise — and in the stalled-CDN case
  into a promise that never settled at all, wedging whatever queue the caller runs sends on.
- **Fix:** the branch now calls `fetchGroupInviteThumbnail()`, which never throws, bounds
  both the profile-picture query and the download, and logs failures at `debug`. The
  thumbnail is strictly best-effort; everything else about the invite is unchanged.
- **Upgrade:** new `lib/Utils/group-invite-thumbnail.js` (+ `.d.ts`, exported from the
  barrel) — `fetchGroupInviteThumbnail()` and `createGroupInviteThumbnailCache()`, an
  insertion-ordered TTL cache (defaults: 10 min, 100 groups) that also memoises the
  *negative* answer, so repeat invites to an iconless group stop paying for a failing
  round-trip each time. Pass it as `options.groupInviteThumbnailCache`. This closes the
  upstream `//TODO: cache / use store!?`.
- **Regression lock:** `tests/v247-group-invite-thumbnail.test.js` (17 cases) covers the
  404 group, a synchronously throwing resolver, the happy path, non-ok and rejecting
  downloads, both hang timeouts, debug logging, and the cache's hit/negative-hit, TTL
  expiry, cap eviction, re-set ordering, delete/clear and option fallbacks.
  Reviewed by @japaudit.

### 2.63 [HIGH] `fetchMessageHistory()` returned nothing whenever history sync was disabled *(FIXED)*
`chats.js` computed a single boolean and used it for two unrelated purposes:

```js
const shouldProcessHistoryMsg = historyMsg
    ? shouldSyncHistoryMessage(historyMsg) && PROCESSABLE_HISTORY_TYPES.includes(historyMsg.syncType)
    : false
```

It drives the connection's `Syncing` state, the app-state sync and the event-buffer flush —
and it was *also* handed to `processMessage()` as the permission to download a history
payload. An **ON_DEMAND** notification, however, is not pushed history: it is the answer to
an explicit `sock.fetchMessageHistory()` / `requestPlaceholderResend()` call the user just
made.

- **Reproduction:** `scripts/z-repro.mjs`. Part A, with `shouldSyncHistoryMessage: () => false`:
  the pre-fix gate returns `false` for an ON_DEMAND notification (and `false` for RECENT, as
  intended); the new gate returns `true` / `false` respectively. Part B drives
  `processMessage()` directly: with the gate closed **nothing is downloaded and no event is
  emitted**; with it open the chunk is fetched.
- **Impact:** `shouldSyncHistoryMessage: () => false` is the standard way to skip the
  initial sync on a bot — and it silently turned `fetchMessageHistory()` into a no-op. The
  call resolved, the server answered, and the chunk was thrown away before download: no
  `messaging-history.set`, no error, nothing to debug. Scroll-back and "load older
  messages" features were dead on exactly the configuration that needs them most.
- **Fix:** the connection-state boolean is unchanged; the *payload* decision now goes
  through `shouldProcessHistorySyncNotification()`, which honours the preference for pushed
  history but always allows an explicitly requested one. `processMessage()` keeps the
  on-demand chunk out of `creds.processedHistoryMessages` and leaves `isLatest` undefined
  for it — now expressed as `recordsProcessedHistoryMessage()`, with the reasoning written
  down, which resolves the upstream `// TODO: investigate` on that condition.
- **Upgrade:** new `lib/Utils/history-sync-gate.js` (+ `.d.ts`, exported from the barrel) —
  `EXPLICITLY_REQUESTED_HISTORY_TYPES`, `isOnDemandHistorySync()`,
  `isProcessableHistorySyncType()`, `shouldProcessHistorySyncNotification()` and
  `recordsProcessedHistoryMessage()`, all accepting either a notification object or a raw
  sync type and tolerating `null`/unknown types.
- **Regression lock:** `tests/v247-history-sync-gate.test.js` (15 cases) covers the
  sync-disabled ON_DEMAND pass, pushed history still obeying the preference, the library
  default still skipping `FULL`, boolean vs predicate preferences, unknown/absent sync
  types, the `processedHistoryMessages` bookkeeping for both kinds of chunk, and the
  `chats.js` / `process-message.js` wiring. Reviewed by @japaudit.

### 2.64 [MEDIUM] In a LID-addressed group we quoted ourselves under the wrong identity *(FIXED)*
`generateWAMessageFromContent()` has two places where it must name us, and both hard-coded
the phone number:

```js
const participant = quoted.key.fromMe ? userJid : ...                               // TODO: Add support for LIDs
participant: isJidGroup(jid) || isJidStatusBroadcast(jid) ? userJid : undefined      // TODO: Add support for LIDs
```

But a LID-addressed group carries our messages under our **LID** — `messages-send.js`
encrypts with `const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId`,
and every other participant in that group is addressed by LID too. So replying to one of
our own messages produced a `contextInfo.participant` naming an identity the group has
never seen.

- **Reproduction:** `scripts/aa-repro.mjs`. Part A, quoting our own message from a
  LID-addressed group: BEFORE `628111111111@s.whatsapp.net`, AFTER `77777777777777@lid`
  (quoting *someone else* was already correct and is unchanged). Part B drives
  `generateWAMessageFromContent()` end to end: `contextInfo.participant` and the message's
  own `participant` both become the LID, while a PN-addressed group stays on the phone
  number.
- **Impact:** a client resolves a quote by `(stanzaId, participant)`. With the author named
  in the other addressing scheme the quote does not bind to the original — recipients see a
  reply whose quoted bubble does not resolve to our message — and our own locally generated
  `WebMessageInfo` went into the store with a `participant` that disagrees with the one the
  same message comes back with from the server, splitting the identity of our messages
  inside a single group.
- **Fix:** both call sites now resolve our identity through `resolveSelfAddressingMode()` /
  `selfJidForAddressingMode()`. Precedence: an explicit `options.addressingMode`, then the
  quoted message's own addressing, then the chat jid. With no evidence and no LID it falls
  back to the previous behaviour exactly. `sendMessage()` supplies
  `userLid: authState.creds.me?.lid` and, for groups, the addressing mode from the
  **cached** group metadata only — never an extra round-trip.
- **Upgrade:** new `lib/Utils/self-addressing.js` (+ `.d.ts`, exported from the barrel) —
  `keyAddressingMode()`, `selfJidForAddressingMode()`, `resolveSelfAddressingMode()` and
  `quotedParticipantJid()`, all null-safe, device-suffix tolerant and ignoring bogus mode
  strings.
- **Regression lock:** `tests/v247-self-addressing.test.js` (17 cases) covers quoting
  ourselves in LID and PN groups, quoting others, an account with no LID, the explicit
  hint, a 1:1 chat carrying no participant, mode inference and precedence, device-suffix
  normalisation, and the `messages-send.js` wiring. Reviewed by @japaudit.

---

## 3. Known/latent items (not crashes — documented for your awareness)

These are pre-existing `TODO`s inherited from the Baileys base or intentionally
documented behaviours. None fail tests; listed so you can decide later.

| File | Note | Nature |
|---|---|---|
| `lib/Builders/AIRich.js:51` | `bug 71` — `insertAt` always inserts right after target; author marked "behavior, not fixed, documented". | Intentional/documented |
| `lib/Signal/libsignal.js:205` | `TODO: use usync to handle this entire mess` | Inherited from base |
| `lib/Socket/communities.js:362` | `TODO: investigate if this makes sense` (participant/remoteJid) | Inherited from base |
| `lib/Socket/groups.js:55,342` | `TODO: parse LID/PN`, `TODO: store LID mappings` | Inherited from base |
| `lib/Socket/messages-recv.js:348,595,645` | `TODO`s around PN/LID handling and `fromMe` | Inherited from base |

Recommendation: leave as-is for this release; they are protocol-tracking notes,
not defects. Revisit LID/PN handling when WhatsApp finalizes that migration.

---

## 4. Attribution & authorship

`NOTICE.md` credits the two upstream sources this fork relies on:

1. **WhiskeySockets/Baileys** — the upstream base: socket core, auth-state
   contract, Signal integration, protobuf surface, binary-node handling, and
   event model.
2. **Nayuki — QR-Code-generator** — the vendored QR generator used by
   `lib/Utils/qrcodegen.js` and the built-in terminal/SVG/PNG renderers.

Everything else — the fork's own helper layer — is original work authored for
this project. Its public API is kept stable so the full test suite stays green:

| Area | Notes |
|---|---|
| `lib/Utils/button-helper-utils.js`, `lib/Utils/button-sender.js` | Interactive button detection/builder + sender runtime — own validation engine (`classifyButton`, `assertValid`, `parseParams`), stable exports + behaviour. |
| `lib/Socket/username.js` | Username socket layer — stable API with a shared `requireId` guard. |
| `lib/Framework/*` | Bot framework — `Bot`, `Context`, `MediaManager`, `SessionManager`, `StatsManager`, `Store/SQLiteStore` (`.d.ts` stable, tests green). |
| `lib/VoIP/*` | VoIP stack — `types`, `call-recorder`, `audio-feeder`, and the WhatsApp-WASM/WebRTC glue (`wasm-engine`, `worker-bootstrap`, `signaling`, `relay-transport`). The glue is fragile real-call code exercised by Worker tests, so it is kept functionally intact. |
| `lib/Builders/*` | Message builders (interactive/AI-rich/carousel/album). |

The WhatsApp VoIP WASM artifacts under `lib/assets/wasm/` (`whatsapp.wasm`,
`worker-modules.js`, `loader.js`) are WhatsApp Web's own published build
resources fetched at build time; they carry no third-party attribution.

`NOTICE.md` was checked against the shipped code and is accurate.

---

## 5. What changed (file list)

```
CHANGELOG.md                          (+2.4.5 entry, +10 core node helpers)
NOTICE.md                             (attribution reviewed)
README.md, README.id.md               (version → 2.4.5; tests badge → 732)
package.json, package-lock.json       (version → 2.4.5)
tests/community4-events.test.js       (assertion → 2.4.5)
lib/WABinary/generic-utils.js         (+10 core node-reader helpers)
lib/WABinary/generic-utils.d.ts       (types for the 10 helpers)
tests/v245-core-node-helpers.test.js  (new — 9 cases for the helpers)
lib/Socket/username.js                (authored for this fork)
lib/Utils/button-helper-utils.js      (authored for this fork)
lib/Utils/button-sender.js            (authored for this fork)
lib/Builders/AIRich.js                (authored for this fork)
lib/Framework/*.js                    (authored for this fork)
```

All 1513 tests pass; type-check, parse, audit, import, and CLI all succeed.

---

## 6. Core upgrades this round (10 new WABinary node-reader helpers)

Parsing WhatsApp's `{ tag, attrs, content }` stanza trees is the single most
repeated chore in socket code. These ten pure, null-safe helpers were added to
the core node utility (`lib/WABinary/generic-utils.js`, auto-exported through the
top barrel) and reuse the existing cached child-index:

| Helper | What it does |
|---|---|
| `getBinaryNodeAttr(node, attr, fallback?)` | Safe read of a node's own attribute, with optional fallback. |
| `getBinaryNodeChildAttr(node, tag, attr)` | Attribute of the first child matching a tag. |
| `getBinaryNodeChildInt(node, tag, attr?, fallback?)` | Int from an attr (or content); absent → `undefined`, unparseable → `fallback`. |
| `getBinaryNodeChildBool(node, tag, attr?)` | Bool from `true`/`1`/`yes`/`on`; absent → `undefined`. |
| `hasBinaryNodeChild(node, tag)` | Whether at least one child carries the tag. |
| `countBinaryNodeChildren(node, tag)` | How many children carry the tag. |
| `getBinaryNodeChildrenAttrs(node, tag)` | The `attrs` object of every matching child. |
| `filterBinaryNodeChildren(node, predicate)` | Children kept by a predicate (safe on non-array content). |
| `getBinaryNodeContentString(node)` | Coerce a node's own Buffer/Uint8Array/string content to UTF-8. |
| `getBinaryNodeErrorStatus(node)` | Non-throwing counterpart of `assertNodeErrorFree` → `{ code, text }` or `undefined`. |

All are typed in `generic-utils.d.ts` and covered by
`tests/v245-core-node-helpers.test.js` (9 cases).
