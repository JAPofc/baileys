# Utility modules

[← back to the README](../README.md)

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

`npm test` runs the offline suite (`tests/`, 1226 tests, no network needed).

---

## 🧩 Utility Modules

<details>
<summary><b>📖 Show the full utility-module reference</b> — 140+ helpers across <code>lib/Utils</code></summary>

<br/>

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
| `session-tools` | Session doctor — analyze/repair auth folders, portable session-string export/import, cross-backend migration |
| `shutdown` | Graceful shutdown manager — creds flushed first, ordered hooks, signal handling, run-once |
| `conversation-flow` | Multi-step wizards per user — prompts, validation, cancel words, timeouts |
| `webhook-bridge` | POST socket events to any HTTP endpoint — HMAC signatures, retries with backoff |
| `wa-links` | Build/parse wa.me, group-invite & channel URLs; extract URLs from text |
| `media-probe` | Pure-JS image format + dimensions (PNG/JPEG/GIF/WebP/BMP) — no image library |
| `media-guard` | Block media types per chat ("no stickers here") — per-chat rules, auto-delete |
| `health-monitor` | Process health — memory, event-loop lag, custom probes, threshold alerts |
| `text-extras` | Read-more collapse, progress bars, human durations/sizes, chunking, markdown escape, fuzzy distance |
| `reminders` | "!remind 10m …" — parseDuration, timers, restart-safe persistence (overdue fire late) |
| `quota` | Daily usage limits per user with tiers — midnight reset, bonuses, exhausted events |
| `tiers` | Premium/VIP memberships with expiry — extend/stack, lifetime, expiry sweeper |
| `todo` | Shared task lists per chat — assignees, ☐/☑ render, mentions, persistence |
| `url-watcher` | Poll any URL, alert on content change — extract views, SHA-256 diffing |
| `bug-shield` | Detect crash/"bug" messages — mention bombs, zalgo, invisible floods, RTL spoofing; sanitizeText |
| `crash-guard` | Survive uncaught exceptions/rejections — owner alerts, counters, safeStringify |
| `connection-watchdog` | Catch silent half-open sockets — stale alerts fire once, re-armed by activity |
| `secure-logger` | Credential-redacting pino logger + redactSensitive() for any object |
| `call-log` | Call history + per-caller stats from the `call` event — outcomes, durations, persistence |
| `always-online` | Keep the green dot lit — presence refresher with live switching and failure counters |
| `status-watcher` | Receive-side stories — per-contact filters, media type, download hook |
| `button-extras` | quickButtons, sendConfirm (yes/no), sendMenuButtons one-liners |
| `random-tools` | Dice notation, coins, weighted picks, deterministic rate/"jodoh" meters |
| `jid-extras` | phone↔jid conversions, device-insensitive compare, pretty phone printing |
| `time-tools` | Relative times ('5m ago'), clocks, next-occurrence, overnight windows, greetings |
| `group-tools` | Pure groupMetadata helpers — admins, owner, stats, participant diffs, info card |
| `msg-tools` | messageTypeOf, quoted info, timestamps, one-line message previews |
| `kv-store` | Tiny JSON key-value DB — namespaces, counters, debounced atomic saves |
| `warmup` | Account warmup — ramp daily send volume on fresh numbers (20→50→…→unlimited) |
| `disconnect-classifier` | Close errors → category + recommended action (reconnect / re-pair / stop) |
| `group-op-guard` | Stay under WhatsApp's group-action ceilings (~3 adds & 2 creates per 10 min) |
| `giveaway` | Keyword-entry raffles — fair draws, multi-winner, deadlines, status cards |
| `attendance` | Daily roll-call ("absen") — check-in times, missing list, numbered render |
| `auction` | Timed bidding ("lelang") — min increments, anti-snipe extensions, outbid alerts |
| `text-poll` | Vote-by-number polls that work in every client — tallies, bars, tie handling |
| `tictactoe` | XO duels — challenge/accept, emoji boards, win/draw/forfeit |
| `rps` | Rock-paper-scissors ("suit") — hidden picks, batu/gunting/kertas aliases, bets |
| `word-games` | scrambleWord, math-problem generator, "sambung kata" word-chain engine |
| `rental` | Per-chat bot rentals ("sewa") — trials, expiry warnings, unrented-group filter |
| `message-counter` | Daily per-user activity — top chatters, 🥇 digests, day history |
| `command-lock` | Disable commands per chat/globally + maintenance mode with owner bypass |
| `status-tools` | Status auto-styling — random font/colors for text statuses, media/audio normalization (wired into status sends) |
| `newsletter-tools` | Paced batch channel ops — follow/unfollow/mute many with per-jid verdicts |
| `emoji-tools` | Detect/count/extract/strip emoji, themed randomEmoji |
| `array-tools` | chunk, unique-by, groupBy, sortBy, distinct sample, range |
| `validate-tools` | isUrl/isEmail, id/en parseBool, clamp, ensureArray, pickFields |
| `timing-tools` | debounce, throttle, lap stopwatch, measureTime |
| `task-queue` | Bounded-concurrency async jobs with retries — mass DM safe |
| `mask-tools` | maskPhone/maskEmail, boundary-aware censorText |
| `math-eval` | SAFE !calc parser (no eval) + terbilang (Indonesian spelling) + Roman numerals |
| `chat-settings` | Per-chat feature toggles with defaults — the !settings backbone, ✅/❌ cards |
| `voucher` | Generate & redeem codes (JAP-X7K2-9QMD) — max uses, expiry, once-per-user |
| `quiz` | Multi-question quiz sessions — running scores, skips, rankings |
| `socket-preflight` | validateSocketConfig — catch broken configs before cryptic 405s (auto-wired into makeWASocket) |
| `group-cache` | createGroupMetadataCache — TTL-LRU for `cachedGroupMetadata` with event-driven invalidation |
| `reputation` | +rep/-rep with per-giver cooldowns, leaderboards, rep cards |
| `invite-tracker` | Who invited whom — active-vs-total counts (join/leave loops don't pay), top-inviter boards |
| `level-rewards` | attachLevelRewards — auto payouts (balance/tier/custom) on level thresholds, once each |
| `marriage` | Propose/accept/divorce registry — strictly monogamous, anniversaries, couples list |
| `ai-groups` | ⚠️ EXPERIMENTAL: add/remove Meta AI in groups, createAiGroup — server-gated by Meta's per-account rollout (no flag = server rejects; nothing to verify manually) |
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
router.command('kick', handler, { adminOnly: true, category: 'Admin' })  // implies a group: refused in DMs
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

```js
// session & system tools
import {
    analyzeAuthState, repairAuthFolder,
    exportAuthToString, importAuthFromString, migrateFolderToAuthState,
    backupAuthStateRotating, createShutdownManager
} from '@japofc/baileys'

const report = await analyzeAuthState('./auth')     // session doctor
report.registered; report.counts; report.corrupted  // + issues list
await repairAuthFolder('./auth')                    // quarantine corrupted files

// ship the whole login as ONE string (SESSION_ID pattern) — keep it secret!
const sessionString = await exportAuthToString('./auth')
await importAuthFromString(sessionString, './auth') // on the new device

// move a folder session into ANY adapter (SQLite/Redis/Mongo/single-file):
const { state, saveCreds } = await useSQLiteAuthState('auth.db')
await migrateFolderToAuthState('./auth', state, saveCreds)

// timestamped encrypted backups that prune themselves:
await backupAuthStateRotating('./auth', './backups', { password, keep: 5 })

// change the auth password (or encrypt a legacy plaintext folder) without losing the session:
await rotateAuthPassword('./auth', { oldPassword: old, newPassword: next })
// → { rotated: 112, migratedFromPlaintext: 0, failed: [], skipped: [] }

const shutdown = createShutdownManager({ sock, saveCreds })
shutdown.register('close db', () => db.close())
shutdown.attach()                                   // SIGINT/SIGTERM → clean exit
```

```bash
# CLI: session management without writing code
npx @japofc/baileys session analyze ./auth
npx @japofc/baileys session repair  ./auth
npx @japofc/baileys session export  ./auth --out session.txt
npx @japofc/baileys session import  session.txt ./auth-new
```

```js
// wizards, webhooks, links, media tools & health
import {
    createConversationFlow, createWebhookBridge, buildWaMeLink, parseWaLink,
    getImageDimensions, createMediaGuard, createHealthMonitor
} from '@japofc/baileys'

const flows = createConversationFlow()
flows.define('order', [
    { id: 'item', prompt: 'What would you like?' },
    { id: 'qty', prompt: 'How many?', validate: t => /^\d+$/.test(t) || 'Numbers only!' }
])
flows.bind(sock)
await flows.start(sock, chat, sender, 'order')   // e.g. from a !order command
flows.onComplete(({ answers }) => console.log(answers.qty, 'x', answers.item))

const bridge = createWebhookBridge('https://my.server/hook', { secret, retries: 2 })
bridge.bind(sock)                                // messages → your backend/n8n

buildWaMeLink('+62 812-3456-7890', 'Hello!')     // https://wa.me/62812…?text=Hello%21
parseWaLink('https://chat.whatsapp.com/AbC…')    // { type: 'group-invite', code }

getImageDimensions(buffer)                       // { format: 'png', width, height }

const media = createMediaGuard({ blocked: ['sticker'], autoDelete: true })
media.bind(sock)                                 // "no stickers in this group"

const health = createHealthMonitor({ thresholds: { heapUsedMb: 400, eventLoopLagMs: 200 } })
health.onAlert(({ metric, value }) => sock.sendMessage(owner, { text: `⚠️ ${metric}: ${value}` }))
health.start()
```

```js
// security & stability hardening
import {
    createBugShield, sanitizeText, installCrashGuard,
    createConnectionWatchdog, createSecureLogger,
    exportAuthToString, checkAuthPermissions, hardenAuthFolder, autoReconnect
} from '@japofc/baileys'

const shield = createBugShield({ autoDelete: true })   // anti bug-message
shield.bind(sock)
shield.onDetected(({ sender, reasons }) => gate.banUser(sender, reasons.join(',')))
sanitizeText(dirtyText)                                // strips RTLO/zalgo/invisible flood

installCrashGuard({                                     // bot never dies silently
    onError: ({ type, error }) =>
        sock.sendMessage(owner, { text: `💥 ${type}: ${error?.message}` }).catch(() => {})
})

const watchdog = createConnectionWatchdog({ staleMs: 5 * 60_000 })
watchdog.bind(sock)
watchdog.onStale(() => sock.end(new Error('stale connection'))) // reconnect takes over
watchdog.start()

const logger = createSecureLogger()                     // creds NEVER hit the logs
const sock2 = makeWASocket({ auth: state, logger })

await exportAuthToString('./auth', { password })        // AES-encrypted JAPSESS2 export
await hardenAuthFolder('./auth')                        // chmod 700/600 everything
await checkAuthPermissions('./auth')                    // audit for leaks

autoReconnect(factory, {
    onGiveUp: ({ reason, attempts }) => notifyOwner(reason) // new: give-up hook + getStatus()
})
```

```js
// JAP AI cards from markdown, call tools, presence & button shortcuts
import { AIRich, createCallLog, createCallGuard, createAlwaysOnline,
         createStatusWatcher, quickButtons, sendConfirm } from '@japofc/baileys'

// whole AI card from one markdown string (headings/code/tables auto-detected)
await AIRich.fromMarkdown('# Report\n\n```js\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |', sock).send(jid)
new AIRich(sock).addChecklist([{ text: 'done item', done: true }, 'open item'])
    .addKeyValue({ Name: 'JAP', Version: '2.4.5' })
    .addProgressBar('Download', 70, 100)

const callLog = createCallLog()               // who called, outcome, duration
callLog.bind(sock)
createCallGuard({                              // quiet hours + hard blocks
    autoReject: true,
    schedule: { from: '22:00', to: '06:00' },  // reject only at night
    denylist: [spammer]                        // …except these: always
}).bind(sock)

createAlwaysOnline(sock).start()               // green dot stays lit
const statuses = createStatusWatcher()         // save contacts' stories
statuses.bind(sock)
statuses.onStatus(({ download }) => download())

await sendConfirm(sock, jid, 'Delete all data?')            // confirm_yes/confirm_no
await sendButtons(sock, jid, { text: 'Pick', buttons: quickButtons(['A', 'B']) })

// the 50+ round — grab-bag of daily drivers:
import { rollDice, matchScore, phoneToJid, prettyPhone, formatRelative,
         getGroupAdmins, diffParticipants, summarizeMessage, createKVStore } from '@japofc/baileys'

rollDice('2d6+3')                       // { rolls: [4, 2], total: 9 }
matchScore('budi', 'ani')               // 0-100, deterministic "jodoh meter"
phoneToJid('+62 812-3456-7890')         // 6281234567890@s.whatsapp.net
prettyPhone('6281234567890')            // +62 812-3456-7890
formatRelative(msg.timestamp)           // '5m ago'
getGroupAdmins(await sock.groupMetadata(jid))
summarizeMessage(msg)                   // '📷 image: caption…' for logs

const db = await createKVStore('./botdata.json')   // tiny persistent DB
db.namespace('settings').set(jid, { welcome: true })

// anti-ban pack — fresh numbers, sane group ops, smart reconnects
import { createAccountWarmup, classifyDisconnect, explainDisconnect,
         createGroupOpGuard, randomGaussian, createPresenceCycler } from '@japofc/baileys'

const warmup = createAccountWarmup({ startedAt: firstLoginTs })
if (warmup.trySend().allowed) await sock.sendMessage(jid, content)
// day 1 → 20 msgs, then 50, 100, 200, 400, 800, unlimited

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection !== 'close') return
    const verdict = classifyDisconnect(lastDisconnect)
    verdict.shouldReconnect ? restart() : console.log(explainDisconnect(lastDisconnect))
    // 🔑 [auth 401] Logged out from the phone — the session is gone, pair again.
})

