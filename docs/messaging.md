# Sending messages

[← back to the README](../README.md)

## 💡 Usage Examples

### Buttons & Native Flow

```js
import { Button } from '@japofc/baileys'

await new Button(sock)
    .setTitle('Promo Spesial')
    .setBody('Diskon 20% cuma hari ini')
    .setFooter('@japofc/baileys')
    .addReply('Klaim Sekarang', 'claim_promo')
    .addUrl('Lihat Katalog', 'https://example.com/catalog')
    .addCall('Hubungi Kami', '628123456789')
    .send(jid)
```

### Poll

```js
import { Poll } from '@japofc/baileys'

await new Poll(sock)
    .setName('Mau makan apa hari ini?')
    .addOptions(['Fried Rice', 'Chicken Noodles', 'Meatballs'])
    .setSelectable(1)
    .send(jid)
```

> **v2.4.7** — the poll builder now validates before it sends. Duplicate options are
> rejected (poll results are bucketed by option text, so duplicates used to merge into
> one result), `setEndDate()` throws on an unparseable date instead of wiring
> `endTime: NaN`, and `setQuiz()` can no longer be combined with
> `setAnnouncementGroup()` (that path emits `pollCreationMessageV2`, which has no
> `correctAnswer` field, so the quiz was silently dropped). Quiz polls are also finally
> readable: `getAggregateVotesInPollMessage()` now recognises `pollCreationMessageV5`.

```js
const poll = new Poll(sock)
    .setName('Quiz: ibu kota Indonesia?')
    .addOptions(['Jakarta', 'Bandung', 'Surabaya'])
    .setQuiz('Jakarta')

poll.validate()        // [] when safe to send — collects every problem at once
poll.assertValid()     // throws the first problem (build()/send() run this for you)
poll.countOptions()    // 3
poll.getOptions()      // ['Jakarta', 'Bandung', 'Surabaya'] (a copy)
poll.removeOption('Surabaya')
Poll.MAX_OPTIONS       // 12 — enforced, like MAX_NAME_LENGTH (255) / MAX_OPTION_LENGTH (100)

await poll.send(jid)
```

### Carousel

> Cards are usually built with `Button(...).toCard()` first. Media cards work as before, and v2.4.7 also allows valid text/button-only carousel cards (WhatsApp renders them) via `addTextCard()` or a `Button(...).toCard()` card with no media header.

```js
import { Button, Carousel } from '@japofc/baileys'

const cardA = await new Button(sock)
    .setImage('https://example.com/a.jpg')
    .setTitle('Produk A')
    .addUrl('Lihat', 'https://example.com/a')
    .toCard()

const cardB = await new Button(sock)
    .setImage('https://example.com/b.jpg')
    .setTitle('Produk B')
    .addUrl('Lihat', 'https://example.com/b')
    .toCard()

await new Carousel(sock)
    .setBody('Pilih salah satu produk di bawah ini')
    .addCard([cardA, cardB])
    .send(jid)

// Text/button-only card, no image required:
await new Carousel(sock)
    .setBody('Quick actions')
    .addTextCard({
        title: 'Support',
        text: 'Choose an action',
        buttons: [
            { id: 'faq', text: 'FAQ' },
            { webview: 'https://example.com/help', text: 'Open Help' }
        ]
    })
    .send(jid)
```

### AIRich — rich response cards

```js
import { AIRich } from '@japofc/baileys'

await new AIRich(sock)
    .addHeading('Order Summary')
    .addText('Your order is being processed.')
    .addTable([
        ['Item', 'Qty'],
        ['Iced Latte', '2']
    ])
    .addTip('Orders are usually ready in 15 minutes')
    .addSuggest('Track Order')
    .send(jid)
```

For the common case, v2.4.7 also exports a one-liner wrapper around the same builder:

```js
import { sendJapRich, jap } from '@japofc/baileys'

await sendJapRich(sock, jid, {
    title: 'Order Summary',
    markdown: '# Paid\nYour order is being processed.',
    actions: { text: 'Track', url: 'https://example.com/order/123' },
    suggestions: ['Track Order', 'Contact Support']
})

// Or keep chaining after the shortcut builds the card:
await jap(sock, '# Quick Report').addTip('Generated now').send(jid)
```

Neutral aliases (`sendRich`, `Rich`, `createRich`, `buildRich`) remain available, but the JAP-branded helpers (`jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich`) are the preferred names for new code.

**Since v2.4.8 the socket speaks rich directly** — no free function, no passing `sock` around:

