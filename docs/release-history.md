# Release history (archive)

[← back to the README](../README.md)

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
[`CHANGELOG.md`](../CHANGELOG.md) and [`BUGREPORT.md`](../BUGREPORT.md) §2.44–§2.97.

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

// Usernames — WhatsApp's own rules: 3–35 chars, lowercase letters/digits/`.`/`_`,
// at least one letter, no edge or doubled dots, no `www.` prefix, no domain suffix.
validateUsername('@ja.p_official')  // { valid, username, reason, errorType }  ← says *why*
validateUsername('myshop.com')      // → errorType: 'INVALID_DOMAIN_SUFFIX'
displayUsername(value, { fallback: pushName })
isUsernamePin('1234')               // the username key is 4 digits
stripUsernamePrefix('628…@s.whatsapp.net')

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

### Profile pictures crop the same way everywhere, and buttons degrade instead of vanishing

```js
// §2.98 — the crop no longer depends on which image library is installed
await sock.updateProfilePicture(jid, photo)                               // centre crop (WhatsApp-style)
await sock.updateProfilePicture(jid, photo, { position: 'top' })          // keep the head, not the middle
await sock.updateProfilePicture(jid, photo, { fit: 'contain' })           // whole picture, letterboxed
generateProfilePicture(photo, { width: 640, height: 640, position: 'left' })
// → { img, width, height, fit, position }

// Buttons that the paired device cannot draw become readable text instead of a blank bubble
supportsInteractiveButtons(sock)        // { supported, platform, reason }
await sendInteractiveSafe(sock, jid, { text: 'Pick one', interactiveButtons })
// → { mode: 'interactive' | 'text', reason, message }
describeButtonsAsText(content)          // "Pick one\n1. Yes (.yes)\n2. Site — https://…"
getMessageDevice(msg)                   // 'ios' | 'android' | 'web' | 'desktop' | 'unknown'
```

### AI-rich cards on plain WhatsApp and WhatsApp Business

An `AIRich` card lives in `botForwardedMessage.richResponseMessage`, which only the Meta-AI
surface can draw — personal and Business accounts receive it as an empty bubble. `compat`
flattens the very same card into WhatsApp's own formatting and sends it as a normal message.

```js
const rich = new AIRich(sock)
  .addHeading('Jakarta weather')
  .addText('Light **rain**, 27 degrees')
  .addSuggest(['Tomorrow?', 'This week?'])

await rich.send(jid)                            // unchanged: the Meta-AI rich card
await rich.send(jid, { compat: 'plain' })       // *Jakarta weather* … as an ordinary message
await rich.send(jid, { compat: 'interactive' }) // body text + the suggestions as nativeFlow buttons
await rich.send(jid, { compat: 'auto' })        // interactive when the card has suggestions

// Inspect before sending
const { mode, reason, text, content, buttons } = await rich.buildPlain({ mode: 'auto' })

// Or flatten any sections yourself
renderAIRichSectionsAsText(sections, { title, footer })
buildPlainAIRichContent(text, { mode: 'interactive', buttons })
resolveAIRichCompatMode('auto', { hasButtons: true, supportsInteractive: false })

// Real bot proofs instead of the built-in placeholder
rich.setBotSignature({ certificateChain, signature })   // 64-byte Ed25519 signature
rich.aiVerification                                     // 'signed' | 'placeholder'
```

**The default is still `'rich'`** — existing Meta-AI sends are byte-for-byte unchanged.

### LID addressing, sync actions and the reconnect backlog

```js
// §2.103 — actions WhatsApp sends that have no event of their own
sock.ev.on('app-state.action', ({ name, type, id, action }) => {
  if (name === 'quickReplyAction') console.log('quick reply', action.shortcut)
})
// clearing a chat on the phone now reaches you as well
sock.ev.on('messages.delete', item => { if ('all' in item) store.clearChat(item.jid) })

// §2.104 — drain the stanza burst that follows a reconnect without blocking the event loop
const offline = makeOfflineNodeProcessor(handlersByType, {
  isOpen: () => sock.ws.isOpen,
  onUnexpectedError: (err, ctx) => logger.error({ err }, ctx)
}, 10)
offline.enqueue('message', node)
await offline.waitUntilIdle()     // offline.pending / offline.clear() / offline.draining

hasInteractiveBinaryNode(additionalNodes)  // we skip our own <biz> node if yours is there
```

LID-addressed chats are also sent to LID devices now and reuse the device cache instead of
firing a USync IQ per message, and a PN→LID session migration no longer depends on a warm
device-list cache (BUGREPORT 2.100 / 2.101).

### Peer messages and app-state key resync