const ops = createGroupOpGuard()
const safe = ops.wrap(sock)                        // guarded automatically
await safe.groupParticipantsUpdate(jid, users, 'add') // throws past ~3 adds/10min

await sleep(randomGaussian(2000, 600, { clamp: [500, 5000] })) // human-like pauses
createPresenceCycler(sock, { chats: [ownerJid] }).start()      // opt-in activity

// community events — giveaways, roll-calls, auctions, polls
import { createGiveaway, createAttendance, createAuction, createTextPoll } from '@japofc/baileys'

const giveaway = createGiveaway({ keyword: 'join' })
giveaway.bind(sock)
giveaway.start(chat, { prize: 'Voucher 50k', durationMs: 3600_000, winners: 2 })
giveaway.onEnd(({ winners }) => announce(winners))       // fair, injectable RNG

const absen = createAttendance()
absen.bind(sock)
absen.open(chat, { title: 'Absen Pagi 🌞' })             // members type "absen"
await sock.sendMessage(chat, { text: absen.render(chat), mentions: absen.getMentions(chat) })

const auction = createAuction()
auction.start(chat, { item: 'Akun ML', startBid: 50_000, minIncrement: 5_000, antiSnipeMs: 30_000 })
auction.bid(chat, user, 60_000)                          // → accepted / too-low / already-leading
auction.onEnd(({ winner, amount }) => sold(winner, amount))