```js
await sock.sendJapRich(jid, { title: 'Order Summary', markdown: '# Paid', suggestions: ['Track'] })
await sock.sendJapTable(jid, [['Item', 'Qty'], ['Coffee', '2']], { title: 'Cart' })
await sock.sendJapLatex(jid, 'E = mc^2')

// sendMessage() routes these shapes too
await sock.sendMessage(jid, { table: [['Item', 'Qty'], ['Coffee', '2']], title: 'Cart' })
await sock.sendMessage(jid, { latex: '\\frac{a}{b}' })
await sock.sendMessage(jid, { jap: { markdown: '# Hi', suggestions: ['More'] } })
```

`sendRich` / `sendTable` / `sendLatex` are neutral aliases of the three socket methods, and
`{ disableJapyea: true }` opts a call out of the auto-routing layer entirely.

The one-liner now covers **every** AIRich primitive — `latex`, `task(s)`, `widget(s)`,
`progressStatus`, `thinking`, `quotaUpsell`, `bloks`, `reels`, `post(s)`, `product(s)`,
`socialEntity`, `inlineVideo`, `contentItems`, `generating` — and a key it does not recognise
is now an error with a suggestion (`unknown key 'tabel' (did you mean 'table'?)`) instead of
a silently blank card. Pass `{ allowUnknown: true }` to carry your own extra fields through,
and import `ONE_LINER_KEYS` if you want to validate input yourself.

`AIRich` supports `{ id, insertAt }` on every `add*()`/`set*()` call, so you can insert a block relative to one you added earlier instead of always appending to the end — handy for streaming/edit-in-place style responses combined with `sendEdit(jid, id)`.

**`streamText()` — the "AI typing" effect.** One bubble that grows via in-place edits (exactly how Meta AI streams its answers), instead of flooding the chat:

```js
// sends once, then patches the same bubble until the full text is out
await new AIRich(sock).streamText(jid, longAnswer, {
    chunkSize: 120,  // ~chars per reveal (split at word boundaries)
    intervalMs: 900, // pause between edits (min 300)
    cursor: ' ▍'     // shown while streaming, removed at the end ('' disables)
})
// works alongside other blocks too: addHeading()/addTable() first, then streamText()
```

**`readRichMessage()` — the reader half.** Parse a received rich card (from any AI/assistant-style bot) back into structured blocks instead of staring at opaque proto:

```js
import { readRichMessage } from '@japofc/baileys'

sock.ev.on('messages.upsert', ({ messages }) => {
    const rich = readRichMessage(messages[0])
    if (!rich.found) return
    rich.blocks      // [{ type: 'heading', text }, { type: 'code', language, code },
                     //  { type: 'table', rows, headerRows }, { type: 'text', text, entities }, …]
    rich.suggestions // every suggestion-pill text
    rich.text        // flat text rendering of the whole card
})
```

Handles both wire forms (unified-response payload + proto submessages fallback), resolves inline link entities back to `[label](url)`, re-joins syntax-highlighted code spans, never throws — non-rich input returns `{ found: false }`. Round-trip tested against the AIRich builder itself.

Other builders worth knowing about: **`ButtonV2`** (simpler quick-reply-only buttons), **`ButtonV3`** (`loadFrom(msg)` to edit an existing template message in place), and **`Toolkit`** (static helpers: `Toolkit.resize()`, `Toolkit.fetchBuffer()`, `Toolkit.waitAllPromises()`, `Toolkit.extractIE()` for parsing `[label](url)` links/citations/LaTeX out of plain text).

### 📁 Builders Folder Map (`lib/Builders/`)

Every message builder lives in its own file under `lib/Builders/`, so you can trace exactly where a class comes from instead of digging through one giant `MessageBuilder.js`. `index.js` is just the barrel file that re-exports everything below (plus their aliases) for the top-level `import { ... } from '@japofc/baileys'` syntax.