```js
// §2.106 — relay any protocolMessage to your own devices (category: 'peer')
await sock.sendPeerMessage({ type: 7, appStateSyncKeyRequest: { keyIds } })
await sock.sendPeerMessage(content, { pushPriority: 'low', appdata: 'critical_block' })

// ask the phone to re-share app-state sync keys you are missing
await sock.requestAppStateKeyResync([keyIdBuffer, 'base64KeyId', { keyId }])
```

> **ffmpeg:** the transcoding paths (`videoToJpeg`, `convertToOpusBuffer`, video thumbnails) are
> covered by 7 tests that run only when a real binary is available — set `FFMPEG_PATH`, install
> `ffmpeg-static`, or have `ffmpeg` on `PATH`. A clip shorter than the thumbnail seek point no
> longer yields an empty thumbnail (2.105), and ending a call can no longer leave ffmpeg running (2.107).

### Pictures and business details in one query

```js
import { USyncQuery, USyncUser } from '@japofc/baileys'

const query = new USyncQuery().withPictureProtocol('image').withBusinessProtocol()
for (const jid of memberJids) query.withUser(new USyncUser().withId(jid))

const { list } = await sock.executeUSyncQuery(query)   // one round trip, not 300
list[0].picture   // { id, url, directPath, hash, type }
list[0].business  // { verifiedName, address, businessHours, catalogExists, cartEnabled }
```

### Link previews through your own fetcher

```js
import { getUrlInfo } from '@japofc/baileys'

const info = await getUrlInfo('https://example.com/post', {
	fetcher: (url, options) => myCachingProxy.preview(url, options) // optional; defaults to link-preview-js
})
info.title            // a page with no image still gives you a preview
info.jpegThumbnail    // undefined instead of a thrown TypeError
```

### Catalogue, in full

```js
const { products, pages, truncated } = await sock.getCatalogAll({ jid: bizJid, pageSize: 50 })
products[0].availability   // 'in stock' | 'out of stock' | … — read from the node, not assumed
products[0].price          // undefined for "price on request" listings (never NaN)
```

### Split bills & payment reminders

```js
// the money is human; the wire scaling is done for you
await sock.sendSplitPayment(groupJid, {
  splitId: 'dinner-1', total: 300_000, currency: 'IDR', description: 'Makan malam',
  requesterJid: me,
  participants: [{ jid: a, amount: 100_000, status: 'PAID' }, { jid: b }, { jid: c }]
}, { splitEvenly: true })               // b and c share what is left — parts always add up

await sock.sendSplitPaymentUpdate(groupJid, { splitId: 'dinner-1', participantJid: b })
await sock.sendPaymentReminder(jid, {
  reminderId: 'rent', amount: 1_500_000, currency: 'IDR', frequency: 'MONTHLY', payerJid: b
})

// reading them back
const paid = readSplitPaymentMessage(msg.message)   // { total, participants, settled, outstanding, complete }
readPaymentMessage(msg.message)                     // { type: 'split' | 'splitUpdate' | 'reminder', value }
```

> Builders only: `buildSplitPaymentMessage()`, `buildSplitPaymentUpdateMessage()`,
> `buildPaymentReminderMessage()`, `wireMoney()` / `readWireMoney()`, and
> `toSplitPaymentMessage()` to lift the older in-app bookkeeping object (`buildSplitPayment()`
> in `Utils/payment.js`) into something sendable.

### Group sender-key rotation

```js
// drop our outgoing group key + its distribution memory, so the next send mints a new one
const { rotated } = await sock.rotateGroupSenderKey('1203630000@g.us')

// low-level primitive
await sock.signalRepository.rotateSenderKey({ group, meId })
```

> Membership changes (removals, demotions, leaves) now rotate the key automatically. Before
> v2.4.9 only the "who already got the key" bookkeeping was cleared, so the next send
> re-distributed the **same** key and a member you had just removed kept being able to decrypt
> the group (2.108). Call `rotateGroupSenderKey()` by hand after any out-of-band removal.

> Two more group-crypto fixes landed with it, neither of which changes an API: a late or
> out-of-order group message used to be **permanently undecryptable** (2.110), and the sender
> chain ratcheted twice per message, bloating the sender-key record with a dead key per send
> and rewriting it on every message (2.109). Existing auth files keep working as-is.

## 📝 Patch Notes Archive

> The full, current release history lives in **[CHANGELOG.md](../CHANGELOG.md)**. Older per-version summaries are archived below.

<details>
<summary><b>📜 Show archived patch notes (v2.4.3 → V4)</b></summary>

<br/>

### v2.4.2 & v2.4.3

> Summary — full details in [CHANGELOG.md](../CHANGELOG.md).

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

> Summary — full details in [CHANGELOG.md](../CHANGELOG.md).

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