const polls = createTextPoll()
polls.bind(sock)                                          // votes = plain "1".."9" replies
polls.start(chat, { question: 'Mabar jam?', options: ['19:00', '20:00', '21:00'] })
polls.onEnd(({ results }) => sock.sendMessage(chat, { text: polls.formatResults(results) }))

// games pack — duels & word games
import { createTicTacToe, createRPS, scrambleWord, generateMathProblem,
         createWordChain } from '@japofc/baileys'

const ttt = createTicTacToe()
ttt.challenge(chat, challenger, opponent); ttt.accept(chat, opponent)
ttt.play(chat, user, 5)                      // squares 1-9 → next/win/draw
await sock.sendMessage(chat, { text: ttt.render(chat) }) // ❌⭕3️⃣ emoji board

const suit = createRPS()
suit.challenge(chat, a, b, { bet: 5000 }); suit.accept(chat, b)
suit.pick(chat, a, 'batu')                   // picks stay hidden
suit.onResult(({ winner, loser, bet }) => eco.transfer(loser, winner, bet))

game.start(chat, { answer: scrambleWord('bandung') })       // acak kata
game.start(chat, generateMathProblem('hard'))               // 17 × 8 - 24 = ?
const chain = createWordChain()                             // sambung kata
chain.start(chat, { firstWord: 'makan' })
await chain.play(chat, user, 'nasi')         // ✅ n… — scores by word length