| File | Exports | What it's for |
|---|---|---|
| `shared.js` | `Toolkit`, `BaseBuilder`, `RowBuilder` | The shared foundation every other builder is built on. `BaseBuilder` holds the common chainable `send()`/context-info plumbing, `RowBuilder` is the shared row/section helper, and `Toolkit` is the static-helper grab bag (`resize`, `fetchBuffer`, `waitAllPromises`, `extractIE`, media-duration/preview helpers). Nothing here is meant to be instantiated directly in bot code — it exists so `Button`, `Poll`, `Carousel`, etc. don't each reimplement the same plumbing. |
| `Button.js` | `Button`, `CardBuilder` | The main interactive/native-flow button builder — headers (image/video/document), CTA helpers (`addUrl`, `addCall`, `addReply`, and the wider native-flow set), and `.toCard()` to turn a button message into a `Carousel` card. |
| `ButtonV2.js` | `ButtonV2` | A lighter-weight legacy `buttonsMessage` variant limited to up to 3 quick-reply buttons — includes `validate()`/`assertValid()`, `countButtons()`/`getButtons()`/`clearButtons()`, and relays with the same canonical `getBizBinaryNode()` envelope as the socket path. |
| `ButtonV3.js` | `ButtonV3` | Built around `loadFrom(msg)` — loads an existing `templateMessage` (e.g. one you fetched or that was quoted) so you can edit it in place. Also validates hydrated quick-reply/url/call buttons and relays with the canonical biz node. |
| `Carousel.js` | `Carousel` | Chains `Button(...).toCard()` results into a swipeable card carousel. Accepts media cards and text/button-only cards (`addTextCard()`), validates before send, and is capped at `Carousel.MAX_CARDS` (10) since WhatsApp silently truncates anything beyond that. |
| `Poll.js` | `Poll` | Poll/vote message builder — question, options, single/multi-select, hidden-voter mode, correct-answer marking, expiry. |
| `AIRich.js` | `AIRich` (+ aliases `ORich`, `AIJap`, `LeafRich`, `JapAI`, `JapRich`, `RichJap`) | The rich AI-assistant-style response builder described above — headings, formatted text, tables, media/product/post cards, task/progress cards, tip banners, quick-reply suggestions. |
| `Rich.js` | `jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich` (+ neutral aliases `Rich`, `createRich`, `buildRich`, `sendRich`) | One-liner convenience wrapper over `AIRich` for common cards (`markdown`, `text`, `actions`, `suggestions`, media, etc.) without replacing the full chainable builder. |
| `A2UI.js` | `A2UI`, `sendA2UIWidget` | Lower-level A2UI/Bloks widget builder. Builds the flat `components` tree (Column/Row → `children`, Card/Button → `child`, Modal → `trigger`/`content`) that Bloks widgets expect and sends it through the same `getBizBinaryNode()` path as `Button`/`ButtonV2`, so the wire-level node always matches the button names actually sent. |
| `JapBaileys.js` | `JapBaileys` | A unified builder **hub** — one object that wraps all the builders above behind short method names (`.button()`, `.buttonV2()`, `.buttonV3()`, `.carousel()`, `.poll()`, `.airich()`, `.rich()`, `.a2ui()`), plus PascalCase aliases (`.Button()`, `.Carousel()`, `.Poll()`, `.AIRich()`, `.Rich()`, `.A2UI()`) for developers who prefer that naming style. |
| `index.js` | everything above, plus `MESSAGE_BUILDER_VERSION` | The barrel file — re-exports every builder and its aliases so `import { Button, Poll, AIRich, JapBaileys } from '@japofc/baileys'` works without reaching into individual files. `MESSAGE_BUILDER_VERSION` tracks the builder API surface's own version, independent of the package version. |

**Unified hub example** — useful if you'd rather carry one object around than import each builder individually:

```js
import { JapBaileys } from '@japofc/baileys'

const vx = new JapBaileys(sock)

await vx.button()
    .setTitle('Promo Spesial')
    .addReply('Klaim Sekarang', 'claim_promo')
    .send(jid)

await vx.poll()
    .setName('Mau makan apa hari ini?')
    .addOptions(['Fried Rice', 'Chicken Noodles'])
    .send(jid)
```

---

### 📌 Pin / Keep in Chat

```js
// Pin a message for 7 days (default 24h), unpin, keep / unkeep in disappearing chats
await sock.sendPin(jid, msg.key, { durationSec: 7 * 86400 })
await sock.sendUnpin(jid, msg.key)
await sock.sendKeep(jid, msg.key)
await sock.sendUnkeep(jid, msg.key)
```

### 📅 Event

```js
await sock.sendEvent(jid, {
    name: 'Weekly Meeting',
    description: 'Bahas progres bot',
    startDate: new Date('2026-09-15T10:00:00+07:00'),
    endDate: new Date('2026-09-15T11:00:00+07:00'),
    location: { name: 'Office', address: 'Jakarta' },
    extraGuestsAllowed: true
})
```

### 📞 Scheduled Call

Native scheduled-call message (the "Schedule call" card with a join reminder):

```js
// 'voice' (default) or 'video'
await sock.sendScheduledCall(jid, {
    title: 'Daily standup',
    scheduledAt: new Date('2026-09-15T09:00:00+07:00'),
    callType: 'video'
})

// Cancel it later (needs the creation message's key)
await sock.cancelScheduledCall(jid, creationMsg.key)
```

### 📱 Mini App

Two modes — pass `url`, `flow`, or both (two buttons):

