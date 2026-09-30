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
| Unit/integration tests (`node --test`) | **667 pass / 1 fail** (668) | **1237 pass / 0 fail** |
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

All 1237 tests pass; type-check, parse, audit, import, and CLI all succeed.

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