eco.rob(thief, victim)  // upgrade: wallet heists — bank money stays safe

// bot-business ops — rentals, activity, locks
import { createRentalManager, createMessageCounter, createCommandLock } from '@japofc/baileys'

const rental = createRentalManager()
rental.add(groupJid, { days: 30 }); rental.startTrial(newGroup, { days: 3 })
sock.ev.on('messages.upsert', rental.filter(handler)) // unrented groups ignored
rental.onExpiring(({ chat }) => remind(chat))          // renewal reminder (24h before)
rental.onExpire(({ chat }) => sock.groupLeave(chat))
rental.startSweeper()

const counter = createMessageCounter()
counter.bind(sock)
counter.renderDigest(chat)   // 🥇 @user — 42 pesan (daily top chatters)

const locks = createCommandLock({ owners: [ownerJid] })
locks.lock(chat, 'slot'); locks.lockGlobal('rob')
router.use(locks.middleware())                         // blocked before handlers run
locks.setMaintenance(true, { message: '🛠️ maintenance' }) // owners still pass

// MEGA UPGRADE SWEEP (36 upgrades across the whole toolkit):
// kv TTL + getOrSet · notes pinning 📌 · todo priorities 🔴🟡 · recurring
// reminders · warns.renderList · eco.getEconomyStats + eco.work() jobs ·
// shop.renderCatalog · tiers.extendAll (downtime compensation) ·
// quota.renderStatus · level PRESTIGE ⭐ · guess.revealHint('j_k__t_') ·
// ttt win/loss records + leaderboard · RPS best-of-3 series · giveaway
// canJoin requirements · attendance streaks · auction buy-now price ·
// poll renderLive bars · menfess.listActiveSessions · afk.renderAfkList ·
// shield.getReasonStats · gate.banMany (raid cleanup) · warmup.skip ·
// opGuard.waitAndAssert · watchdog autoRestart · health sparklines ▁▅▃█ ·
// router hidden commands + ctx.quotedText · i18n.addLanguages ·
// stats.renderTop · m.timestampMs · tag-all chunking for huge groups ·
// isForwarded/getForwardInfo · rental.renderList
//
// HUNT/UPDATE ROUND (fork ecosystem fully swept — 0 gaps left):
// WA version → live 2.3000.1048680055 · flow backWords ('kembali' rewinds) ·
// url-watcher ETag/304 conditional polling · health probe timeouts ·
// crash-guard alert throttling · webhook body caps · wa.me/message/CODE
// business links · formatParticipantChanges(➕➖⬆️⬇️) · boxText('MENU') ╔═╗ ·
// reminders.renderList