```js
import { sendMiniApp } from '@japofc/baileys'

await sendMiniApp(sock, jid, {
    title: 'My Mini App',
    body: 'Tap the button to open the app 👇',
    // 1) webview mode: rich card + CTA opening your web app
    //    (in-app webview when supported, else the browser)
    url: 'https://myapp.example.com',
    params: { ref: 'wa-bot' }, // → appended as ?ref=wa-bot
    buttonText: '🚀 Open App',
    // 2) Flows mode: TRUE native in-chat mini app (forms/screens inside
    //    WhatsApp, no browser). Needs a published Flow ID from Flows Manager.
    flow: { id: '123456789', cta: '📝 Isi Form', screen: 'WELCOME' },
    thumbnail: 'https://myapp.example.com/icon.png' // url or Buffer
})
// or as a socket method: await sock.sendMiniApp(jid, { ... })
```

---

## 📨 Message Helpers

High-level one-liners for modern message types — validated, with friendly aliases:

```js
await sock.sendLocation(jid, { lat: -6.2, lng: 106.8, name: 'Jakarta' });
await sock.sendContact(jid, { name: 'John', vcard: 'BEGIN:VCARD\n...' });
await sock.sendGroupInvite(jid, { code: 'AbC123', jid: groupJid, subject: 'Community' });
await sock.sendPaymentRequest(jid, { currency: 'IDR', amount: 50000, note: 'coffee ☕' });
await sock.sendInvoice(jid, { note: 'INV-001' });
await sock.sendPollOption(jid, pollKey, ['New option']);
await sock.sendEventInvite(jid, { eventTitle: 'Party', startTime: new Date(...) });
await sock.sendNewsletterInvite(jid, { newsletterJid, newsletterName: 'News' });

// Poll upgrades (already wired end-to-end):
await sock.sendPoll(jid, {
  name: 'Jam berapa?', values: ['Pagi', 'Sore'],
  endDate: new Date('2026-09-16T00:00:00Z'), // auto-close
  hideVoter: true,      // anonymous poll
  canAddOption: true,   // voters may add options
});
```

Music messages are experimental — the proto is correct but interop with official
clients is unverified (see [Honestly not implemented](#honestly-not-implemented-and-why)):

```js
await sock.sendMusic(jid, { songUri, artworkUri, embeddedMusic: { songId, title, author } });
```

**Escape hatch:** every content key also works inline via `sendMessage`, and `{ raw: true, <AnyMessageField>: {...} }`
passes any proto field through untouched — full `WAProto` coverage with zero wrapper lag:

```js
await sock.sendMessage(jid, { raw: true, musicMessage: { songUri } });
```

TypeScript consumers get a typed `AnyMessageContent` (`import type { AnyMessageContent } from '@japofc/baileys'`).

## 🧰 Channels, History & Transcripts

**Channel management** (live queries):

```js
await sock.newsletterDelete(channelJid)
await sock.newsletterAdminCount(channelJid)
await sock.newsletterJoinInvite('invite-code')
await sock.newsletterChangeOwner(channelJid, newOwnerJid) // experimental
await sock.communityGetInviteCode(communityJid)
// ...plus existing follow/unfollow/mute/react/fetch + full community CRUD
```

**Group history sharing** for new members (forwards recent messages to their DM):

```js
import { getGroupHistoryFromStore } from '@japofc/baileys'
const messages = getGroupHistoryFromStore(store, groupJid, 10)
await sock.shareGroupHistory({ groupJid, members: newMemberJid, messages, greeting: true })
```

**Voice-note transcription** (pluggable provider — cloud Whisper or your own):

```js
import { openAIWhisperProvider } from '@japofc/baileys'
const provider = openAIWhisperProvider({ apiKey: process.env.OPENAI_API_KEY })
const { text } = await sock.transcribeMessage(voiceNoteMsg, { provider })
```

**Mini-app deep links** (HMAC-signed params your web app can verify):

```js
import { createMiniAppLink, parseMiniAppParams, buildFlowDataExchange } from '@japofc/baileys'
const link = createMiniAppLink('https://app.example.com/', { uid: '123' }, { secret: 's3cr3t' })
parseMiniAppParams(link, { secret: 's3cr3t' }) // → { uid: '123' } (throws if tampered)
buildFlowDataExchange('navigate', { screen: 'HOME' }) // Flows data_exchange payload
```

**A2UI widgets** now include `Slider`, `Switch`, `List`, `ProgressBar`, `Avatar`,
`Badge`, `Spacer`, and `Tabs` alongside the existing Text/Image/Video/Button/Card/Modal
set (all ref-validated at `build()`).