// conversation-flow upgrade: choice steps
flows.define('order', [{ id: 'size', prompt: 'Size:', choices: ['S', 'M', 'L'] }])
// renders numbered options; answers accepted by text OR number
// CLI: npx @japofc/baileys wa → package + baked WA Web version

// +18 upgrades: titleCase/slugify/generateId, shop.updateItem, notes.exportText,
// warns.getTop, stats.getTopChats, i18n.formatNumber/formatDate, levels.getRankPosition,
// quota.getAllUsage, tiers.renderStatus, birthday.renderUpcoming, guess.startNumberGame,
// flood.getTopFlooders, gate.listBans, health.setThreshold, watchdog.getReport

// 10 more upgrades: temp bans gate.banUser(jid, r, { expiresInMs }),
// flood autoMuteMs + isMuted, eco.applyInterest(0.01) bank interest,
// shop item maxPerUser, warns.decay(30d), levels.setMultiplier(2) XP events,
// quota.setLimit live, tiers.getExpiring(3d) renewal crons,
// reminders.snooze(id, 10m), todos.setDue + getOverdue (⏰ in render)
```

#### Group / community metadata helpers (v2.4.7)

```js
import { extractLIDPNPairs, GROUP_PARTICIPANTS_CHUNK_SIZE } from '@japofc/baileys'

// Every LID↔PN pair a metadata fetch already carries — normalized + deduplicated.
// The socket now stores these automatically on groupMetadata() /
// groupFetchAllParticipating() / communityMetadata(), so getLIDForPN() and
// getPNForLID() resolve group members without extra USync round-trips.
const meta = await sock.groupMetadata(jid)
extractLIDPNPairs(meta)        // [{ lid: '999@lid', pn: '628…@s.whatsapp.net' }, …]
extractLIDPNPairs(cachedMeta)  // pure + null-safe — works on cached metadata too

GROUP_PARTICIPANTS_CHUNK_SIZE  // 25 — participant arrays are chunked at this size
```

> Also fixed in v2.4.7: group metadata no longer returns `NaN` for `subjectTime` /
> `creation` / `descTime` when WhatsApp omits them (they're `undefined` now, so they
> don't persist as `null`), and community metadata finally reports `addressingMode`
> and honours the server's `size` attribute — both previously diverged from the
> group parser on identical payloads.

#### `w:gp2` group-notification helpers (v2.4.7)

```js
import { resolveNotificationActors, extractNotificationLIDPNPairs,
         parseNotificationParticipants } from '@japofc/baileys'

// Who did it, and to whom — resolved as a UNIT. Before v2.4.7 the two halves fell
// back independently, so a join request could report the requester's LID next to
// the admin's phone number.
const actors = resolveNotificationActors(notificationNode, actionChild)
// { actingLid, actingPn, actingUsername, affectedLid, affectedPn, affectedIsActor }

parseNotificationParticipants(actionChild)        // messageStubParameters shape
extractNotificationLIDPNPairs(node, actionChild)  // [{ lid, pn }] — consistent pairs only

// The socket now stores those pairs automatically on every group notification, and a
// stale pair can be dropped after a change-number event:
await sock.signalRepository.lidMapping.removeMapping('628…@s.whatsapp.net')
```

#### App-state sync diagnostics (v2.4.8)

```js
await sock.appStateSyncStatus()
// [ { name: 'critical_block', version: 0,  synced: false, mutations: 0 },
//   { name: 'regular_high',   version: 41, synced: true,  mutations: 183 }, … ]

await sock.appStateSyncStatus('regular_high')   // one collection
await sock.resyncAppState(['regular_high'], false)
```

`version` is what the next resync would ask the server to continue from, `synced` says whether
we hold any state for that collection at all, and `mutations` is how many index entries the
LT-hash is tracking — the three numbers you actually need when chat state (mute/archive/pin)
stops following your phone. Unknown collection names fail with a 400 instead of returning
nothing.

#### Partial media downloads (v2.4.8)

```js
// Sniff the real file type before committing to a 50 MB download
const head = await sock.downloadMediaHeader(msg, 32)          // first 32 plaintext bytes
const isMp4 = head.subarray(4, 8).toString() === 'ftyp'

// Any slice you like: { start, end } (end exclusive) or { start, length }
const slice = await sock.downloadMediaRange(msg, { start: 1_000_000, length: 65_536 })

// Resume an interrupted transfer — everything from byte N onwards
const rest = await sock.downloadMediaRange(msg, { start: bytesAlreadyOnDisk })
```

Both go through the same expired-media recovery as `sock.downloadMedia()` (a 410/404 asks the
phone to re-upload and retries once); pass `{ disableRetry: true }` to skip it. The standalone
functions `downloadMediaRange()` / `downloadMediaHeader()` are exported too. Ranges are
validated up front — a negative `start`, an empty window, or passing both `end` and `length`
fails with a 400 instead of a confusing stream error. (Before v2.4.8 a `startByte`-only range
resolved with **zero bytes**; see BUGREPORT 2.77.)

#### Media-connection and device-list helpers (v2.4.7)

```js
import { parseMediaConnNode, isMediaConnExpired, MEDIA_CONN_DEFAULT_TTL,
         dedupeJidsByUser, dedupeDeviceList } from '@japofc/baileys'

// The <media_conn> handshake, parsed safely. Before v2.4.7 a missing/non-numeric
// `ttl` became NaN, and `now - fetchDate > NaN * 1000` is false forever — so the
// upload connection was never refreshed again and kept using a stale auth token.
const media = parseMediaConnNode(mediaConnNode)
// { hosts, auth, ttl, fetchDate } — ttl is never NaN; falls back to 300s
MEDIA_CONN_DEFAULT_TTL              // 300

isMediaConnExpired(media)           // false while fresh
isMediaConnExpired({ ttl: NaN })    // true — anything unusable counts as expired

// Order-preserving dedup, as used by the USync device fan-out. Messaging your own
// number used to enumerate (and encrypt to) every one of your devices twice.
dedupeJidsByUser([{ jid: a }, { jid: a }, { jid: b }])   // → [a, b]
dedupeDeviceList(devices)  // keyed on user + device index; `u@s` === `u:0@s`
```

#### Reading USync errors (v2.4.7)

```js
import { extractUSyncErrors, hasUSyncQueryError, USyncQuery, USyncUser } from '@japofc/baileys'

const result = await sock.executeUSyncQuery(
    new USyncQuery().withContactProtocol().withUsers(
        new USyncUser().withPhone('+628111'),
        new USyncUser().withPhone('+628222')
    )
)

// Before v2.4.7 a refused query ("rate overlimit") parsed into an empty list that looked
// exactly like "nobody matched". The server's errors are now on the result.
result.errors            // [{ code: 479, text: 'rate overlimit' }]
hasUSyncQueryError(result.errors)   // true -> the whole query failed, don't trust `list`
                                    // false -> only individual users failed (entries carry `jid`)

extractUSyncErrors(rawIqNode)       // same extraction, standalone and null-safe

// onWhatsApp() now also accepts @lid arguments for real (they used to be dropped
// silently), always resolves to an array, and tells you which LID an entry came from:
await sock.onWhatsApp('628111@s.whatsapp.net', '99887766@lid')
// [{ jid: '628111@s.whatsapp.net', exists: true, lid: undefined }, …]
```

#### Store dictionary and participant-list helpers (v2.4.7)

```js
import { makeOrderedDictionary } from '@japofc/baileys'
import { upsertParticipants, removeParticipants, setParticipantsAdmin } from '@japofc/baileys'

// Restoring a snapshot used to replace the array but not the id index, so every
// message came back invisible to get() and re-upserting one appended a duplicate.
const dict = makeOrderedDictionary(m => m.key.id)
dict.fromJSON(JSON.parse(snapshot))
dict.get('AAA')          // the restored message, not undefined
dict.update(newVersion)  // true when it really updated (was always false)
dict.has('AAA')          // new in v2.4.7
dict.size()              // new in v2.4.7

// Participant-list mutations: order-preserving, non-mutating, and matching a person
// by `id` OR `phoneNumber` (the two halves of a LID<->PN pair are the same member).
upsertParticipants(list, [{ id: '2@lid' }])        // merges, never duplicates
setParticipantsAdmin(list, [{ id: '1@lid' }], null) // demote -> admin: null (not false)
removeParticipants(list, [{ phoneNumber: '628…@s.whatsapp.net' }])
```

#### Labels repository round-trip (v2.4.7)

```js
import { ObjectRepository } from '@japofc/baileys'

// toJSON() emits an array, but the constructor only understood a { id: entity } map, so
// feeding a snapshot back in produced entries keyed '0', '1', … and lost every label.
const labels = new ObjectRepository({ L1: { id: 'L1', name: 'Work' } })
const restored = ObjectRepository.fromJSON(JSON.parse(JSON.stringify(labels)))
restored.findById('L1')   // { id: 'L1', name: 'Work' } — not undefined
restored.hasId('L1')      // new in v2.4.7
restored.load([{ id: 'L2', name: 'Family' }])
restored.clear()
```

#### Chat-list classification (v2.4.7)

```js
import { classifyMessage, isMissedCallMessage, MISSED_CALL_STUB_TYPES } from '@japofc/baileys'

// Before v2.4.7 a missed call could never be a "real" message — the content check was
// ANDed over the stub-type allowances too — so it never moved its chat up the list.
classifyMessage(missedCallStub, meId)
// { isReal: true, isStub: true, isMissedCall: true, isAboutMe: false,
//   incrementsUnread: false, contentType: undefined }

classifyMessage(textMessage, meId).contentType   // 'conversation'
isMissedCallMessage(msg)                         // true for the 4 missed-call stubs
MISSED_CALL_STUB_TYPES                           // the table itself
```

#### Reading `messageStubParameters` (v2.4.7)

```js
import { parseStubParticipant, stubParticipantIdentities, stubParticipantsInclude } from '@japofc/baileys'

// Stub parameters are ragged: a JSON pair for some stub types, a plain jid for others.
parseStubParticipant('{"lid":"1@lid","pn":"2@s.whatsapp.net"}')  // { lid, pn }
parseStubParticipant('628111@s.whatsapp.net')                    // { phoneNumber }
stubParticipantIdentities(p)   // every jid this person can be addressed by

// "Is one of these people me?" — checks lid AND pn, so a LID-addressed group matches.
stubParticipantsInclude(msg.messageStubParameters, sock.user.id, sock.user.lid)
```

> Invite-link join requests now emit `group.join-request` as well (only the
> admin-add variant used to), so `createJoinRequestManager()` sees them.

```js
// the 20+ round: text tools, reminders, quotas, tiers, todos & more
import {
    readMore, progressBar, formatDuration, chunkText, similarity,
    parseDuration, createReminderManager, createQuotaManager,
    createTierManager, createTodoList, createUrlWatcher, getZodiac
} from '@japofc/baileys'

readMore('Promo!', 'long details…')       // collapses behind "Read more"
progressBar(70, 100)                      // ███████░░░ 70%
formatDuration(93_784_000)                // 1d 2h 3m
chunkText(longText, 4000)                 // split for WA limits

const reminders = createReminderManager()
reminders.add({ chat, user, text: 'angkat gorengan', inMs: parseDuration('10m') })
reminders.onDue(({ chat, user, text }) =>
    sock.sendMessage(chat, { text: `⏰ @${user.split('@')[0]} ${text}`, mentions: [user] }))

const tiers = createTierManager()
tiers.setTier(user, 'premium', { days: 30 })
const quota = createQuotaManager({ defaultLimit: 20, limits: { premium: 200 } })
if (!quota.consume(sender, tiers.getTier(sender)?.name).allowed) return ctx.reply('Jatah habis!')

const todos = createTodoList()
todos.add(chat, 'bayar wifi', { assignee: member })
await sock.sendMessage(chat, { text: todos.render(chat), mentions: todos.mentions(chat) })

const watcher = createUrlWatcher('https://api.example.com/status.json', { intervalMs: 60_000 })
watcher.onChange(({ body }) => sock.sendMessage(owner, { text: `🔔 changed: ${body.slice(0, 300)}` }))
watcher.start()

// upgrades: eco.deposit/withdraw + eco.getRank, levels.renderRankCard,
// router { onUnknownCommand } + router.remove, i18n.tn plurals,
// styleText 'negativeSquared'/'boldFraktur', getZodiac(17, 8) → 'Leo',
// guess-game near-miss hints, formatHealthSnapshot for owner DMs
```
| `stickerpack` | Build and send sticker packs (including animated/Lottie) |
| `templates` | Legacy WhatsApp Business template message helpers |
| `vcard` | Build vCard (contact card) payloads |
| `status` | Post and manage WhatsApp Status updates |
| `event-buffer` | Buffers/coalesces high-volume socket events for heavier bots |
| `doctor` | `checkEnvironment()` / `printEnvironmentReport()` — one-call environment diagnostics |

Every module above ships a matching `.d.ts`, so your editor will show full hover-docs regardless of which ones you import.

</details>

<div align="right"><sub><a href="#top">⬆ back to top</a></sub></div>

---
